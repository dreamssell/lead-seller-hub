// waha-audit — owner-only audit endpoint to trace inbound WAHA messages.
// Access is restricted to platform owners (has_role admin) and results are
// strictly scoped to a single owner_id. Input is validated with Zod; every
// response emits a structured JSON log line with latency, row counts, cursor
// echo and a hashed owner id for safe log correlation.

import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { z } from 'npm:zod@3.23.8';

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

const BodySchema = z.object({
  owner_id: z.string().uuid({ message: 'owner_id must be uuid' }),
  message_id: z.string().min(1).max(200).nullish(),
  connection_id: z.string().uuid().nullish(),
  sub_company_id: z.string().uuid().nullish(),
  call_id: z.string().uuid().nullish(),
  wavoip_call_id: z.string().min(1).max(200).nullish(),
  limit: z.number().int().min(1).max(500).default(100),
  since_hours: z.number().int().min(1).max(24 * 30).default(24),
  order: z.enum(['asc', 'desc']).default('desc'),
  cursor: z.string().datetime({ offset: true }).nullish(),
  gaps_only: z.boolean().optional(),
}).strict();

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const startedAt = performance.now();
  const requestId = crypto.randomUUID();
  const log = (level: 'info' | 'warn' | 'error', event: string, extra: Record<string, unknown> = {}) => {
    const line = {
      ts: new Date().toISOString(),
      level, event, request_id: requestId,
      latency_ms: +(performance.now() - startedAt).toFixed(1),
      source: 'waha-audit',
      ...extra,
    };
    // Structured single-line JSON so logs can be grep/queried easily.
    console.log(JSON.stringify(line));
  };

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    log('warn', 'unauthorized_missing_bearer');
    return json({ error: 'unauthorized' }, 401);
  }

  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    log('warn', 'unauthorized_invalid_or_expired_jwt', { detail: claimsErr?.message });
    return json({ error: 'unauthorized', reason: 'invalid_or_expired_token' }, 401);
  }
  const callerId = claimsData.claims.sub as string;
  const callerHash = (await sha256Hex(callerId)).slice(0, 12);

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
        metadata: { caller_id: callerId, caller_hash: callerHash, reason, request_id: requestId, source: 'waha-audit', ...meta },
      });
    } catch { /* best-effort */ }
  };

  if (!isOwner) {
    await logDenied('not_platform_owner');
    log('warn', 'forbidden_not_owner', { caller_hash: callerHash });
    return json({ error: 'forbidden', reason: 'not_platform_owner' }, 403);
  }

  let rawBody: unknown = {};
  try { rawBody = await req.json(); } catch { rawBody = {}; }
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    log('warn', 'invalid_body', { issues: parsed.error.flatten() });
    return json({ error: 'invalid_body', issues: parsed.error.flatten() }, 400);
  }
  const {
    owner_id: ownerId, message_id: messageId, connection_id: connectionId,
    sub_company_id: subCompanyId, call_id: callFilterId, wavoip_call_id: wavoipCallFilter,
    limit, since_hours: sinceHours, order, cursor,
  } = parsed.data;
  const ownerHash = (await sha256Hex(ownerId)).slice(0, 12);

  // Validate owner_id belongs to a real tenant
  const [{ data: ownerCompany }, { data: ownerSub }] = await Promise.all([
    admin.from('client_companies').select('auth_user_id, name').eq('auth_user_id', ownerId).maybeSingle(),
    admin.from('sub_companies').select('id, owner_id').eq('owner_id', ownerId).limit(1).maybeSingle(),
  ]);
  if (!ownerCompany && !ownerSub) {
    await logDenied('owner_not_found', { owner_hash: ownerHash });
    log('warn', 'owner_not_found', { owner_hash: ownerHash });
    return json({ error: 'owner_not_found' }, 404);
  }

  const sinceIso = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
  const ascending = order === 'asc';

  let connQuery = admin.from('whatsapp_connections')
    .select('id, name, phone_number, status, owner_id, sub_company_id, provider, updated_at, last_checked_at')
    .eq('provider', 'waha')
    .eq('owner_id', ownerId);
  if (subCompanyId) connQuery = connQuery.eq('sub_company_id', subCompanyId);
  if (connectionId) connQuery = connQuery.eq('id', connectionId);
  const { data: connections, error: connErr } = await connQuery.limit(50);
  if (connErr) { log('error', 'connections_read_failed', { detail: connErr.message }); return json({ error: 'connections_read_failed', detail: connErr.message }, 500); }

  const connIds = (connections ?? []).map((c) => c.id);
  if (connIds.length === 0 && !messageId) {
    const payload = {
      ok: true, owner_id: ownerId, connections: [], events: [], messages: [], calls: [],
      gaps: [], stats: { events_total: 0, message_events: 0, messages_stored: 0, gaps: 0, gap_rate: 0, since_iso: sinceIso },
      pagination: { limit, order, next_cursor: null, cursor_used: cursor ?? null }, alerts: [],
      meta: { request_id: requestId, owner_hash: ownerHash },
    };
    log('info', 'empty_scope', { owner_hash: ownerHash, limit, order });
    return json(payload);
  }

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
  if (evErr) { log('error', 'events_read_failed', { detail: evErr.message }); return json({ error: 'events_read_failed', detail: evErr.message }, 500); }

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
  if (msgErr) { log('error', 'messages_read_failed', { detail: msgErr.message }); return json({ error: 'messages_read_failed', detail: msgErr.message }, 500); }

  let callsQ = admin.from('call_history')
    .select('id, wavoip_call_id, phone_number, contact_name, direction, status, duration_seconds, started_at, answered_at, ended_at, created_at, owner_id, sub_company_id')
    .eq('owner_id', ownerId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending })
    .limit(limit);
  if (subCompanyId) callsQ = callsQ.eq('sub_company_id', subCompanyId);
  if (callFilterId) callsQ = callsQ.eq('id', callFilterId);
  if (wavoipCallFilter) callsQ = callsQ.eq('wavoip_call_id', wavoipCallFilter);
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
        metadata: { owner_hash: ownerHash, connection_ids: connIds, gap_count: gaps.length, alerts, request_id: requestId, source: 'waha-audit' },
      });
    } catch { /* best-effort */ }
  }

  const lastEvent = (events ?? [])[(events ?? []).length - 1];
  const nextCursor = events && events.length === limit && lastEvent ? lastEvent.created_at : null;

  log('info', 'ok', {
    owner_hash: ownerHash, limit, order, cursor_used: cursor ?? null, next_cursor: nextCursor,
    events: stats.events_total, messages: stats.messages_stored, calls: (calls ?? []).length,
    gaps: stats.gaps, gap_rate: stats.gap_rate, alerts_count: alerts.length,
  });

  return json({
    ok: true, owner_id: ownerId, message_id: messageId ?? null,
    connections, events, messages, calls: calls ?? [], gaps, stats, alerts,
    pagination: { limit, order, next_cursor: nextCursor, cursor_used: cursor ?? null },
    meta: { request_id: requestId, owner_hash: ownerHash },
  });
});
