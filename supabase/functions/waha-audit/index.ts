// waha-audit — owner-only audit endpoint to trace inbound WAHA messages.
// Given an owner_id (and optional message_id/connection_id), returns:
//   - webhook events stored in connection_events (waha.*)
//   - matching chat_messages rows recorded by the pipeline
//   - gaps: message-bucket events without a corresponding chat_messages row
//   - stats + telemetry so alerts can trigger when webhook fires but the
//     message never lands / realtime never dispatches.
//
// Access is restricted to platform owners (has_role admin).

import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) return json({ error: 'unauthorized' }, 401);
  const callerId = claimsData.claims.sub as string;

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: isOwner } = await admin.rpc('has_role', { _user_id: callerId, _role: 'admin' as any });

  const logDenied = async (reason: string, meta: Record<string, unknown> = {}) => {
    try {
      await admin.from('telemetry_logs').insert({
        type: 'waha_audit_denied',
        message: `waha-audit acesso negado: ${reason}`,
        metadata: { caller_id: callerId, reason, source: 'waha-audit', ...meta },
      });
    } catch { /* best-effort */ }
  };

  if (!isOwner) {
    await logDenied('not_platform_owner');
    return json({ error: 'forbidden', reason: 'not_platform_owner' }, 403);
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const ownerId: string | null = body?.owner_id || null;
  const messageId: string | null = body?.message_id || null;
  const connectionId: string | null = body?.connection_id || null;
  const subCompanyId: string | null = body?.sub_company_id || null;
  const limit = Math.max(1, Math.min(500, Number(body?.limit ?? 100)));
  const sinceHours = Math.max(1, Math.min(24 * 30, Number(body?.since_hours ?? 24)));
  const order: 'asc' | 'desc' = body?.order === 'asc' ? 'asc' : 'desc';
  const cursor: string | null = typeof body?.cursor === 'string' ? body.cursor : null;

  if (!ownerId) {
    await logDenied('missing_owner_id');
    return json({ error: 'missing_owner_id', hint: 'owner_id é obrigatório para escopo de auditoria' }, 400);
  }

  // Validate owner_id belongs to a real tenant
  const [{ data: ownerCompany }, { data: ownerSub }] = await Promise.all([
    admin.from('client_companies').select('auth_user_id, name').eq('auth_user_id', ownerId).maybeSingle(),
    admin.from('sub_companies').select('id, owner_id').eq('owner_id', ownerId).limit(1).maybeSingle(),
  ]);
  if (!ownerCompany && !ownerSub) {
    await logDenied('owner_not_found', { owner_id: ownerId });
    return json({ error: 'owner_not_found' }, 404);
  }

  const sinceIso = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
  const ascending = order === 'asc';

  // 1. WAHA connections in strict owner scope
  let connQuery = admin.from('whatsapp_connections')
    .select('id, name, phone_number, status, owner_id, sub_company_id, provider, updated_at, last_checked_at')
    .eq('provider', 'waha')
    .eq('owner_id', ownerId);
  if (subCompanyId) connQuery = connQuery.eq('sub_company_id', subCompanyId);
  if (connectionId) connQuery = connQuery.eq('id', connectionId);
  const { data: connections, error: connErr } = await connQuery.limit(50);
  if (connErr) return json({ error: 'connections_read_failed', detail: connErr.message }, 500);

  const connIds = (connections ?? []).map((c) => c.id);
  if (connIds.length === 0 && !messageId) {
    return json({
      ok: true, owner_id: ownerId, connections: [], events: [], messages: [], calls: [],
      gaps: [], stats: { events_total: 0, message_events: 0, messages_stored: 0, gaps: 0, gap_rate: 0, since_iso: sinceIso },
      pagination: { limit, order, next_cursor: null }, alerts: [],
    });
  }

  // 2. Events with cursor pagination + ordering
  let evQ = admin.from('connection_events')
    .select('id, connection_id, created_at, event_type, status, metadata_json, payload')
    .like('event_type', 'waha.%')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending })
    .limit(limit);
  if (connIds.length) evQ = evQ.in('connection_id', connIds);
  if (messageId) evQ = evQ.contains('metadata_json', { provider_msg_id: messageId } as any);
  if (cursor) evQ = ascending ? evQ.gt('created_at', cursor) : evQ.lt('created_at', cursor);
  const { data: events, error: evErr } = await evQ;
  if (evErr) return json({ error: 'events_read_failed', detail: evErr.message }, 500);

  // 3. Messages (owner-scoped)
  let msgQ = admin.from('chat_messages')
    .select('id, created_at, uaz_msg_id, connection_id, customer_id, content, sender_type, metadata, customers!inner(owner_id, phone, name)')
    .eq('channel', 'whatsapp')
    .eq('sender_type', 'client')
    .eq('customers.owner_id', ownerId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending })
    .limit(limit);
  if (connIds.length) msgQ = msgQ.in('connection_id', connIds);
  if (messageId) msgQ = msgQ.eq('uaz_msg_id', messageId);
  if (cursor) msgQ = ascending ? msgQ.gt('created_at', cursor) : msgQ.lt('created_at', cursor);
  const { data: messages, error: msgErr } = await msgQ;
  if (msgErr) return json({ error: 'messages_read_failed', detail: msgErr.message }, 500);

  // 3b. Calls — for CSV/PDF cross-reference (call_id + wavoip_call_id + timestamps)
  let callsQ = admin.from('call_history')
    .select('id, wavoip_call_id, phone_number, contact_name, direction, status, duration_seconds, started_at, answered_at, ended_at, created_at, owner_id, sub_company_id')
    .eq('owner_id', ownerId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending })
    .limit(limit);
  if (subCompanyId) callsQ = callsQ.eq('sub_company_id', subCompanyId);
  const { data: calls } = await callsQ;

  const storedIds = new Set((messages ?? []).map((m: any) => m.uaz_msg_id).filter(Boolean));
  const gaps = (events ?? [])
    .filter((e: any) => {
      const meta = e.metadata_json || {};
      if (meta.bucket !== 'message') return false;
      if (!meta.provider_msg_id) return false;
      if (meta.is_test) return false;
      return !storedIds.has(meta.provider_msg_id) && !meta.chat_message_id;
    })
    .map((e: any) => ({
      event_id: e.id, created_at: e.created_at, connection_id: e.connection_id,
      provider_msg_id: e.metadata_json?.provider_msg_id,
      sender_lid: e.metadata_json?.sender_lid, sender_jid: e.metadata_json?.sender_jid,
      owner_id: e.metadata_json?.owner_id, raw_event: e.metadata_json?.raw_event,
    }));

  const messageEvents = (events ?? []).filter((e: any) => e.metadata_json?.bucket === 'message').length;
  const stats = {
    events_total: events?.length ?? 0,
    message_events: messageEvents,
    messages_stored: messages?.length ?? 0,
    gaps: gaps.length,
    gap_rate: messageEvents > 0 ? +(gaps.length / messageEvents).toFixed(3) : 0,
    since_iso: sinceIso,
  };

  const alerts: string[] = [];
  if (stats.gap_rate >= 0.1) alerts.push('gap_rate_over_10pct');
  if (messageEvents > 0 && stats.messages_stored === 0) alerts.push('webhook_ok_no_render');
  if ((connections ?? []).some((c) => c.status && !['connected', 'WORKING', 'online'].includes(String(c.status)))) {
    alerts.push('connection_not_working');
  }

  if (gaps.length > 0) {
    try {
      await admin.from('telemetry_logs').insert({
        type: 'waha_audit_gap',
        message: `WAHA audit detectou ${gaps.length} eventos sem chat_messages`,
        metadata: { owner_id: ownerId, connection_ids: connIds, gap_count: gaps.length, alerts, source: 'waha-audit' },
      });
    } catch { /* best-effort */ }
  }

  const lastEvent = (events ?? [])[(events ?? []).length - 1];
  const nextCursor = events && events.length === limit && lastEvent ? lastEvent.created_at : null;

  return json({
    ok: true, owner_id: ownerId, message_id: messageId,
    connections, events, messages, calls: calls ?? [], gaps, stats, alerts,
    pagination: { limit, order, next_cursor: nextCursor },
  });
});
