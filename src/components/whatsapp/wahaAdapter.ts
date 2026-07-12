// WAHA (WhatsApp HTTP API) adapter — https://waha.devlike.pro/docs/overview/
// Kept in a standalone module so it can be edited or removed without touching
// the other WhatsApp providers (UAZ, Evolution, Wavoip, Meta).
//
// Design goals (see mem://features/architecture):
//   * NEVER call supabase.functions.invoke — WAHA speaks plain HTTP.
//   * Validate every payload we build with Zod, so serialization errors become
//     typed errors surfaced through the standard error path (not silent 500s).
//   * Every network call goes through `wahaFetch`, which enforces a timeout,
//     supports cancellation via AbortSignal and retries transient failures
//     with exponential backoff.

import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import type { WhatsAppConnection } from './types';
import type { WhatsAppProviderAdapter } from './adapters';
import { DEFAULT_WAHA_TEXT_TEMPLATE, renderWahaTemplate } from './wahaConfig';

// ────────────────────────────────────────────────────────────────────────────
// Zod schemas — the "contract" of what we send to WAHA. Exported so the
// contract tests can assert future provider edits stay compatible.
// ────────────────────────────────────────────────────────────────────────────
export const WahaChatIdSchema = z
  .string()
  .regex(/^[0-9]{4,20}@(c|g)\.us$/, 'chatId must be <digits>@c.us or @g.us');

export const WahaSendTextSchema = z.object({
  session: z.string().min(1),
  chatId: WahaChatIdSchema,
  text: z.string().min(1).max(4096),
  // Etapa 3 — quote/reply. WAHA accepts `reply_to` = provider messageId
  // (e.g. `false_5511...@c.us_ABCD1234`). Omitted when not replying.
  reply_to: z.string().min(1).optional(),
});

export const WahaSendMediaSchema = z.object({
  session: z.string().min(1),
  chatId: WahaChatIdSchema,
  file: z.object({
    mimetype: z.string().min(1),
    filename: z.string().min(1),
    data: z.string().min(1), // base64
  }),
  caption: z.string().max(1024).optional(),
});

export const WahaSendVoiceSchema = z.object({
  session: z.string().min(1),
  chatId: WahaChatIdSchema,
  file: z.object({
    mimetype: z.string().regex(/^audio\//, 'voice mimetype must be audio/*'),
    filename: z.string().min(1),
    data: z.string().min(1),
  }),
});

// WAHA reaction endpoint accepts `reaction: ""` to remove a previous emoji.
// `messageId` is the provider-native id (e.g. `false_5511...@c.us_ABCD1234`).
export const WahaSendReactionSchema = z.object({
  session: z.string().min(1),
  messageId: z.string().min(1),
  reaction: z.string().max(8), // single emoji or "" to clear
});

export type WahaSendTextPayload = z.infer<typeof WahaSendTextSchema>;
export type WahaSendMediaPayload = z.infer<typeof WahaSendMediaSchema>;
export type WahaSendVoicePayload = z.infer<typeof WahaSendVoiceSchema>;
export type WahaSendReactionPayload = z.infer<typeof WahaSendReactionSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
function normalizeUrl(raw?: string): string {
  const v = (raw || '').trim().replace(/\/$/, '');
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function normalizeChatId(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.includes('@') ? phone : `${digits}@c.us`;
}

async function writeWahaAudit(
  conn: WhatsAppConnection,
  input: {
    action: string;
    status: 'started' | 'success' | 'error';
    customerId?: string | null;
    wahaSessionId?: string | null;
    messageId?: string | null;
    errorMessage?: string | null;
    payload?: Record<string, any>;
  },
) {
  if (!conn.owner_id) return;
  try {
    const { data: authUser } = await supabase.auth.getUser();
    const userId = authUser?.user?.id;
    if (!userId) return;
    await (supabase as any).from('omnichannel_audit_logs').insert({
      owner_id: conn.owner_id,
      sub_company_id: conn.sub_company_id ?? null,
      user_id: userId,
      provider: 'waha',
      action: input.action,
      status: input.status,
      connection_id: conn.id,
      customer_id: input.customerId ?? null,
      waha_session_id: input.wahaSessionId ?? null,
      message_id: input.messageId ?? null,
      error_message: input.errorMessage ?? null,
      payload: input.payload ?? {},
    });
  } catch (e) {
    console.warn('[WAHA] audit log falhou', e);
  }
}

// Upload an outbound media/audio blob to the private `chat-media` bucket so
// the sender's UI can render the same player as the recipient sees. Returns
// null on failure — the message is still sent, we just lose local playback.
async function uploadOutboundToChatMedia(
  conn: WhatsAppConnection,
  blob: Blob | File,
  mimetype: string,
  filename: string,
): Promise<{ path: string; signedUrl: string; size: number } | null> {
  try {
    if (!conn.owner_id) return null;
    const ext = (filename.split('.').pop() || 'bin').toLowerCase().slice(0, 6);
    const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const path = `${conn.owner_id}/${conn.id}/out-${stamp}-${rand}.${ext}`;
    const { error: upErr } = await (supabase as any).storage
      .from('chat-media')
      .upload(path, blob, { contentType: mimetype, upsert: false });
    if (upErr) return null;
    const { data: signed } = await (supabase as any).storage
      .from('chat-media')
      .createSignedUrl(path, 60 * 60 * 24 * 30);
    if (!signed?.signedUrl) return null;
    return { path, signedUrl: signed.signedUrl, size: (blob as any).size ?? 0 };
  } catch {
    return null;
  }
}



async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = typeof (blob as any).arrayBuffer === 'function'
    ? await blob.arrayBuffer()
    : await new Response(blob as any).arrayBuffer();
  const buf = new Uint8Array(arrayBuffer);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)) as any);
  }
  // btoa exists in browsers + jsdom; fall back to Buffer for Node test envs.
  return typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
}

