// WAHA (WhatsApp HTTP API) adapter — https://waha.devlike.pro/docs/overview/
// Kept in a standalone module so it can be edited or removed without touching
// the other WhatsApp providers (UAZ, Evolution, Wavoip, Meta).

import { supabase } from '@/integrations/supabase/client';
import type { WhatsAppConnection } from './types';
import type { WhatsAppProviderAdapter } from './adapters';

function normalizeUrl(raw?: string): string {
  const v = (raw || '').trim().replace(/\/$/, '');
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function normalizeChatId(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.includes('@') ? phone : `${digits}@c.us`;
}

async function wahaFetch(url: string, token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Api-Key': token } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.message || data?.error || text || `WAHA HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

export class WahaAdapter implements WhatsAppProviderAdapter {
  async getStatus(conn: WhatsAppConnection) {
    const url = normalizeUrl(conn.metadata?.url);
    const token = conn.metadata?.token || '';
    const session = conn.metadata?.instance || conn.metadata?.session || 'default';
    if (!url) return { connected: false, status: 'unconfigured', error: 'URL WAHA ausente' };
    try {
      const data = await wahaFetch(url, token, `/api/sessions/${encodeURIComponent(session)}`);
      const status = String(data?.status || data?.state || 'unknown');
      const connected = /working|connected|open|running/i.test(status);
      const phone = data?.me?.id || data?.me?.pushName || null;
      return { connected, status, phone, raw: data };
    } catch (err: any) {
      return { connected: false, status: 'error', error: err?.message || String(err) };
    }
  }

  async sendMessage(conn: WhatsAppConnection, customerId: string, content: string) {
    const url = normalizeUrl(conn.metadata?.url);
    const token = conn.metadata?.token || '';
    const session = conn.metadata?.instance || conn.metadata?.session || 'default';
    if (!url) throw new Error('URL WAHA ausente.');

    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('phone')
      .eq('id', customerId)
      .single();
    if (custErr || !customer?.phone) throw new Error('Cliente sem telefone cadastrado.');

    const body = {
      session,
      chatId: normalizeChatId(customer.phone),
      text: String(content ?? ''),
    };
    const data = await wahaFetch(url, token, '/api/sendText', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return { ok: true, provider: 'waha', message_id: data?.id?._serialized || data?.id || null, raw: data };
  }

  async syncContacts(_conn: WhatsAppConnection) {
    return { success: true };
  }
}
