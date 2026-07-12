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
  // Some WAHA/GOWS deployments wrap the same message shape under `engine.event`.
  if (body?.data?.Info && body?.data?.Message) return 'message';
  return 'ignore';
}

// Extract the best available media descriptor from either WEBJS or GOWS payloads.
// Returns null when no media is present. Never throws.
function extractMedia(webPayload: any, gowsData: any, msgWrap: any) {
  // WEBJS classic: payload.media = { url, mimetype, filename, data(base64)? }
  const web = webPayload?.media || webPayload?._data?.media;
  if (web && (web.url || web.data)) {
    const mimetype: string = web.mimetype || web.mimeType || 'application/octet-stream';
    return {
      url: web.url || null,
      base64: web.data || null,
      mimetype,
      filename: web.filename || `media-${Date.now()}`,
      kind: kindFromMime(mimetype),
      duration: web.duration || web.seconds || null,
    };
  }
  // GOWS/Baileys: {audio,image,video,document}Message inside Message. Some WAHA
  // GOWS deployments expose an already-decrypted URL under `.mediaUrl` / `.url`.
  const wraps = [msgWrap?.audioMessage, msgWrap?.imageMessage, msgWrap?.videoMessage, msgWrap?.documentMessage, msgWrap?.stickerMessage];
  for (const w of wraps) {
    if (!w) continue;
    const mimetype: string = w.mimetype || w.mimeType || 'application/octet-stream';
    const url = w.mediaUrl || w.directPath || w.url || null;
    if (!url && !w.data) continue;
    return {
      url,
      base64: w.data || null,
      mimetype,
      filename: w.fileName || w.filename || `media-${Date.now()}`,
      kind: kindFromMime(mimetype),
      duration: w.seconds || w.duration || null,
    };
  }
  // GOWS may also expose top-level `data.media`
  const g = gowsData?.media;
  if (g && (g.url || g.data)) {
    const mimetype: string = g.mimetype || g.mimeType || 'application/octet-stream';
    return {
      url: g.url || null,
      base64: g.data || null,
      mimetype,
      filename: g.filename || `media-${Date.now()}`,
      kind: kindFromMime(mimetype),
      duration: g.duration || null,
    };
  }
  return null;
}

function kindFromMime(m: string): 'audio' | 'image' | 'video' | 'document' {
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  return 'document';
}

function extFromMime(m: string): string {
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mpeg')) return 'mp3';
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('webm')) return 'webm';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('pdf')) return 'pdf';
  return 'bin';
}

