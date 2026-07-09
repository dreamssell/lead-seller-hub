// waha-inbound — receives events from a WAHA instance and persists them into
// Lead Seller. Fully isolated from UAZ/Evolution/Wavoip pipelines: no imports
// or invokes touch other providers.
//
// Contract:
//   POST /waha-inbound?connection=<uuid>
//   Headers:  X-Api-Key: <token stored in whatsapp_connections.metadata.token>
//   Body:     WAHA webhook payload — supports BOTH engines:
//               * WEBJS classic: { event: 'message', payload: { id, from, body, ... } }
//               * GOWS/Baileys:  { event: 'gows.MessageEventData', data: { Info, Message, ... } }
//
// Supported logical events:
//   * inbound message  → upsert customer by phone, insert chat_messages
//   * message ack      → update `whatsapp_connections.metadata.last_ack`
//                        and chat_messages.metadata.status (best-effort)
//   * session status   → update whatsapp_connections.status

import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

// WhatsApp JIDs come in several flavours:
//   5511999999999@c.us              (WEBJS classic)
//   5511999999999@s.whatsapp.net    (GOWS/Baileys individual)
//   16433216020536@lid              (Baileys "linked id" — NOT a real phone)
//   5511999999999-123@g.us          (group)
// For @lid we must fall back to SenderAlt, which holds the real phone JID.
function normalizePhone(from?: string | null): string | null {
  if (!from || typeof from !== 'string') return null;
  if (from.endsWith('@g.us')) return null; // ignore groups
  if (from.endsWith('@lid')) return null;  // caller must retry with SenderAlt
  const digits = from.replace(/\D/g, '');
  if (!digits) return null;
  // Baileys sometimes appends ":<device>" — split() above strips it already.
  return digits;
}

