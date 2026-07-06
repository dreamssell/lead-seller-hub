// waha-inbound — receives events from a WAHA instance and persists them into
// Lead Seller. Fully isolated from UAZ/Evolution/Wavoip pipelines: no imports
// or invokes touch other providers.
//
// Contract:
//   POST /waha-inbound?connection=<uuid>
//   Headers:  X-Api-Key: <token stored in whatsapp_connections.metadata.token>
//   Body:     WAHA webhook payload (event, session, payload)
//
// Supported events:
//   * message / message.any  → upsert customer by phone, insert chat_messages
//   * message.ack            → update `whatsapp_connections.metadata.last_acks`
//                              and (best-effort) chat_messages.metadata.status
//   * session.status         → update whatsapp_connections.status
//
// Idempotency: keyed by (webhook_id=<connection_id>, key=<payload.id>).

import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PayloadSchema = z.object({
  event: z.string().optional(),
  session: z.string().optional(),
  payload: z
    .object({
      id: z.union([z.string(), z.object({ _serialized: z.string() })]).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      body: z.string().optional(),
      fromMe: z.boolean().optional(),
      timestamp: z.number().optional(),
      hasMedia: z.boolean().optional(),
      ack: z.number().optional(),
      status: z.string().optional(),
      mediaUrl: z.string().optional(),
      _data: z.any().optional(),
    })
    .passthrough()
    .optional(),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function extractId(id: any): string | null {
  if (!id) return null;
  if (typeof id === 'string') return id;
  if (typeof id === 'object' && typeof id._serialized === 'string') return id._serialized;
  return null;
}

function normalizePhone(from?: string): string | null {
  if (!from) return null;
  // WAHA uses "5511999999999@c.us" for individuals, "…@g.us" for groups.
  if (from.endsWith('@g.us')) return null; // ignore groups for now
  const digits = from.replace(/\D/g, '');
  return digits || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = new URL(req.url);
  const connectionId = url.searchParams.get('connection');
  if (!connectionId) return json({ error: 'missing_connection_param' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // Load connection and enforce provider + token match (defence in depth).
  const { data: conn, error: connErr } = await supabase
    .from('whatsapp_connections')
    .select('id, provider, owner_id, sub_company_id, metadata, status')
    .eq('id', connectionId)
    .maybeSingle();
  if (connErr) return json({ error: 'db_error', detail: connErr.message }, 500);
  if (!conn || conn.provider !== 'waha') return json({ error: 'connection_not_found' }, 404);

  const expectedToken = conn.metadata?.token || '';
  const providedToken = req.headers.get('x-api-key') || req.headers.get('X-Api-Key') || '';
  if (expectedToken && providedToken && providedToken !== expectedToken) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'invalid_payload', issues: parsed.error.issues }, 400);
  }
  const { event = 'message', payload = {} } = parsed.data;
  const providerMsgId = extractId(payload.id);
  const isTest = (payload as any)?._test === true;

  // Observability: log every event into connection_events so the UI can render
  // a real-time feed (Realtime is enabled on this table). Best-effort — a
  // logging failure must not break inbound.
  try {
    const statusForLog =
      event === 'session.status'
        ? String((payload as any)?.status || 'unknown').toLowerCase()
        : event === 'message.ack' || event === 'ack'
        ? `ack:${(payload as any)?.ack ?? '?'}`
        : isTest ? 'test' : 'received';
    await supabase.from('connection_events').insert({
      connection_id: connectionId,
      event_type: `waha.${event}`,
      status: statusForLog,
      status_detail: (payload as any)?.status ?? null,
      payload: payload as any,
      metadata_json: {
        source: 'waha-inbound',
        session: parsed.data.session ?? null,
        connection_param: connectionId,
        provider_msg_id: providerMsgId,
        is_test: isTest,
      },
      test_event_id: isTest ? providerMsgId : null,
    });
  } catch (_) { /* swallow */ }

  // Test events short-circuit: they exist only to prove the webhook wiring.
  if (isTest) return json({ ok: true, test: true, id: providerMsgId });

  // Idempotency: same event id from same connection = no-op.
  if (providerMsgId) {
    const idemKey = `waha:${event}:${providerMsgId}`;
    const { data: existing } = await supabase
      .from('webhook_idempotency_keys')
      .select('id')
      .eq('webhook_id', connectionId)
      .eq('idempotency_key', idemKey)
      .maybeSingle();
    if (existing) return json({ ok: true, idempotent: true });
    await supabase.from('webhook_idempotency_keys').insert({
      webhook_id: connectionId,
      idempotency_key: idemKey,
    });
  }

  // ── Route by event ─────────────────────────────────────────────────────
  if (event === 'session.status') {
    const status = String(payload.status || '').toLowerCase();
    const mapped =
      /working|connected|open|running/.test(status) ? 'connected'
      : /starting|scan|qr|pairing/.test(status) ? 'connecting'
      : /failed|error/.test(status) ? 'error'
      : 'disconnected';
    await supabase
      .from('whatsapp_connections')
      .update({ status: mapped, last_checked_at: new Date().toISOString() })
      .eq('id', connectionId);
    return json({ ok: true, status: mapped });
  }

  if (event === 'message.ack' || event === 'ack') {
    const mapAck: Record<number, string> = { 1: 'sent', 2: 'delivered', 3: 'read', 4: 'played' };
    const ackLabel = mapAck[payload.ack ?? 0] || String(payload.status || 'unknown');
    await supabase
      .from('whatsapp_connections')
      .update({
        metadata: {
          ...(conn.metadata ?? {}),
          last_ack: { id: providerMsgId, status: ackLabel, at: new Date().toISOString() },
        },
      })
      .eq('id', connectionId);
    return json({ ok: true, ack: ackLabel, id: providerMsgId });
  }

  // Default: inbound message.
  const phone = normalizePhone(payload.from);
  if (!phone) return json({ ok: true, skipped: 'no_individual_sender' });

  // Upsert customer by phone under this owner.
  const { data: existingCustomer } = await supabase
    .from('customers')
    .select('id')
    .eq('phone', phone)
    .eq('owner_id', conn.owner_id)
    .maybeSingle();

  let customerId: string | null = existingCustomer?.id ?? null;
  if (!customerId) {
    const { data: created, error: createErr } = await supabase
      .from('customers')
      .insert({
        name: phone,
        phone,
        channel: 'whatsapp',
        owner_id: conn.owner_id,
        sub_company_id: conn.sub_company_id,
        origin_connection_id: conn.id,
      })
      .select('id')
      .single();
    if (createErr) return json({ error: 'customer_insert_failed', detail: createErr.message }, 500);
    customerId = created.id;
  }

  const content = payload.body ?? (payload.hasMedia ? '[mídia]' : '');
  const { error: msgErr } = await supabase.from('chat_messages').insert({
    customer_id: customerId,
    sender_type: 'customer',
    channel: 'whatsapp',
    content,
    connection_id: conn.id,
    sub_company_id: conn.sub_company_id,
    uaz_msg_id: providerMsgId, // shared column name; we reuse it for waha ids.
    metadata: { provider: 'waha', raw: payload, event },
  });
  if (msgErr) return json({ error: 'message_insert_failed', detail: msgErr.message }, 500);

  return json({ ok: true, customer_id: customerId, message_id: providerMsgId });
});
