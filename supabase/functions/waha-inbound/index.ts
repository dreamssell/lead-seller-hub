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
function classify(event: string, body: any): 'message' | 'ack' | 'session' | 'reaction' | 'edit' | 'revoke' | 'presence' | 'contact' | 'label' | 'chat_meta' | 'ignore' {
  const e = event.toLowerCase();
  if (e === 'session.status' || e === 'status.instance') return 'session';
  if (e === 'message.ack' || e === 'ack' || e.endsWith('.receipteventdata')) return 'ack';
  // Reactions: WEBJS emits `message.reaction`; GOWS wraps a `reactionMessage`
  // inside a normal MessageEventData, or emits `*.reactioneventdata`.
  if (e === 'message.reaction' || e.endsWith('.reactioneventdata')) return 'reaction';
  const gowsMsg = body?.data?.Message ?? body?.payload?._data?.Message;
  if (gowsMsg?.reactionMessage) return 'reaction';
  if (body?.payload?.reaction && (body?.payload?.reaction?.text !== undefined || body?.payload?.reaction?.msgId)) return 'reaction';
  // Etapa 4 — edições e revogações.
  if (e === 'message.edited' || e === 'message.edit' || e.endsWith('.editeventdata')) return 'edit';
  if (gowsMsg?.editedMessage || gowsMsg?.protocolMessage?.editedMessage) return 'edit';
  if (e === 'message.revoked' || e === 'message.revoke' || e === 'message.revoke_everyone' || e === 'message.revoke_me' || e.endsWith('.revokeeventdata')) return 'revoke';
  const protoType = String(gowsMsg?.protocolMessage?.type || '').toUpperCase();
  if (protoType === 'REVOKE' || protoType === 'MESSAGE_DELETE') return 'revoke';
  // Etapa 5 — presença (digitando/gravando/online/last seen).
  //   WEBJS: `presence.update` com { id: chatId, presences: [{ id, isOnline, lastKnownPresence, lastSeen }] }
  //   GOWS:  gows.PresenceEventData (online/offline) ou gows.ChatPresenceEventData (typing/recording)
  if (e === 'presence.update' || e.endsWith('.presenceeventdata') || e.endsWith('.chatpresenceeventdata')) return 'presence';
  // Etapa 6 — contatos & perfil (foto/nome/sobre e block/unblock).
  //   WEBJS: `contact.changed`, `contact.updated`, `chats.update` (com foto), `contact.blocked`/`contact.unblocked`.
  //   GOWS:  gows.PictureEventData, gows.BusinessNameEventData, gows.PushNameEventData, gows.BlocklistEventData.
  if (
    e === 'contact.update' || e === 'contact.updated' || e === 'contact.changed' ||
    e === 'contact.blocked' || e === 'contact.unblocked' ||
    e === 'chats.update' ||
    e.endsWith('.pictureeventdata') || e.endsWith('.businessnameeventdata') ||
    e.endsWith('.pushnameeventdata') || e.endsWith('.blocklisteventdata')
  ) return 'contact';
  // Etapa 7 — etiquetas & organização de chats.
  //   WEBJS: `label.upsert`, `label.deleted`, `label.chat.added`, `label.chat.deleted`.
  //   GOWS:  gows.LabelEditEventData, gows.LabelAssociationChatEventData.
  if (
    e === 'label.upsert' || e === 'label.updated' || e === 'label.deleted' ||
    e === 'label.chat.added' || e === 'label.chat.deleted' ||
    e.endsWith('.labelediteventdata') || e.endsWith('.labelassociationchateventdata')
  ) return 'label';
  //   Arquivar/silenciar: WEBJS `chat.archive`, `chat.mute`; GOWS ChatSettingEventData.
  if (
    e === 'chat.archive' || e === 'chat.unarchive' || e === 'chat.mute' || e === 'chat.unmute' ||
    e.endsWith('.chatsettingeventdata') || e.endsWith('.archivechateventdata') || e.endsWith('.mutechateventdata')
  ) return 'chat_meta';
  if (e === 'message' || e === 'message.any') return 'message';
  // GOWS engine emits gows.MessageEventData with body.data.Info / body.data.Message
  if (e.includes('messageeventdata') || e.includes('gows.message')) return 'message';
  // Some payloads omit `event`; infer from shape.
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

  // ── REACTION ─────────────────────────────────────────────────────────────
  // WEBJS: body.payload.reaction = { msgId: {_serialized}, text, senderId, fromMe, ack }
  // GOWS/Baileys: body.data.Message.reactionMessage = { key: { id, remoteJid, fromMe }, text, senderTimestampMs }
  if (bucket === 'reaction') {
    const reactWeb = webPayload?.reaction || null;
    const reactGows = msgWrap?.reactionMessage || null;

    const targetMsgId =
      extractId(reactWeb?.msgId) ||
      extractId(reactWeb?.id) ||
      reactGows?.key?.id ||
      reactGows?.key?.ID ||
      null;
    const emoji = String(reactWeb?.text ?? reactGows?.text ?? '');
    const reactionFromMe =
      reactWeb?.fromMe === true ||
      reactGows?.key?.fromMe === true ||
      info?.IsFromMe === true;
    const reactorJid =
      reactWeb?.senderId ||
      info?.Sender ||
      info?.Chat ||
      reactGows?.key?.participant ||
      reactGows?.key?.remoteJid ||
      null;
    const reactorKey = reactionFromMe ? 'me' : (typeof reactorJid === 'string' ? reactorJid : 'peer');

    if (!targetMsgId) {
      return json({ ok: true, skipped: 'reaction_without_target' });
    }

    const { data: msgRow } = await supabase
      .from('chat_messages')
      .select('id, metadata')
      .eq('uaz_msg_id', targetMsgId)
      .maybeSingle();
    if (!msgRow) {
      return json({ ok: true, skipped: 'reaction_target_not_found', target: targetMsgId });
    }

    const prevReactions = ((msgRow.metadata as any)?.reactions) || {};
    const nextReactions: Record<string, any> = { ...prevReactions };
    if (!emoji) {
      // Empty reaction text → remove.
      delete nextReactions[reactorKey];
    } else {
      nextReactions[reactorKey] = {
        emoji,
        from_me: reactionFromMe,
        jid: reactorJid,
        at: new Date().toISOString(),
      };
    }

    await supabase
      .from('chat_messages')
      .update({
        metadata: {
          ...(msgRow.metadata || {}),
          reactions: nextReactions,
          last_reaction_at: new Date().toISOString(),
        },
      })
      .eq('id', msgRow.id);

    return json({ ok: true, reaction: { target: targetMsgId, by: reactorKey, emoji: emoji || null } });
  }

  // ── EDIT ─────────────────────────────────────────────────────────────────
  // WEBJS: body.payload = { id, body: newText, before: oldText } no evento message.edited
  // GOWS:  body.data.Message.editedMessage.message.{conversation|extendedTextMessage.text}
  //        (ou body.data.Message.protocolMessage.editedMessage.{conversation|...})
  if (bucket === 'edit') {
    const editedGows = msgWrap?.editedMessage?.message || msgWrap?.protocolMessage?.editedMessage;
    const editedTargetId =
      extractId(webPayload?.id) ||
      msgWrap?.editedMessage?.key?.id ||
      msgWrap?.protocolMessage?.key?.id ||
      providerMsgId ||
      null;
    const newText =
      webPayload?.body ||
      webPayload?.newBody ||
      editedGows?.conversation ||
      editedGows?.extendedTextMessage?.text ||
      '';
    if (!editedTargetId || !newText) {
      return json({ ok: true, skipped: 'edit_missing_fields' });
    }
    const { data: msgRow } = await supabase
      .from('chat_messages')
      .select('id, content, metadata')
      .eq('uaz_msg_id', editedTargetId)
      .maybeSingle();
    if (!msgRow) return json({ ok: true, skipped: 'edit_target_not_found', target: editedTargetId });
    const prevMeta = (msgRow.metadata as any) || {};
    const edits = Array.isArray(prevMeta.edits) ? prevMeta.edits : [];
    edits.push({ at: new Date().toISOString(), from: msgRow.content });
    await supabase.from('chat_messages').update({
      content: String(newText),
      metadata: { ...prevMeta, edited: true, edited_at: new Date().toISOString(), edits },
    }).eq('id', msgRow.id);
    return json({ ok: true, edited: editedTargetId });
  }

  // ── PRESENCE ─────────────────────────────────────────────────────────────
  // Atualiza customers.presence / presence_updated_at / last_seen_at para o
  // contato correspondente ao chatId reportado. Nunca cria contato aqui — só
  // enriquece quem já existe sob este owner. Ignora grupos e @lid.
  if (bucket === 'presence') {
    try {
      // WEBJS: payload = { id: '<chatId>', presences: [{ id, isOnline, isGroup, lastKnownPresence, lastSeen }] }
      // GOWS (single):        data = { From, LastSeen, Unavailable }                     → online/offline
      // GOWS (chatpresence):  data = { MessageSource: { Chat }, State: 'composing'|'paused', Media: 'audio'|null }
      const webChatId: string | undefined = webPayload?.id;
      const webPres = Array.isArray(webPayload?.presences) ? webPayload.presences[0] : null;
      const gowsFrom: string | undefined = gowsData?.From || gowsData?.MessageSource?.Chat || gowsData?.MessageSource?.Sender;
      const gowsState: string | undefined = gowsData?.State || gowsData?.state;
      const gowsMedia: string | undefined = gowsData?.Media || gowsData?.media;

      const presenceChat = webChatId || gowsFrom || null;
      const presencePhone = normalizePhone(presenceChat);
      if (!presencePhone) return json({ ok: true, skipped: 'presence_no_phone' });

      // Estado normalizado: composing/recording/available/unavailable.
      let state: string = 'unknown';
      if (gowsState) {
        const s = String(gowsState).toLowerCase();
        if (s === 'composing' || s === 'typing') state = gowsMedia === 'audio' ? 'recording' : 'composing';
        else if (s === 'paused') state = 'paused';
        else if (s === 'available' || s === 'online') state = 'available';
        else if (s === 'unavailable' || s === 'offline') state = 'unavailable';
      } else if (webPres) {
        const s = String(webPres.lastKnownPresence || webPres.presence || '').toLowerCase();
        if (webPres.isOnline === true) state = s === 'composing' ? 'composing' : s === 'recording' ? 'recording' : 'available';
        else state = 'unavailable';
      } else if (gowsData?.Unavailable === true) {
        state = 'unavailable';
      } else if (gowsData?.Unavailable === false) {
        state = 'available';
      }

      const nowIso = new Date().toISOString();
      const lastSeenIso = (() => {
        const raw = webPres?.lastSeen ?? gowsData?.LastSeen ?? null;
        if (!raw) return null;
        // WEBJS lastSeen é unix seconds; GOWS entrega ISO string.
        if (typeof raw === 'number' && raw > 0) return new Date(raw * 1000).toISOString();
        if (typeof raw === 'string') { const t = Date.parse(raw); return Number.isFinite(t) ? new Date(t).toISOString() : null; }
        return null;
      })();

      const patch: Record<string, any> = {
        presence: state,
        presence_updated_at: nowIso,
      };
      if (state === 'available' || state === 'composing' || state === 'recording') {
        patch.last_seen_at = nowIso;
      } else if (lastSeenIso) {
        patch.last_seen_at = lastSeenIso;
      }

      const { error: updErr } = await supabase
        .from('customers')
        .update(patch)
        .eq('phone', presencePhone)
        .eq('owner_id', conn.owner_id);
      if (updErr) return json({ ok: true, presence_update_error: updErr.message });
      return json({ ok: true, presence: { phone: presencePhone, state, last_seen_at: patch.last_seen_at ?? null } });
    } catch (e: any) {
      return json({ ok: true, presence_error: e?.message || String(e) });
    }
  }

  // ── CONTACT / PROFILE UPDATES ────────────────────────────────────────────
  // Consolidated handler for WAHA events that carry contact metadata
  // (foto, nome, "sobre", bloqueio). Best-effort — sempre 200 para o WAHA.
  if (bucket === 'contact') {
    try {
      const webChatId: string | undefined =
        webPayload?.id || webPayload?.contactId || webPayload?.chatId || webPayload?.wid;
      const gowsJid: string | undefined =
        gowsData?.JID || gowsData?.From || gowsData?.Chat || gowsData?.Contact;
      const contactChat = webChatId || gowsJid || null;
      const contactPhone = normalizePhone(contactChat);
      if (!contactPhone) return json({ ok: true, skipped: 'contact_no_phone' });

      const patch: Record<string, any> = { profile_synced_at: new Date().toISOString() };
      const pic = webPayload?.profilePictureUrl || webPayload?.profilePicUrl
        || webPayload?.picture || gowsData?.PictureURL || gowsData?.PictureId ? (webPayload?.profilePictureUrl || webPayload?.picture || gowsData?.PictureURL || null) : null;
      if (pic && typeof pic === 'string') patch.avatar_url = pic;

      const about = webPayload?.about ?? webPayload?.status ?? gowsData?.Status ?? null;
      if (typeof about === 'string' && about.length) patch.profile_about = about;

      const push = webPayload?.pushname || webPayload?.name || webPayload?.notify
        || gowsData?.PushName || gowsData?.BusinessName || null;
      if (typeof push === 'string' && push.length) {
        const { data: current } = await supabase
          .from('customers').select('name').eq('phone', contactPhone).eq('owner_id', conn.owner_id).maybeSingle();
        if (!current?.name || /^\+?\d[\d\s-]*$/.test(String(current.name).trim())) patch.name = push;
      }

      // Bloqueio via WAHA (evento explícito ou blocklist).
      const evLower = String(event || '').toLowerCase();
      if (evLower === 'contact.blocked' || evLower.endsWith('.blocklisteventdata') && gowsData?.Action === 'add') patch.is_blocked = true;
      if (evLower === 'contact.unblocked' || (evLower.endsWith('.blocklisteventdata') && gowsData?.Action === 'remove')) patch.is_blocked = false;

      const { error: updErr } = await supabase
        .from('customers').update(patch).eq('phone', contactPhone).eq('owner_id', conn.owner_id);
      if (updErr) return json({ ok: true, contact_update_error: updErr.message });
      return json({ ok: true, contact: { phone: contactPhone, patch } });
    } catch (e: any) {
      return json({ ok: true, contact_error: e?.message || String(e) });
    }
  }

  // ── LABEL EVENTS (Etapa 7) ───────────────────────────────────────────────
  // Sincroniza a taxonomia de etiquetas do WhatsApp e as associações chat↔label.
  if (bucket === 'label') {
    try {
      const evLower = String(event || '').toLowerCase();
      const isAssoc = evLower.includes('label.chat') || evLower.endsWith('.labelassociationchateventdata');
      const isDeleted = evLower === 'label.deleted';

      // Upsert/delete de etiqueta em si.
      if (!isAssoc) {
        const lid = String(webPayload?.id || webPayload?.labelId || gowsData?.LabelID || gowsData?.ID || '').trim();
        const lname = String(webPayload?.name || webPayload?.title || gowsData?.Name || '').slice(0, 120);
        const lcolor = webPayload?.hexColor || webPayload?.color || gowsData?.Color || null;
        if (!lid) return json({ ok: true, skipped: 'label_no_id' });
        if (isDeleted) {
          await supabase.from('chat_tags').delete()
            .eq('owner_id', conn.owner_id).eq('waha_label_id', lid);
          return json({ ok: true, label_deleted: lid });
        }
        if (!lname) return json({ ok: true, skipped: 'label_no_name' });
        await supabase.from('chat_tags').upsert({
          owner_id: conn.owner_id,
          sub_company_id: conn.sub_company_id ?? null,
          waha_label_id: lid, name: lname, color: lcolor,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: 'owner_id,waha_label_id' });
        return json({ ok: true, label_upsert: { id: lid, name: lname } });
      }

      // Associação chat↔label (added/deleted).
      const chatIdRaw = webPayload?.chatId || webPayload?.id || gowsData?.JID || gowsData?.Chat || null;
      const chatPhone = normalizePhone(chatIdRaw);
      const labelId = String(webPayload?.labelId || gowsData?.LabelID || '').trim();
      const added = evLower.endsWith('.added') || (gowsData?.Type === 'add');
      if (!chatPhone || !labelId) return json({ ok: true, skipped: 'assoc_incomplete' });
      const { data: tag } = await supabase
        .from('chat_tags').select('id')
        .eq('owner_id', conn.owner_id).eq('waha_label_id', labelId).maybeSingle();
      if (!tag?.id) return json({ ok: true, skipped: 'assoc_tag_missing' });
      const { data: cust } = await supabase
        .from('customers').select('id, label_ids')
        .eq('owner_id', conn.owner_id).eq('phone', chatPhone).maybeSingle();
      if (!cust?.id) return json({ ok: true, skipped: 'assoc_customer_missing' });
      const current: string[] = Array.isArray((cust as any).label_ids) ? (cust as any).label_ids : [];
      const next = added
        ? Array.from(new Set([...current, tag.id]))
        : current.filter((x) => x !== tag.id);
      await supabase.from('customers').update({ label_ids: next } as any).eq('id', cust.id);
      return json({ ok: true, label_assoc: { chatPhone, labelId, added } });
    } catch (e: any) {
      return json({ ok: true, label_error: e?.message || String(e) });
    }
  }

  // ── CHAT META (arquivar/silenciar) ───────────────────────────────────────
  if (bucket === 'chat_meta') {
    try {
      const chatIdRaw = webPayload?.id || webPayload?.chatId || gowsData?.JID || gowsData?.Chat || null;
      const cphone = normalizePhone(chatIdRaw);
      if (!cphone) return json({ ok: true, skipped: 'chat_meta_no_phone' });
      const evLower = String(event || '').toLowerCase();
      const patch: Record<string, any> = {};
      if (evLower === 'chat.archive' || evLower.endsWith('.archivechateventdata')) patch.is_archived = true;
      if (evLower === 'chat.unarchive') patch.is_archived = false;
      if (evLower === 'chat.mute' || evLower.endsWith('.mutechateventdata')) {
        patch.is_muted = true;
        const until = webPayload?.expiration || gowsData?.MuteEndTime || null;
        patch.muted_until = until ? new Date(Number(until) * (String(until).length > 12 ? 1 : 1000)).toISOString() : null;
      }
      if (evLower === 'chat.unmute') { patch.is_muted = false; patch.muted_until = null; }
      if (typeof gowsData?.Archived === 'boolean') patch.is_archived = gowsData.Archived;
      if (typeof gowsData?.Muted === 'boolean') patch.is_muted = gowsData.Muted;
      if (!Object.keys(patch).length) return json({ ok: true, skipped: 'chat_meta_noop' });
      await supabase.from('customers').update(patch)
        .eq('owner_id', conn.owner_id).eq('phone', cphone);
      return json({ ok: true, chat_meta: { phone: cphone, patch } });
    } catch (e: any) {
      return json({ ok: true, chat_meta_error: e?.message || String(e) });
    }
  }


  // ── REVOKE / DELETE ──────────────────────────────────────────────────────
  // WEBJS: message.revoke_everyone { after: { id }, before: {...} } ou payload.id
  // GOWS:  msgWrap.protocolMessage = { type: 'REVOKE', key: { id } }
  if (bucket === 'revoke') {
    const revokedId =
      extractId(webPayload?.after?.id) ||
      extractId(webPayload?.before?.id) ||
      extractId(webPayload?.id) ||
      msgWrap?.protocolMessage?.key?.id ||
      msgWrap?.protocolMessage?.key?.ID ||
      providerMsgId ||
      null;
    if (!revokedId) return json({ ok: true, skipped: 'revoke_missing_id' });
    const { data: msgRow } = await supabase
      .from('chat_messages')
      .select('id, content, metadata')
      .eq('uaz_msg_id', revokedId)
      .maybeSingle();
    if (!msgRow) return json({ ok: true, skipped: 'revoke_target_not_found', target: revokedId });
    const prevMeta = (msgRow.metadata as any) || {};
    await supabase.from('chat_messages').update({
      content: '[mensagem apagada]',
      metadata: {
        ...prevMeta,
        revoked: true,
        revoked_at: new Date().toISOString(),
        original_content: prevMeta.original_content ?? msgRow.content,
      },
    }).eq('id', msgRow.id);
    return json({ ok: true, revoked: revokedId });
  }

  // ── INBOUND MESSAGE ──────────────────────────────────────────────────────
  // Prefer GOWS Info; fall back to WEBJS payload and Baileys _data wrapper.
  const fromMeFlag =
    webPayload?.fromMe === true ||
    info?.IsFromMe === true ||
    webPayload?._data?.Info?.IsFromMe === true;

  // Counterparty JID: for inbound messages it's the sender; for messages the
  // user sent from another device (fromMe=true) it's the recipient. WEBJS
  // exposes `to`; GOWS keeps `Info.Chat` pointing at the peer even for fromMe.
  const rawFrom: string | undefined = fromMeFlag
    ? (webPayload?.to ||
       info?.Chat ||
       webPayload?._data?.Info?.Chat ||
       webPayload?.from)
    : (webPayload?.from ||
       info?.Chat ||
       info?.Sender ||
       webPayload?._data?.Info?.Chat);

  const senderAlt: string | undefined =
    info?.SenderAlt ||
    info?.RecipientAlt ||
    webPayload?._data?.Info?.SenderAlt ||
    webPayload?._data?.Info?.RecipientAlt;
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
  if (isGroup) return json({ ok: true, skipped: 'group_message' });

  // If Sender/Chat is a @lid (Baileys "linked id"), the real phone must come
  // from SenderAlt. Normalizing the LID itself creates an invalid contact and
  // makes the chat disappear after refresh because it no longer matches the
  // user's WhatsApp number.
  const rawFromIsLid = typeof rawFrom === 'string' && rawFrom.includes('@lid');
  const phone = rawFromIsLid
    ? normalizePhone(senderAlt) || normalizePhone(rawFrom)
    : normalizePhone(rawFrom) || normalizePhone(senderAlt);
  if (!phone) return json({ ok: true, skipped: 'no_individual_sender', rawFrom, senderAlt, from_me: fromMeFlag });

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

  const pushName: string | null = fromMeFlag
    ? null // don't overwrite contact name with our own device pushName
    : (info?.PushName || webPayload?._data?.Info?.PushName || webPayload?.notifyName || null);

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

  // Etapa 3 — quoted/reply context.
  // WEBJS: payload.hasQuotedMsg + payload._data.quotedMsg / quotedStanzaID
  // GOWS:  msgWrap.extendedTextMessage.contextInfo { stanzaId, participant, quotedMessage }
  //        or contextInfo directly under msgWrap for media replies.
  const ctxInfo =
    msgWrap?.extendedTextMessage?.contextInfo ||
    msgWrap?.imageMessage?.contextInfo ||
    msgWrap?.videoMessage?.contextInfo ||
    msgWrap?.audioMessage?.contextInfo ||
    msgWrap?.documentMessage?.contextInfo ||
    null;
  const webQuoted = webPayload?._data?.quotedMsg || webPayload?.quotedMsg || null;
  const quotedProviderId =
    ctxInfo?.stanzaId ||
    ctxInfo?.StanzaId ||
    webPayload?._data?.quotedStanzaID ||
    webPayload?.quotedStanzaID ||
    extractId(webQuoted?.id) ||
    null;
  const quotedBodyRaw =
    ctxInfo?.quotedMessage?.conversation ||
    ctxInfo?.quotedMessage?.extendedTextMessage?.text ||
    ctxInfo?.quotedMessage?.imageMessage?.caption ||
    ctxInfo?.quotedMessage?.videoMessage?.caption ||
    webQuoted?.body ||
    webQuoted?.caption ||
    '';
  const quotedParticipant =
    ctxInfo?.participant ||
    ctxInfo?.Participant ||
    webQuoted?.from ||
    null;
  const quotedFromMe =
    webQuoted?.fromMe === true ||
    ctxInfo?.quotedMessage?.key?.fromMe === true ||
    false;
  const quotedMeta = quotedProviderId
    ? {
        message_id: quotedProviderId,
        body: (typeof quotedBodyRaw === 'string' ? quotedBodyRaw : '').slice(0, 240),
        from_me: quotedFromMe,
        participant: typeof quotedParticipant === 'string' ? quotedParticipant : null,
      }
    : null;

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
    sender_type: fromMeFlag ? 'agent' : 'client',
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
      ...(quotedMeta ? { quoted: quotedMeta } : {}),
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