// Classifies the incoming event into one of our three logical buckets, using
// both the top-level `event` string and the shape of the payload so we work
// with WEBJS ("message") and GOWS ("gows.MessageEventData") equally well.
function classify(event: string, body: any): 'message' | 'ack' | 'session' | 'ignore' {
  const e = event.toLowerCase();
  if (e === 'session.status' || e === 'status.instance') return 'session';
  if (e === 'message.ack' || e === 'ack' || e.endsWith('.receipteventdata')) return 'ack';
  if (e === 'message' || e === 'message.any') return 'message';
  // GOWS engine emits gows.MessageEventData with body.data.Info / body.data.Message
  if (e.includes('messageeventdata') || e.includes('gows.message')) return 'message';
  // Some payloads omit `event`; infer from shape.
  if (!event && body?.data?.Info && body?.data?.Message) return 'message';
  return 'ignore';
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

  const { data: conn, error: connErr } = await supabase
    .from('whatsapp_connections')
    .select('id, provider, owner_id, sub_company_id, metadata, status')
    .eq('id', connectionId)
    .maybeSingle();
  if (connErr) return json({ error: 'db_error', detail: connErr.message }, 500);
  if (!conn || conn.provider !== 'waha') return json({ error: 'connection_not_found' }, 404);

  const expectedToken = (conn.metadata as any)?.token || '';
  const providedToken = req.headers.get('x-api-key') || req.headers.get('X-Api-Key') || '';
  if (expectedToken && providedToken && providedToken !== expectedToken) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const event: string = String(body?.event || '');
  const session: string | null = body?.session ?? null;
  // GOWS delivers real data at body.data (Info/Message). WEBJS uses body.payload.
  const gowsData = body?.data ?? null;
  const webPayload = body?.payload ?? {};
  const info = gowsData?.Info ?? gowsData?.Message?.Info ?? null;
  const msgWrap = gowsData?.Message ?? webPayload?._data?.Message ?? {};

  const providerMsgId =
    extractId(webPayload?.id) ||
    info?.ID ||
    gowsData?.Message?.ID ||
    gowsData?.ID ||
    null;

  const isTest = webPayload?._test === true || gowsData?._test === true;
  const bucket = classify(event, body);

  // Observability log — always insert (best-effort), regardless of routing.
  try {
    const statusForLog =
      bucket === 'session'
        ? String(webPayload?.status || gowsData?.status || 'unknown').toLowerCase()
        : bucket === 'ack'
        ? `ack:${webPayload?.ack ?? gowsData?.Receipt?.Type ?? '?'}`
        : bucket === 'message'
        ? (info?.IsFromMe ? 'outbound' : 'inbound')
        : isTest ? 'test' : 'received';
    await supabase.from('connection_events').insert({
      connection_id: connectionId,
      event_type: `waha.${event || 'unknown'}`,
      status: statusForLog,
      status_detail: webPayload?.status ?? gowsData?.status ?? null,
      payload: (gowsData ?? webPayload) as any,
      metadata_json: {
        source: 'waha-inbound',
        session,
        connection_param: connectionId,
        provider_msg_id: providerMsgId,
        bucket,
        raw_event: event,
        is_test: isTest,
      },
      test_event_id: isTest ? providerMsgId : null,
    });
  } catch (_) { /* swallow */ }

  if (isTest) return json({ ok: true, test: true, id: providerMsgId });
  if (bucket === 'ignore') return json({ ok: true, ignored: event });

  // Idempotency — key on message id only (event name variants collapse).
  if (providerMsgId && (bucket === 'message' || bucket === 'ack')) {
    const idemKey = bucket === 'ack' ? `waha:ack:${providerMsgId}` : `waha:msg:${providerMsgId}`;
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

  // ── SESSION STATUS ───────────────────────────────────────────────────────
  if (bucket === 'session') {
    const status = String(webPayload?.status || gowsData?.status || '').toLowerCase();
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

  // ── ACK ──────────────────────────────────────────────────────────────────
  if (bucket === 'ack') {
    const ackNum = webPayload?.ack ?? gowsData?.Receipt?.Ack ?? 0;
    const mapAck: Record<number, string> = { 1: 'sent', 2: 'delivered', 3: 'read', 4: 'played' };
    const ackLabel = mapAck[ackNum as number] || String(webPayload?.status || gowsData?.Receipt?.Type || 'unknown');
    await supabase
      .from('whatsapp_connections')
      .update({
        metadata: {
          ...((conn.metadata as any) ?? {}),
          last_ack: { id: providerMsgId, status: ackLabel, at: new Date().toISOString() },
        },
      })
      .eq('id', connectionId);
    if (providerMsgId) {
      const { data: msgRow } = await supabase
        .from('chat_messages')
        .select('id, metadata')
        .eq('uaz_msg_id', providerMsgId)
        .maybeSingle();
      if (msgRow) {
        await supabase
          .from('chat_messages')
          .update({
            metadata: {
              ...(msgRow.metadata || {}),
              delivery_status: ackLabel,
              status: ackLabel,
              confirmed_at: new Date().toISOString(),
            },
          })
          .eq('id', msgRow.id);
      }
    }
    return json({ ok: true, ack: ackLabel, id: providerMsgId });
  }

  // ── INBOUND MESSAGE ──────────────────────────────────────────────────────
  // Prefer GOWS Info; fall back to WEBJS payload and Baileys _data wrapper.
  const fromMeFlag =
    webPayload?.fromMe === true ||
    info?.IsFromMe === true ||
    webPayload?._data?.Info?.IsFromMe === true;

  const rawFrom: string | undefined =
    webPayload?.from ||
    info?.Chat ||
    info?.Sender ||
    webPayload?._data?.Info?.Chat;

  const senderAlt: string | undefined =
    info?.SenderAlt ||
    webPayload?._data?.Info?.SenderAlt;

  const isGroup =
    info?.IsGroup === true ||
    (typeof rawFrom === 'string' && rawFrom.endsWith('@g.us'));

  if (typeof rawFrom === 'string' && rawFrom.includes('status@broadcast')) {
    return json({ ok: true, skipped: 'status_broadcast' });
  }
  if (fromMeFlag) return json({ ok: true, skipped: 'from_me' });
  if (isGroup)   return json({ ok: true, skipped: 'group_message' });

  // If Sender is a @lid (Baileys "linked id"), phone must come from SenderAlt.
  const phone = normalizePhone(rawFrom) || normalizePhone(senderAlt);
  if (!phone) return json({ ok: true, skipped: 'no_individual_sender', rawFrom, senderAlt });

  const pushName: string | null =
    info?.PushName || webPayload?._data?.Info?.PushName || webPayload?.notifyName || null;

  // Upsert customer by phone under this owner.
  const { data: existingCustomer } = await supabase
    .from('customers')
    .select('id, name')
    .eq('phone', phone)
    .eq('owner_id', conn.owner_id)
    .maybeSingle();

  let customerId: string | null = existingCustomer?.id ?? null;
  if (!customerId) {
    const { data: created, error: createErr } = await supabase
      .from('customers')
      .insert({
        name: pushName || phone,
        phone,
        channel: 'whatsapp',
        created_by: conn.owner_id,
        owner_id: conn.owner_id,
        sub_company_id: conn.sub_company_id,
        origin_connection_id: conn.id,
      })
      .select('id')
      .single();
    if (createErr) return json({ error: 'customer_insert_failed', detail: createErr.message }, 500);
    customerId = created.id;
  } else if (pushName && (!existingCustomer?.name || existingCustomer.name === phone || /^Contato\s+\d{2,}$/i.test(existingCustomer.name))) {
    // Enrich name if we only had the phone number stored.
    await supabase.from('customers').update({ name: pushName }).eq('id', customerId);
  }

  const extractedBody =
    webPayload?.body ||
    msgWrap?.conversation ||
    msgWrap?.extendedTextMessage?.text ||
    msgWrap?.imageMessage?.caption ||
    msgWrap?.videoMessage?.caption ||
    msgWrap?.documentMessage?.caption ||
    '';
  const hasMedia =
    webPayload?.hasMedia === true ||
    !!msgWrap?.imageMessage ||
    !!msgWrap?.videoMessage ||
    !!msgWrap?.audioMessage ||
    !!msgWrap?.documentMessage;
  const content = extractedBody || (hasMedia ? '[mídia]' : '');

  const { error: msgErr } = await supabase.from('chat_messages').insert({
    customer_id: customerId,
    sender_type: 'client',
    channel: 'whatsapp',
    content,
    connection_id: conn.id,
    sub_company_id: conn.sub_company_id,
    uaz_msg_id: providerMsgId,
    metadata: {
      provider: 'waha',
      engine: gowsData ? 'gows' : 'webjs',
      event,
      push_name: pushName,
      sender_jid: rawFrom,
      sender_alt: senderAlt,
      raw: gowsData ?? webPayload,
    },
  });
  if (msgErr?.code === '23505') {
    return json({ ok: true, idempotent: true, message_id: providerMsgId, phone });
  }
  if (msgErr) return json({ error: 'message_insert_failed', detail: msgErr.message }, 500);

  return json({ ok: true, customer_id: customerId, message_id: providerMsgId, phone });
});
