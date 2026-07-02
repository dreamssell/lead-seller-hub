import { WhatsAppConnection } from './types';
import { supabase } from '@/integrations/supabase/client';

export interface WhatsAppProviderAdapter {
  getStatus(conn: WhatsAppConnection): Promise<{ connected: boolean; status: string; phone?: string; error?: string; raw?: any }>;
  sendMessage(conn: WhatsAppConnection, customerId: string, content: string, correlationId?: string): Promise<any>;
  sendMedia?(conn: WhatsAppConnection, customerId: string, file: File, caption?: string): Promise<any>;
  sendAudio?(conn: WhatsAppConnection, customerId: string, blob: Blob): Promise<any>;
  sendRich?(conn: WhatsAppConnection, customerId: string, payload: any): Promise<any>;
  syncContacts(conn: WhatsAppConnection): Promise<any>;
}

async function fileToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = typeof blob.arrayBuffer === 'function'
    ? await blob.arrayBuffer()
    : await new Response(blob as any).arrayBuffer();
  const buf = new Uint8Array(arrayBuffer);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)) as any);
  }
  return btoa(bin);
}

// Per-instance send queue (serialize concurrent sends; reduces "Invalid presence", race
// conditions and rate-limit churn on the Evolution side).
const instanceQueues = new Map<string, Promise<any>>();
function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const prev = instanceQueues.get(key) || Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  instanceQueues.set(key, next.catch(() => undefined));
  return next;
}

// Retry with exponential backoff for transient errors (network / 5xx / 429).
async function sendWithRetry<T>(fn: () => Promise<T>, max = 3): Promise<T> {
  let attempt = 0;
  let lastErr: any;
  while (attempt < max) {
    try { return await fn(); }
    catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || '');
      const retriable = /network|timeout|fetch|429|5\d\d/i.test(msg);
      if (!retriable || attempt === max - 1) break;
      await new Promise(r => setTimeout(r, 400 * Math.pow(2, attempt)));
      attempt++;
    }
  }
  throw lastErr;
}

function extractEvolutionError(errData: any, fallback: string) {
  const detail = errData?.response?.message ?? errData?.message ?? errData?.error ?? fallback;
  return typeof detail === 'string' ? detail : JSON.stringify(detail);
}

function extractInvokeError(data: any, fallback: string) {
  const detail = data?.response?.message ?? data?.message ?? data?.error ?? data?.hint ?? fallback;
  return typeof detail === 'string' ? detail : JSON.stringify(detail);
}

function ensureEvolutionText(value: unknown, fallback = 'Mensagem'): string {
  const text = typeof value === 'string' ? value : value == null ? '' : String(value);
  const normalized = text.replace(/\u0000/g, '').trim();
  return normalized.length > 0 ? normalized : fallback;
}

function isConnectionClosedError(message: string) {
  return /connection\s*closed|connectionclosed|socket.*closed|not\s*connected|instance.*not.*(open|connected)/i.test(message);
}

async function markConnectionDisconnected(connectionId?: string, reason?: string) {
  if (!connectionId) return;
  try {
    await supabase
      .from('whatsapp_connections')
      .update({ status: 'disconnected', last_error: reason?.slice(0, 500) ?? 'Connection Closed' })
      .eq('id', connectionId);
  } catch { /* best-effort */ }
}

function isEvolutionTextSchemaError(message: string) {
  return /requires property\s+\\?"?(text|textMessage)\\?"?|textMessage|property\s+text/i.test(message);
}


function getCachedTextPayloadMode(instance: string) {
  try {
    return sessionStorage.getItem(`evolution:text-payload:${instance}`) as 'flat' | 'nested' | 'merged' | null;
  } catch {
    return null;
  }
}

function setCachedTextPayloadMode(instance: string, mode: 'flat' | 'nested' | 'merged') {
  try {
    sessionStorage.setItem(`evolution:text-payload:${instance}`, mode);
  } catch {
    // sessionStorage may be unavailable in tests/private contexts.
  }
}

