import { WhatsAppConnection, ConnectionStatus } from './types';
import { supabase } from '@/integrations/supabase/client';

export interface WhatsAppProviderAdapter {
  getStatus(conn: WhatsAppConnection): Promise<{ connected: boolean; status: string; phone?: string; error?: string; raw?: any }>;
  sendMessage(conn: WhatsAppConnection, customerId: string, content: string): Promise<any>;
  sendMedia?(conn: WhatsAppConnection, customerId: string, file: File, caption?: string): Promise<any>;
  sendAudio?(conn: WhatsAppConnection, customerId: string, blob: Blob): Promise<any>;
  sendRich?(conn: WhatsAppConnection, customerId: string, payload: any): Promise<any>;
  syncContacts(conn: WhatsAppConnection): Promise<any>;
}

async function fileToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
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

  async sendMessage(conn: WhatsAppConnection, customerId: string, content: string) {
    const rawUrl = (conn.metadata?.url || '').trim();
    const url = rawUrl && !/^https?:\/\//i.test(rawUrl) ? `https://${rawUrl}` : rawUrl;
    const token = conn.metadata?.token;
    const instance = conn.metadata?.instance || conn.metadata?.phone_number_id;
    
    if (!url || !token || !instance) {
      throw new Error('Configurações da Evolution API incompletas.');
    }

    // First we need to get the customer phone
    const { data: customer } = await supabase.from('customers').select('phone').eq('id', customerId).single();
    if (!customer?.phone) throw new Error('Cliente não possui telefone cadastrado.');

    const endpoint = `${url.replace(/\/$/, '')}/message/sendText/${encodeURIComponent(instance)}`;
    const headers = {
      'Content-Type': 'application/json',
      apikey: token,
      Authorization: `Bearer ${token}`,
    };

    // Evolution v2 payload (flat). Fallback to v1 (textMessage wrapper) on 400.
    // delay=0 + linkPreview=false to avoid server-side artificial typing delay.
    const v2Body = { number: customer.phone, text: content, delay: 0, linkPreview: false };
    const v1Body = {
      number: customer.phone,
      options: { delay: 0, presence: 'available', linkPreview: false },
      textMessage: { text: content },
    };

    // Remember the last working payload shape per instance to skip the v2->v1 probe.
    const shapeKey = `evo_shape_${conn.id}`;
    const cachedShape = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(shapeKey)) || 'v2';

    try {
      const firstBody = cachedShape === 'v1' ? v1Body : v2Body;
      const secondBody = cachedShape === 'v1' ? v2Body : v1Body;
      let res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(firstBody) });
      if (res.status === 400) {
        res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(secondBody) });
        if (res.ok && typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(shapeKey, cachedShape === 'v1' ? 'v2' : 'v1');
        }
      } else if (res.ok && typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(shapeKey)) {
        sessionStorage.setItem(shapeKey, cachedShape);
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const detail = errData?.response?.message || errData?.message || errData?.error || `Erro Evolution: ${res.status}`;
        throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
      }
      return await res.json();
    } catch (err: any) {
      console.error('[Evolution] Error sending message:', err);
      throw err;
    }
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
  const res = await fetch(`${ctx.url}/message/${endpoint}/${encodeURIComponent(ctx.instance)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ctx.token, Authorization: `Bearer ${ctx.token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.message || `Erro Evolution: ${res.status}`);
  }
  return await res.json();
}

async function sendEvolutionRich(conn: WhatsAppConnection, customerId: string, payload: any) {
  const ctx = await evolutionContext(conn, customerId);
  switch (payload.type) {
    case 'location':
      return evolutionPost(ctx, 'sendLocation', {
        number: ctx.number,
        locationMessage: {
          latitude: payload.latitude, longitude: payload.longitude,
          name: payload.name || '', address: payload.address || '',
        },
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
          footerText: '',
          sections: [{ title: payload.title || 'Opções', rows: payload.rows }],
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
    case 'product': {
      const price = payload.price != null ? ` — R$ ${Number(payload.price).toFixed(2)}` : '';
      return evolutionPost(ctx, 'sendText', {
        number: ctx.number,
        textMessage: { text: `🛍️ *${payload.name}*${price}` },
      });
    }
    case 'signature':
      return evolutionPost(ctx, 'sendText', {
        number: ctx.number,
        textMessage: { text: `📄 *${payload.title}*\n${payload.url}` },
      });
    default:
      throw new Error(`Tipo de mensagem rica não suportado: ${payload.type}`);
  }
}

async function sendEvolutionMedia(conn: WhatsAppConnection, customerId: string, file: File, caption: string, kind: 'media' | 'audio') {
  const rawUrl = (conn.metadata?.url || '').trim();
  const url = rawUrl && !/^https?:\/\//i.test(rawUrl) ? `https://${rawUrl}` : rawUrl;
  const token = conn.metadata?.token;
  const instance = conn.metadata?.instance || conn.metadata?.phone_number_id;
  if (!url || !token || !instance) throw new Error('Configurações da Evolution API incompletas.');
  const { data: customer } = await supabase.from('customers').select('phone').eq('id', customerId).single();
  if (!customer?.phone) throw new Error('Cliente não possui telefone cadastrado.');
  const base64 = await fileToBase64(file);
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  const mediaType = kind === 'audio' ? 'audio' : isImage ? 'image' : isVideo ? 'video' : 'document';
  const path = kind === 'audio' ? 'sendWhatsAppAudio' : 'sendMedia';
  const v2Body = kind === 'audio'
    ? { number: customer.phone, audio: base64, delay: 0 }
    : { number: customer.phone, mediatype: mediaType, mimetype: file.type, fileName: file.name, caption, media: base64, delay: 0 };
  const v1Body = kind === 'audio'
    ? { number: customer.phone, audioMessage: { audio: base64 }, options: { delay: 0, presence: 'available' } }
    : { number: customer.phone, mediaMessage: { mediatype: mediaType, fileName: file.name, caption, media: base64 }, options: { delay: 0, presence: 'available' } };
  const endpoint = `${url.replace(/\/$/, '')}/message/${path}/${encodeURIComponent(instance)}`;
  const headers = { 'Content-Type': 'application/json', apikey: token, Authorization: `Bearer ${token}` };
  let res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(v2Body) });
  if (res.status === 400) {
    res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(v1Body) });
  }
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const detail = errData?.response?.message || errData?.message || errData?.error || `Erro Evolution: ${res.status}`;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));

  }
  return await res.json();
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