const RETRIABLE = /network|timeout|fetch|abort|econnreset|429|5\d{2}/i;

export interface WahaFetchOptions {
  method?: string;
  body?: any;
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
}

// Exported so unit tests can drive retry/timeout/cancel behaviour directly
// without going through sendMessage.
export async function wahaFetch(
  url: string,
  token: string,
  path: string,
  opts: WahaFetchOptions = {}
): Promise<any> {
  const { method = 'GET', body, timeoutMs = 10_000, retries = 2, signal } = opts;
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Compose caller signal + timeout signal via a fresh AbortController.
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal?.reason);
    if (signal) {
      if (signal.aborted) throw new DOMException('WAHA request cancelled', 'AbortError');
      signal.addEventListener('abort', onAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(new DOMException('WAHA timeout', 'TimeoutError')), timeoutMs);
    try {
      const res = await fetch(`${url}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Api-Key': token } : {}),
        },
        body: body != null ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
      if (!res.ok) {
        const msg = data?.message || data?.error || text || `WAHA HTTP ${res.status}`;
        const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        (err as any).status = res.status;
        // Only retry 429/5xx here; 4xx (except 429) is a client bug.
        if (attempt < retries && (res.status === 429 || res.status >= 500)) {
          lastErr = err;
        } else {
          throw err;
        }
      } else {
        return data;
      }
    } catch (err: any) {
      // User cancellation is never retried.
      if (signal?.aborted) throw new DOMException('WAHA request cancelled', 'AbortError');
      const msg = String(err?.message || err);
      const retriable = attempt < retries && (RETRIABLE.test(msg) || err?.name === 'TimeoutError');
      lastErr = err;
      if (!retriable) throw err;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
    // Exponential backoff (0 in tests → override retries=0 to skip).
    if (attempt < retries) {
      const delay = Math.min(2000, 200 * Math.pow(2, attempt));
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr ?? new Error('WAHA request failed');
}

// ────────────────────────────────────────────────────────────────────────────
// Adapter
// ────────────────────────────────────────────────────────────────────────────
export interface WahaSendOptions {
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
  /** Etapa 3 — provider messageId being quoted/replied. */
  replyTo?: string;
}

export class WahaAdapter implements WhatsAppProviderAdapter {
  private sessionOf(conn: WhatsAppConnection): string {
    return conn.metadata?.instance || conn.metadata?.session || 'default';
  }

  async getStatus(conn: WhatsAppConnection) {
    const url = normalizeUrl(conn.metadata?.url);
    const token = conn.metadata?.token || '';
    const session = this.sessionOf(conn);
    if (!url) return { connected: false, status: 'unconfigured', error: 'URL WAHA ausente' };
    try {
      const data = await wahaFetch(url, token, `/api/sessions/${encodeURIComponent(session)}`, {
        retries: 0,
        timeoutMs: 5_000,
      });
      const status = String(data?.status || data?.state || 'unknown');
      const connected = /working|connected|open|running/i.test(status);
      const phone = data?.me?.id || data?.me?.pushName || null;
      return { connected, status, phone, raw: data };
    } catch (err: any) {
      return { connected: false, status: 'error', error: err?.message || String(err) };
    }
  }

  async sendMessage(
    conn: WhatsAppConnection,
    customerId: string,
    content: string,
    _correlationId?: string,
    opts: WahaSendOptions = {}
  ) {
    const url = normalizeUrl(conn.metadata?.url);
    const token = conn.metadata?.token || '';
    if (!url) throw new Error('URL WAHA ausente.');

    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('phone')
      .eq('id', customerId)
      .single();
    if (custErr || !customer?.phone) throw new Error('Cliente sem telefone cadastrado.');

    // Apply agent-name template when the config toggle is on. Mirrors the
    // WAHA/Chatwoot App override `chatwoot.to.whatsapp.message.text`.
    let text = String(content ?? '');
    if (conn.metadata?.templates_with_agent_name) {
      try {
        const { data: authUser } = await supabase.auth.getUser();
        const agentName = authUser?.user?.user_metadata?.display_name
          || authUser?.user?.user_metadata?.full_name
          || authUser?.user?.email?.split('@')[0]
          || '';
        const tpl = conn.metadata?.language_overrides_text || DEFAULT_WAHA_TEXT_TEMPLATE;
        text = renderWahaTemplate(tpl, { content: text, chatwoot: { sender: { name: agentName } } });
      } catch { /* best-effort — never block send on template errors */ }
    }

    const rawPayload: Record<string, unknown> = {
      session: this.sessionOf(conn),
      chatId: normalizeChatId(customer.phone),
      text,
    };
    if (opts.replyTo) rawPayload.reply_to = String(opts.replyTo);
    const parsed = WahaSendTextSchema.safeParse(rawPayload);
    if (!parsed.success) {
      throw new Error(`WAHA payload inválido: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    await writeWahaAudit(conn, {
      action: 'send_text',
      status: 'started',
      customerId,
      wahaSessionId: parsed.data.session,
      payload: { chatId: parsed.data.chatId, length: parsed.data.text.length },
    });
    try {
      const data = await wahaFetch(url, token, '/api/sendText', {
        method: 'POST',
        body: parsed.data,
        // Snappier defaults: WAHA usually responds in <1s. Waiting 15s with 2
        // retries makes the UI sit on "enviando pelo servidor" forever whenever
        // WAHA is momentarily slow.
        timeoutMs: opts.timeoutMs ?? 8_000,
        retries: opts.retries ?? 1,
        signal: opts.signal,
      });
      const messageId = data?.id?._serialized || data?.id || null;
      await writeWahaAudit(conn, {
        action: 'send_text',
        status: 'success',
        customerId,
        wahaSessionId: parsed.data.session,
        messageId,
        payload: { chatId: parsed.data.chatId, raw: data },
      });
      return { ok: true, provider: 'waha', message_id: messageId, raw: data };
    } catch (e: any) {
      await writeWahaAudit(conn, {
        action: 'send_text',
        status: 'error',
        customerId,
        wahaSessionId: parsed.data.session,
        errorMessage: e?.message || String(e),
        payload: { chatId: parsed.data.chatId },
      });
      throw e;
    }
  }

  async sendMedia(conn: WhatsAppConnection, customerId: string, file: File, caption?: string) {
    const url = normalizeUrl(conn.metadata?.url);
    const token = conn.metadata?.token || '';
    if (!url) throw new Error('URL WAHA ausente.');

    const { data: customer } = await supabase
      .from('customers').select('phone').eq('id', customerId).single();
    if (!customer?.phone) throw new Error('Cliente sem telefone cadastrado.');

    // Validate session is actually WORKING before wasting a base64 upload —
    // this is why images/audios "aparecem enviados mas não chegam": WAHA answers
    // 200 to sendImage even when the underlying socket is FAILED/STOPPED.
    const st = await this.getStatus(conn);
    if (!st.connected) {
      throw new Error(`WAHA fora do ar (${st.status || 'desconhecido'}): reconecte a sessão antes de enviar mídia.`);
    }

    const rawPayload = {
      session: this.sessionOf(conn),
      chatId: normalizeChatId(customer.phone),
      file: {
        mimetype: file.type || 'application/octet-stream',
        filename: file.name || 'file',
        data: await blobToBase64(file),
      },
      ...(caption ? { caption } : {}),
    };
    const parsed = WahaSendMediaSchema.safeParse(rawPayload);
    if (!parsed.success) {
      throw new Error(`WAHA media inválida: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    // WAHA routes: /api/sendImage, /api/sendFile, /api/sendVideo — pick by mime.
    const mime = parsed.data.file.mimetype;
    const path = mime.startsWith('image/') ? '/api/sendImage'
      : mime.startsWith('video/') ? '/api/sendVideo'
      : '/api/sendFile';
    const mediaKind = mime.startsWith('image/') ? 'image'
      : mime.startsWith('video/') ? 'video'
      : mime.startsWith('audio/') ? 'audio'
      : 'document';

    // Mirror the outbound file into chat-media so the sender's UI can render
    // the same player as the recipient — done in parallel with the WAHA call
    // to keep latency minimal.
    const uploadPromise = uploadOutboundToChatMedia(conn, file, mime, parsed.data.file.filename);

    await writeWahaAudit(conn, {
      action: 'send_media',
      status: 'started',
      customerId,
      wahaSessionId: parsed.data.session,
      payload: { chatId: parsed.data.chatId, route: path, mimetype: mime, filename: parsed.data.file.filename },
    });
    try {
      const data = await wahaFetch(url, token, path, {
        method: 'POST',
        body: parsed.data,
        timeoutMs: 30_000,
      });
      const messageId = data?.id?._serialized || data?.id || data?.key?.id || null;
      if (!messageId) {
        const dbg = (() => { try { return JSON.stringify(data).slice(0, 500); } catch { return String(data); } })();
        throw new Error(`WAHA respondeu sem message_id (rota ${path}). Resposta: ${dbg}`);
      }
      const stored = await uploadPromise;
      await writeWahaAudit(conn, {
        action: 'send_media',
        status: 'success',
        customerId,
        wahaSessionId: parsed.data.session,
        messageId,
        payload: { chatId: parsed.data.chatId, route: path, mimetype: mime, raw: data, media_path: stored?.path },
      });
      return {
        ok: true,
        provider: 'waha',
        message_id: messageId,
        media_url: stored?.signedUrl ?? null,
        media_path: stored?.path ?? null,
        media_type: mediaKind,
        media_mime: mime,
        media_filename: parsed.data.file.filename,
        media_size: stored?.size ?? null,
        raw: data,
      };
    } catch (e: any) {
      await writeWahaAudit(conn, {
        action: 'send_media',
        status: 'error',
        customerId,
        wahaSessionId: parsed.data.session,
        errorMessage: e?.message || String(e),
        payload: { chatId: parsed.data.chatId, route: path, mimetype: mime },
      });
      throw e;
    }
  }

  async sendAudio(conn: WhatsAppConnection, customerId: string, blob: Blob) {
    const url = normalizeUrl(conn.metadata?.url);
    const token = conn.metadata?.token || '';
    if (!url) throw new Error('URL WAHA ausente.');

    const { data: customer } = await supabase
      .from('customers').select('phone').eq('id', customerId).single();
    if (!customer?.phone) throw new Error('Cliente sem telefone cadastrado.');

    const st = await this.getStatus(conn);
    if (!st.connected) {
      throw new Error(`WAHA fora do ar (${st.status || 'desconhecido'}): reconecte a sessão antes de enviar áudio.`);
    }

    // WhatsApp voice notes MUST be OGG/Opus. Browsers record audio/webm;codecs=opus by
    // default, and WAHA returns 200 for webm but the message never reaches the
    // recipient. Coerce the container hint to audio/ogg so WAHA re-muxes it.
    const rawPayload = {
      session: this.sessionOf(conn),
      chatId: normalizeChatId(customer.phone),
      file: {
        mimetype: 'audio/ogg; codecs=opus',
        filename: 'voice.ogg',
        data: await blobToBase64(blob),
      },
    };
    const parsed = WahaSendVoiceSchema.safeParse(rawPayload);
    if (!parsed.success) {
      throw new Error(`WAHA voice inválido: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    // Upload the sender's own voice note to chat-media in parallel so their UI
    // shows a real <audio> player instead of the "🎤 Áudio (Ns)" text placeholder.
    const uploadPromise = uploadOutboundToChatMedia(conn, blob, 'audio/ogg', 'voice.ogg');

    await writeWahaAudit(conn, {
      action: 'send_audio',
      status: 'started',
      customerId,
      wahaSessionId: parsed.data.session,
      payload: { chatId: parsed.data.chatId, mimetype: parsed.data.file.mimetype },
    });
    try {
      const data = await wahaFetch(url, token, '/api/sendVoice', {
        method: 'POST',
        body: parsed.data,
        timeoutMs: 30_000,
      });
      const messageId = data?.id?._serialized || data?.id || null;
      if (!messageId) {
        throw new Error('WAHA aceitou o áudio mas não retornou message_id — provável falha na sessão. Reconecte e tente novamente.');
      }
      const stored = await uploadPromise;
      await writeWahaAudit(conn, {
        action: 'send_audio',
        status: 'success',
        customerId,
        wahaSessionId: parsed.data.session,
        messageId,
        payload: { chatId: parsed.data.chatId, raw: data, media_path: stored?.path },
      });
      return {
        ok: true,
        provider: 'waha',
        message_id: messageId,
        media_url: stored?.signedUrl ?? null,
        media_path: stored?.path ?? null,
        media_type: 'audio' as const,
        media_mime: 'audio/ogg',
        media_filename: 'voice.ogg',
        media_size: stored?.size ?? null,
        raw: data,
      };
    } catch (e: any) {
      await writeWahaAudit(conn, {
        action: 'send_audio',
        status: 'error',
        customerId,
        wahaSessionId: parsed.data.session,
        errorMessage: e?.message || String(e),
        payload: { chatId: parsed.data.chatId },
      });
      throw e;
    }
  }

  // Etapa 2 — reações. WAHA expõe PUT /api/reaction; passar `reaction: ""`
  // remove a reação anterior do mesmo remetente na mesma mensagem.
  async sendReaction(
    conn: WhatsAppConnection,
    providerMessageId: string,
    emoji: string,
    _customerId?: string,
  ) {
    const url = normalizeUrl(conn.metadata?.url);
    const token = conn.metadata?.token || '';
    if (!url) throw new Error('URL WAHA ausente.');

    const rawPayload = {
      session: this.sessionOf(conn),
      messageId: String(providerMessageId || ''),
      reaction: String(emoji ?? ''),
    };
    const parsed = WahaSendReactionSchema.safeParse(rawPayload);
    if (!parsed.success) {
      throw new Error(`WAHA reação inválida: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    await writeWahaAudit(conn, {
      action: parsed.data.reaction ? 'send_reaction' : 'clear_reaction',
      status: 'started',
      customerId: _customerId ?? null,
      wahaSessionId: parsed.data.session,
      messageId: parsed.data.messageId,
      payload: { emoji: parsed.data.reaction },
    });
    try {
      const data = await wahaFetch(url, token, '/api/reaction', {
        method: 'PUT',
        body: parsed.data,
        timeoutMs: 8_000,
        retries: 1,
      });
      await writeWahaAudit(conn, {
        action: parsed.data.reaction ? 'send_reaction' : 'clear_reaction',
        status: 'success',
        customerId: _customerId ?? null,
        wahaSessionId: parsed.data.session,
        messageId: parsed.data.messageId,
        payload: { emoji: parsed.data.reaction, raw: data },
      });
      return { ok: true, provider: 'waha', message_id: parsed.data.messageId, emoji: parsed.data.reaction, raw: data };
    } catch (e: any) {
      await writeWahaAudit(conn, {
        action: parsed.data.reaction ? 'send_reaction' : 'clear_reaction',
        status: 'error',
        customerId: _customerId ?? null,
        wahaSessionId: parsed.data.session,
        messageId: parsed.data.messageId,
        errorMessage: e?.message || String(e),
        payload: { emoji: parsed.data.reaction },
      });
      throw e;
    }
  }

  async syncContacts(_conn: WhatsAppConnection) {
    return { success: true };
  }
}
