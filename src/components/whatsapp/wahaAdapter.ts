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

export type WahaSendTextPayload = z.infer<typeof WahaSendTextSchema>;
export type WahaSendMediaPayload = z.infer<typeof WahaSendMediaSchema>;
export type WahaSendVoicePayload = z.infer<typeof WahaSendVoiceSchema>;

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

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
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

    const rawPayload = {
      session: this.sessionOf(conn),
      chatId: normalizeChatId(customer.phone),
      text: String(content ?? ''),
    };
    const parsed = WahaSendTextSchema.safeParse(rawPayload);
    if (!parsed.success) {
      throw new Error(`WAHA payload inválido: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    const data = await wahaFetch(url, token, '/api/sendText', {
      method: 'POST',
      body: parsed.data,
      timeoutMs: opts.timeoutMs ?? 15_000,
      retries: opts.retries ?? 2,
      signal: opts.signal,
    });
    return { ok: true, provider: 'waha', message_id: data?.id?._serialized || data?.id || null, raw: data };
  }

  async sendMedia(conn: WhatsAppConnection, customerId: string, file: File, caption?: string) {
    const url = normalizeUrl(conn.metadata?.url);
    const token = conn.metadata?.token || '';
    if (!url) throw new Error('URL WAHA ausente.');

    const { data: customer } = await supabase
      .from('customers').select('phone').eq('id', customerId).single();
    if (!customer?.phone) throw new Error('Cliente sem telefone cadastrado.');

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
    const data = await wahaFetch(url, token, path, {
      method: 'POST',
      body: parsed.data,
      timeoutMs: 30_000,
    });
    return { ok: true, provider: 'waha', message_id: data?.id?._serialized || data?.id || null, raw: data };
  }

  async sendAudio(conn: WhatsAppConnection, customerId: string, blob: Blob) {
    const url = normalizeUrl(conn.metadata?.url);
    const token = conn.metadata?.token || '';
    if (!url) throw new Error('URL WAHA ausente.');

    const { data: customer } = await supabase
      .from('customers').select('phone').eq('id', customerId).single();
    if (!customer?.phone) throw new Error('Cliente sem telefone cadastrado.');

    const rawPayload = {
      session: this.sessionOf(conn),
      chatId: normalizeChatId(customer.phone),
      file: {
        mimetype: blob.type || 'audio/ogg',
        filename: 'voice.ogg',
        data: await blobToBase64(blob),
      },
    };
    const parsed = WahaSendVoiceSchema.safeParse(rawPayload);
    if (!parsed.success) {
      throw new Error(`WAHA voice inválido: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    const data = await wahaFetch(url, token, '/api/sendVoice', {
      method: 'POST',
      body: parsed.data,
      timeoutMs: 30_000,
    });
    return { ok: true, provider: 'waha', message_id: data?.id?._serialized || data?.id || null, raw: data };
  }

  async syncContacts(_conn: WhatsAppConnection) {
    return { success: true };
  }
}