function buildEvolutionTextPayloads(number: string, text: string, preferred?: 'flat' | 'nested' | 'merged' | null) {
  const safeText = ensureEvolutionText(text);
  const payloads = [
    {
      mode: 'flat' as const,
      body: {
        number,
        text: safeText,
        delay: 0,
        linkPreview: false,
      },
    },
    {
      mode: 'nested' as const,
      body: {
        number,
        textMessage: { text: safeText },
        delay: 0,
        linkPreview: false,
      },
    },
    {
      mode: 'merged' as const,
      body: {
        number,
        text: safeText,
        textMessage: { text: safeText },
        delay: 0,
        linkPreview: false,
        options: { delay: 0, presence: 'available', linkPreview: false },
      },
    },
  ];

  if (!preferred) return payloads;
  return [...payloads.filter((p) => p.mode === preferred), ...payloads.filter((p) => p.mode !== preferred)];
}

function stripInvalidMentioned(body: any): any {
  if (!body || typeof body !== 'object') return body;
  const copy = Array.isArray(body) ? [...body] : { ...body };
  for (const key of Object.keys(copy)) {
    const value = (copy as any)[key];
    if (key === 'mentioned') {
      if (Array.isArray(value) && value.length === 0) {
        delete (copy as any)[key];
        continue;
      }
      if (typeof value === 'string' && value.trim().length === 0) {
        delete (copy as any)[key];
        continue;
      }
    }
    if (value && typeof value === 'object') (copy as any)[key] = stripInvalidMentioned(value);
  }
  return copy;
}

function collectMentionedDiagnostics(body: any, path = '$'): Array<{ path: string; type: string; length?: number }> {
  if (!body || typeof body !== 'object') return [];
  const out: Array<{ path: string; type: string; length?: number }> = [];
  for (const [key, value] of Object.entries(body)) {
    const nextPath = `${path}.${key}`;
    if (key === 'mentioned') {
      out.push({
        path: nextPath,
        type: Array.isArray(value) ? 'array' : typeof value,
        length: Array.isArray(value) || typeof value === 'string' ? value.length : undefined,
      });
    }
    if (value && typeof value === 'object') out.push(...collectMentionedDiagnostics(value, nextPath));
  }
  return out;
}

function payloadDiagnostics(body: any) {
  const mentioned = body?.mentioned ?? body?.options?.mentioned;
  const text = body?.text ?? body?.textMessage?.text ?? body?.caption ?? body?.mediaMessage?.caption ?? '';
  const media = body?.media ?? body?.mediaMessage?.media;
  const audio = body?.audio ?? body?.audioMessage?.audio;
  return {
    keys: body && typeof body === 'object' ? Object.keys(body) : [],
    numberDigits: String(body?.number || '').replace(/\D/g, '').length,
    numberMasked: body?.number ? `${String(body.number).replace(/\D/g, '').slice(0, 4)}…${String(body.number).replace(/\D/g, '').slice(-4)}` : undefined,
    hasText: typeof text === 'string' && text.trim().length > 0,
    textLength: typeof text === 'string' ? text.length : 0,
    captionLength: typeof body?.caption === 'string' ? body.caption.length : undefined,
    mentionedType: Array.isArray(mentioned) ? 'array' : typeof mentioned,
    mentionedLength: Array.isArray(mentioned) || typeof mentioned === 'string' ? mentioned.length : mentioned == null ? 0 : undefined,
    hasMentioned: mentioned != null,
    mentionedPaths: collectMentionedDiagnostics(body),
    mediaBytesApprox: typeof media === 'string' ? Math.round((media.length * 3) / 4) : undefined,
    audioBytesApprox: typeof audio === 'string' ? Math.round((audio.length * 3) / 4) : undefined,
    buttonsCount: body?.buttonsMessage?.buttons?.length,
    listRowsCount: body?.listMessage?.sections?.reduce?.((acc: number, s: any) => acc + (s.rows?.length || 0), 0),
  };
}