// Download from a URL (with optional X-Api-Key), or decode base64. Uploads to
// the chat-media bucket and returns a signed URL. Best-effort — returns null
// on failure so we still persist the text/[mídia] placeholder.
async function persistWahaMedia(
  supabase: any,
  args: {
    ownerId: string;
    connectionId: string;
    providerMsgId: string | null;
    wahaUrl: string | null;
    wahaToken: string | null;
    media: { url: string | null; base64: string | null; mimetype: string; filename: string; kind: string };
  },
): Promise<{ path: string; signedUrl: string; size: number } | null> {
  try {
    let bytes: Uint8Array | null = null;
    if (args.media.base64) {
      const bin = atob(args.media.base64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else if (args.media.url) {
      const isAbsolute = /^https?:\/\//i.test(args.media.url);
      const url = isAbsolute ? args.media.url : `${args.wahaUrl || ''}${args.media.url}`;
      const res = await fetch(url, {
        headers: args.wahaToken ? { 'X-Api-Key': args.wahaToken } : {},
      });
      if (!res.ok) return null;
      bytes = new Uint8Array(await res.arrayBuffer());
    }
    if (!bytes || bytes.length === 0) return null;
    const ext = extFromMime(args.media.mimetype);
    const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const idPart = (args.providerMsgId || crypto.randomUUID()).replace(/[^a-zA-Z0-9]/g, '').slice(-20);
    const path = `${args.ownerId}/${args.connectionId}/${stamp}-${idPart}.${ext}`;
    const { error: upErr } = await supabase.storage.from('chat-media').upload(path, bytes, {
      contentType: args.media.mimetype,
      upsert: true,
    });
    if (upErr) return null;
    const { data: signed } = await supabase.storage
      .from('chat-media')
      .createSignedUrl(path, 60 * 60 * 24 * 30); // 30 dias
    if (!signed?.signedUrl) return null;
    return { path, signedUrl: signed.signedUrl, size: bytes.length };
  } catch {
    return null;
  }
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
  const preliminaryRawFrom: string | undefined =
    webPayload?.from ||
    info?.Chat ||
    info?.Sender ||
    webPayload?._data?.Info?.Chat;
  const preliminarySenderAlt: string | undefined =
    info?.SenderAlt ||
    webPayload?._data?.Info?.SenderAlt;
  const preliminarySenderLid =
    typeof preliminaryRawFrom === 'string' && preliminaryRawFrom.includes('@lid')
      ? preliminaryRawFrom
      : typeof preliminarySenderAlt === 'string' && preliminarySenderAlt.includes('@lid')
      ? preliminarySenderAlt
      : null;

  const providerMsgId =
    extractId(webPayload?.id) ||
    info?.ID ||
    gowsData?.Message?.ID ||
    gowsData?.ID ||
    null;

  const isTest = webPayload?._test === true || gowsData?._test === true;
  const bucket = classify(event, body);

  // Observability log — always insert (best-effort), regardless of routing.
  let eventLogId: string | null = null;
  try {
    const statusForLog =
      bucket === 'session'
        ? String(webPayload?.status || gowsData?.status || 'unknown').toLowerCase()
        : bucket === 'ack'
        ? `ack:${webPayload?.ack ?? gowsData?.Receipt?.Type ?? '?'}`
        : bucket === 'message'
        ? (info?.IsFromMe ? 'outbound' : 'inbound')
        : isTest ? 'test' : 'received';
    const { data: logged } = await supabase.from('connection_events').insert({
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
        owner_id: conn.owner_id,
        sub_company_id: conn.sub_company_id,
        sender_jid: preliminaryRawFrom,
        sender_alt: preliminarySenderAlt,
        sender_lid: preliminarySenderLid,
      },
      test_event_id: isTest ? providerMsgId : null,
    }).select('id').maybeSingle();
    eventLogId = logged?.id ?? null;
  } catch (_) { /* swallow */ }

  if (isTest) return json({ ok: true, test: true, id: providerMsgId });
  if (bucket === 'ignore') return json({ ok: true, ignored: event });

  // Idempotency for ACKs can happen immediately. For messages, wait until we
  // know the event is a valid individual inbound; WAHA often emits message.any
  // plus message, and status/group/no-phone variants must not consume the key.
  if (providerMsgId && bucket === 'ack') {
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
  // WEBJS emits { ack: 1..4 } on a single message id.
  // GOWS emits ReceiptEventData with { Type: 'delivery'|'read'|'played', MessageIDs: string[] }
  // and NO numeric ack. We must handle both to render ✓✓ and ✓✓ (blue) in the UI.
  if (bucket === 'ack') {
    const ackNum = webPayload?.ack ?? gowsData?.Receipt?.Ack;
    const gowsType = String(gowsData?.Type || gowsData?.Receipt?.Type || '').toLowerCase();
    const mapAck: Record<number, string> = { 1: 'sent', 2: 'delivered', 3: 'read', 4: 'played' };
    const ackLabelFromType =
      gowsType.includes('play') ? 'played'
      : gowsType.includes('read') ? 'read'
      : gowsType.includes('deliver') || gowsType.includes('received') ? 'delivered'
      : gowsType.includes('server') || gowsType.includes('sent') ? 'sent'
      : null;
    const ackLabel = mapAck[ackNum as number] || ackLabelFromType || String(webPayload?.status || 'unknown');

    // Collect every impacted provider message id.
    const gowsIds: string[] = Array.isArray(gowsData?.MessageIDs) ? gowsData.MessageIDs
      : Array.isArray(gowsData?.Receipt?.MessageIDs) ? gowsData.Receipt.MessageIDs
      : [];
    const idSet = new Set<string>([...(providerMsgId ? [providerMsgId] : []), ...gowsIds.filter(Boolean)]);
    const ids = Array.from(idSet);

    await supabase
      .from('whatsapp_connections')
      .update({
        metadata: {
          ...((conn.metadata as any) ?? {}),
          last_ack: { ids, status: ackLabel, at: new Date().toISOString() },
        },
      })
      .eq('id', connectionId);

    const ackRank: Record<string, number> = { sent: 1, delivered: 2, read: 3, played: 4 };
    for (const id of ids) {
      const { data: msgRow } = await supabase
        .from('chat_messages')
        .select('id, metadata')
        .eq('uaz_msg_id', id)
        .maybeSingle();
      if (!msgRow) continue;
      const prevLabel = (msgRow.metadata as any)?.delivery_status || (msgRow.metadata as any)?.status;
      // Never downgrade (read → delivered would lose the blue ticks).
      if (prevLabel && (ackRank[prevLabel] ?? 0) >= (ackRank[ackLabel] ?? 0)) continue;
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
    return json({ ok: true, ack: ackLabel, ids });
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
  const senderLid =
    typeof rawFrom === 'string' && rawFrom.includes('@lid')
      ? rawFrom
      : typeof senderAlt === 'string' && senderAlt.includes('@lid')
      ? senderAlt
      : null;

  const isGroup =
    info?.IsGroup === true ||
    (typeof rawFrom === 'string' && rawFrom.endsWith('@g.us'));

  if (typeof rawFrom === 'string' && rawFrom.includes('status@broadcast')) {
    return json({ ok: true, skipped: 'status_broadcast' });
  }
  if (fromMeFlag) return json({ ok: true, skipped: 'from_me' });
  if (isGroup)   return json({ ok: true, skipped: 'group_message' });

  // If Sender/Chat is a @lid (Baileys "linked id"), the real phone must come
  // from SenderAlt. Normalizing the LID itself creates an invalid contact and
  // makes the chat disappear after refresh because it no longer matches the
  // user's WhatsApp number.
  const rawFromIsLid = typeof rawFrom === 'string' && rawFrom.includes('@lid');
  const phone = rawFromIsLid
    ? normalizePhone(senderAlt) || normalizePhone(rawFrom)
    : normalizePhone(rawFrom) || normalizePhone(senderAlt);
  if (!phone) return json({ ok: true, skipped: 'no_individual_sender', rawFrom, senderAlt });

  if (providerMsgId) {
    const idemKey = `waha:msg:${providerMsgId}`;
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

  // Best-effort media persistence into the private chat-media bucket. Failure
  // never blocks the inbound message — we just fall back to the [mídia] label.
  let mediaMeta: any = null;
  if (hasMedia) {
    const media = extractMedia(webPayload, gowsData, msgWrap);
    if (media) {
      const wahaUrl = (conn.metadata as any)?.url || null;
      const wahaToken = (conn.metadata as any)?.token || null;
      const stored = await persistWahaMedia(supabase, {
        ownerId: conn.owner_id,
        connectionId: conn.id,
        providerMsgId,
        wahaUrl,
        wahaToken,
        media,
      });
      mediaMeta = {
        media_type: media.kind,
        media_mime: media.mimetype,
        media_filename: media.filename,
        media_duration: media.duration ?? null,
        media_url: stored?.signedUrl ?? null,
        media_path: stored?.path ?? null,
        media_size: stored?.size ?? null,
      };
    }
  }

  const { data: insertedMsg, error: msgErr } = await supabase.from('chat_messages').insert({
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
      event_log_id: eventLogId,
      push_name: pushName,
      sender_jid: rawFrom,
      sender_alt: senderAlt,
      sender_lid: senderLid,
      owner_id: conn.owner_id,
      webhook_received_at: new Date().toISOString(),
      ...(mediaMeta || {}),
      raw: gowsData ?? webPayload,
    },
  }).select('id').single();
  if (msgErr?.code === '23505') {
    return json({ ok: true, idempotent: true, message_id: providerMsgId, phone });
  }
  if (msgErr) return json({ error: 'message_insert_failed', detail: msgErr.message }, 500);

  if (eventLogId && insertedMsg?.id) {
    await supabase.from('connection_events').update({
      metadata_json: {
        source: 'waha-inbound',
        session,
        connection_param: connectionId,
        provider_msg_id: providerMsgId,
        bucket,
        raw_event: event,
        is_test: isTest,
        owner_id: conn.owner_id,
        sub_company_id: conn.sub_company_id,
        sender_jid: rawFrom,
        sender_alt: senderAlt,
        sender_lid: senderLid,
        phone,
        customer_id: customerId,
        chat_message_id: insertedMsg.id,
      },
    }).eq('id', eventLogId);
  }

  return json({ ok: true, customer_id: customerId, chat_message_id: insertedMsg?.id, message_id: providerMsgId, phone, sender_lid: senderLid, owner_id: conn.owner_id });
});