function logEvolutionPayload(endpoint: string, instance: string, body: any, phase: 'request' | 'error' = 'request', extra?: any) {
  const diagnostics = payloadDiagnostics(body);
  const safeInstance = instance ? `${String(instance).slice(0, 4)}…${String(instance).slice(-3)}` : '—';
  const message = `[Evolution][${phase}] ${endpoint}/${safeInstance}`;
  if (phase === 'error') console.error(message, { diagnostics, extra });
  else console.info(message, { diagnostics });
}

async function postEvolutionJson(
  url: string,
  instance: string,
  token: string,
  endpoint: string,
  body: any,
) {
  const safeBody = stripInvalidMentioned(body);
  logEvolutionPayload(endpoint, instance, safeBody, 'request');
  const res = await fetch(`${url}/message/${endpoint}/${encodeURIComponent(instance)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: token, Authorization: `Bearer ${token}` },
    body: JSON.stringify(safeBody),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    logEvolutionPayload(endpoint, instance, safeBody, 'error', { status: res.status, error: errData });
    throw new Error(extractEvolutionError(errData, `Erro Evolution: ${res.status}`));
  }

  return await res.json();
}

async function postEvolutionText(ctx: { url: string; token: string; instance: string; number: string }, text: string) {
  const payloads = buildEvolutionTextPayloads(ctx.number, ensureEvolutionText(text), getCachedTextPayloadMode(ctx.instance));
  let lastError: any;

  for (const payload of payloads) {
    try {
      const json = await postEvolutionJson(ctx.url, ctx.instance, ctx.token, 'sendText', payload.body);
      setCachedTextPayloadMode(ctx.instance, payload.mode);
      return json;
    } catch (err: any) {
      lastError = err;
      if (!isEvolutionTextSchemaError(String(err?.message || ''))) {
        throw err;
      }
    }
  }

  throw lastError;
}



class UazAdapter implements WhatsAppProviderAdapter {
  async getStatus(conn: WhatsAppConnection) {
    const { data, error } = await supabase.functions.invoke('whatsapp-status', {
      body: {
        connection_id: conn.id,
        provider: 'uaz',
        url: conn.metadata?.url,
        token: conn.metadata?.token,
      },
    });
    if (error) throw error;
    return data;
  }

  async sendMessage(conn: WhatsAppConnection, customerId: string, content: string) {
    const { data, error } = await supabase.functions.invoke('uaz-send-message', {
      body: {
        customer_id: customerId,
        content: content,
        connection_id: conn.id
      }
    });
    if (error) throw error;
    return data;
  }

  async syncContacts(conn: WhatsAppConnection) {
    // Implement UAZ contact sync logic here
    return { success: true };
  }
}

class WavoipAdapter implements WhatsAppProviderAdapter {
  async getStatus(conn: WhatsAppConnection) {
    const { data, error } = await supabase.functions.invoke('whatsapp-status', {
      body: {
        connection_id: conn.id,
        provider: 'wavoip',
        url: conn.metadata?.url,
        token: conn.metadata?.token,
      },
    });
    if (error) throw error;
    return data;
  }

  async sendMessage(conn: WhatsAppConnection, customerId: string, content: string) {
    // Placeholder for Wavoip messaging
    console.log('Sending via Wavoip', { customerId, content });
    return { success: true };
  }

  async syncContacts(conn: WhatsAppConnection) {
    return { success: true };
  }
}

class EvolutionAdapter implements WhatsAppProviderAdapter {
  async getStatus(conn: WhatsAppConnection) {
    // Route through edge function to avoid browser CORS against the Evolution host.
    const instance = conn.metadata?.instance || conn.metadata?.phone_number_id;
    const { data, error } = await supabase.functions.invoke('whatsapp-status', {
      body: {
        connection_id: conn.id,
        provider: 'evolution',
        url: conn.metadata?.url,
        token: conn.metadata?.token,
        instance,
      },
    });
    if (error) {
      return { connected: false, status: 'error', error: error.message };
    }
    return data;
  }

  async sendMessage(conn: WhatsAppConnection, customerId: string, content: string, correlationId?: string) {
    const cid = correlationId ?? (globalThis.crypto?.randomUUID?.() ?? String(Date.now()));
    return enqueue(`evo:${conn.id}`, () => sendWithRetry(async () => {
      const start = Date.now();
      try {
        console.info(`[Evolution][cid=${cid}] send_text start`, { connection_id: conn.id, customer_id: customerId });
        const { data, error } = await supabase.functions.invoke('evolution-instance', {
          body: {
            action: 'send_text',
            connection_id: conn.id,
            customer_id: customerId,
            text: ensureEvolutionText(content),
            correlation_id: cid,
          },
        });
        if (error) throw new Error(error.message || 'Falha ao chamar envio Evolution.');
        if (!data?.ok) throw new Error(extractInvokeError(data, 'Falha ao enviar mensagem pela Evolution.'));
        (data as any)._latency_ms = data.latency_ms ?? Date.now() - start;
        (data as any)._correlation_id = cid;
        console.info(`[Evolution][cid=${cid}] send_text ok`, { latency_ms: (data as any)._latency_ms, mode: (data as any).mode, message_id: (data as any).message_id });
        return data;
      } catch (err: any) {
        const msg = String(err?.message || '');
        console.error(`[Evolution][cid=${cid}] send_text fail`, { err: msg });
        if (isConnectionClosedError(msg)) {
          await markConnectionDisconnected(conn.id, msg);
          throw new Error('Sua instância do WhatsApp foi desconectada. Reescaneie o QR Code em Conexões & Canais para continuar enviando mensagens.');
        }
        throw err;
      }
    }));
  }




  async sendMedia(conn: WhatsAppConnection, customerId: string, file: File, caption = '') {
    return sendEvolutionMedia(conn, customerId, file, caption, 'media');
  }

  async sendAudio(conn: WhatsAppConnection, customerId: string, blob: Blob) {
    const f = new File([blob], 'audio.webm', { type: blob.type || 'audio/webm' });
    return sendEvolutionMedia(conn, customerId, f, '', 'audio');
  }

  async sendRich(conn: WhatsAppConnection, customerId: string, payload: any) {
    return sendEvolutionRich(conn, customerId, payload);
  }

  async syncContacts(_conn: WhatsAppConnection) {
    return { success: true };
  }
}

async function evolutionContext(conn: WhatsAppConnection, customerId: string) {
  const rawUrl = (conn.metadata?.url || '').trim();
  const url = rawUrl && !/^https?:\/\//i.test(rawUrl) ? `https://${rawUrl}` : rawUrl;
  const token = conn.metadata?.token;
  const instance = conn.metadata?.instance || conn.metadata?.phone_number_id;
  if (!url || !token || !instance) throw new Error('Configurações da Evolution API incompletas.');
  const { data: customer } = await supabase.from('customers').select('phone').eq('id', customerId).single();
  if (!customer?.phone) throw new Error('Cliente não possui telefone cadastrado.');
  return { url: url.replace(/\/$/, ''), token, instance, number: customer.phone };
}

async function evolutionPost(ctx: { url: string; token: string; instance: string }, endpoint: string, body: any) {
  return postEvolutionJson(ctx.url, ctx.instance, ctx.token, endpoint, body);
}

function richToText(payload: any): string {
  const text = (() => {
  switch (payload.type) {
    case 'location':
      return `📍 ${payload.name || 'Localização'}${payload.address ? `\n${payload.address}` : ''}\nhttps://maps.google.com/?q=${payload.latitude},${payload.longitude}`;
    case 'contact':
      return `👤 ${payload.fullName || 'Contato'}\n${payload.phone || ''}`;
    case 'poll':
      return `📊 *${payload.name}*\n${(payload.values || []).map((v: string, i: number) => `${i + 1}. ${v}`).join('\n')}`;
    case 'list':
      return `📋 *${payload.title || 'Opções'}*${payload.description ? `\n${payload.description}` : ''}\n${(payload.rows || []).map((r: any, i: number) => `${i + 1}. ${r.title || r.text || ''}`).join('\n')}`;
    case 'buttons':
      return `*${payload.title || ''}*${payload.description ? `\n${payload.description}` : ''}\n${(payload.buttons || []).map((b: any, i: number) => `${i + 1}. ${b.text}`).join('\n')}`;
    case 'product': {
      const price = payload.price != null ? ` — R$ ${Number(payload.price).toFixed(2)}` : '';
      return `🛍️ *${payload.name}*${price}`;
    }
    case 'signature':
      return `📄 *${payload.title}*\n${payload.url}`;
    default:
      return JSON.stringify(payload);
  }
  })();
  return ensureEvolutionText(text, 'Mensagem interativa');
}

async function sendEvolutionRich(conn: WhatsAppConnection, customerId: string, payload: any) {
  const ctx = await evolutionContext(conn, customerId);
  const tryRich = async () => {
    switch (payload.type) {
      case 'location':
        return evolutionPost(ctx, 'sendLocation', {
          number: ctx.number,
          locationMessage: { latitude: payload.latitude, longitude: payload.longitude, name: payload.name || '', address: payload.address || '' },
        });
      case 'contact':
        return evolutionPost(ctx, 'sendContact', {
          number: ctx.number,
          contactMessage: [{ fullName: payload.fullName, wuid: payload.phone, phoneNumber: payload.phone }],
        });
      case 'poll':
        return evolutionPost(ctx, 'sendPoll', {
          number: ctx.number,
          pollMessage: { name: payload.name, selectableCount: payload.selectableCount || 1, values: payload.values },
        });
      case 'list':
        return evolutionPost(ctx, 'sendList', {
          number: ctx.number,
          listMessage: {
            title: payload.title || '', description: payload.description, buttonText: payload.buttonText || 'Ver',
            footerText: '', sections: [{ title: payload.title || 'Opções', rows: payload.rows }],
          },
        });
      case 'buttons':
        return evolutionPost(ctx, 'sendButtons', {
          number: ctx.number,
          buttonsMessage: {
            title: payload.title || '', description: payload.description, footerText: payload.footer || '',
            buttons: payload.buttons.map((b: any) => ({ buttonId: b.id, buttonText: { displayText: b.text }, type: 1 })),
          },
        });
      case 'product':
      case 'signature':
        return postEvolutionText(ctx, richToText(payload));
      default:
        throw new Error(`Tipo de mensagem rica não suportado: ${payload.type}`);
    }
  };

  try {
    return await tryRich();
  } catch (err: any) {
    const msg = String(err?.message || '');
    // If strict schema rejects rich payload, gracefully fall back to plain text so the
    // user's message always reaches the recipient.
    if (isEvolutionTextSchemaError(msg) || /requires property|invalid|schema|400/i.test(msg)) {
      return postEvolutionText(ctx, richToText(payload));
    }
    throw err;
  }
}


async function sendEvolutionMedia(conn: WhatsAppConnection, customerId: string, file: File, caption: string, kind: 'media' | 'audio') {
  const ctx = await evolutionContext(conn, customerId);
  const base64 = await fileToBase64(file);
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  const mediaType = kind === 'audio' ? 'audio' : isImage ? 'image' : isVideo ? 'video' : 'document';
  const path = kind === 'audio' ? 'sendWhatsAppAudio' : 'sendMedia';
  // Merged v2 + v1 payload (see sendMessage rationale).
  const body = kind === 'audio'
    ? {
        number: ctx.number,
        audio: base64,
        audioMessage: { audio: base64 },
        options: { delay: 0, presence: 'available' },
        delay: 0,
      }
    : {
        number: ctx.number,
        mediatype: mediaType,
        mimetype: file.type,
        fileName: file.name,
        caption,
        media: base64,
        mediaMessage: { mediatype: mediaType, fileName: file.name, caption, media: base64 },
        options: { delay: 0, presence: 'available' },
        delay: 0,
      };
  return evolutionPost(ctx, path, body);
}

export const getProviderAdapter = (provider: string): WhatsAppProviderAdapter => {
  switch (provider) {
    case 'uaz':
      return new UazAdapter();
    case 'wavoip':
      return new WavoipAdapter();
    case 'evolution':
      return new EvolutionAdapter();
    default:
      throw new Error(`Provider ${provider} not supported`);
  }
};
