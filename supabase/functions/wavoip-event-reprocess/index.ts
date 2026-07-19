// Reprocess a Wavoip webhook event that failed to render its chat bubble.
//
// Contract:
//  - POST { event_id: string }
//  - Requires an authenticated user (verify_jwt = true).
//  - Uses the caller's JWT to SELECT wavoip_webhook_events — RLS restricts
//    the row to owners/admins of the same tenant, so we don't need extra
//    authz here.
//  - Uses service role to UPSERT the derived call_event bubble in
//    chat_messages (idempotent via client_msg_id = wavoip_call:<id>:<status>).
//
// This is intentionally narrow: it does NOT re-drive call_history updates,
// it does NOT re-fire external side effects, it does NOT expose the raw
// payload publicly. It only regenerates the in-chat visual event.
//
// NOTE: keep this file free of imports from the main webhook — we want it to
// be independently deployable and diff-visible.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const FINAL_STATUSES = new Set(['ended', 'missed', 'failed', 'rejected']);

function mapStatus(ev: string | undefined | null): string | null {
  if (!ev) return null;
  const e = String(ev).toLowerCase();
  if (['answered', 'answer', 'in-call', 'in_call', 'active', 'accept', 'accepted'].includes(e)) return 'answered';
  if (['ended', 'end', 'hangup', 'terminated', 'completed', 'finished'].includes(e)) return 'ended';
  if (['missed', 'no-answer', 'noanswer'].includes(e)) return 'missed';
  if (['failed', 'error', 'canceled', 'cancelled', 'busy', 'rejected'].includes(e)) return 'failed';
  return null;
}

function pick(obj: any, keys: string[]): any {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  }
  return undefined;
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ ok: false, reason: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return jsonResp({ ok: false, reason: 'unauthenticated' }, 401);

  const authed = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });

  let body: any = {};
  try { body = await req.json(); } catch { return jsonResp({ ok: false, reason: 'invalid_json' }, 400); }

  const eventId: string | null = body?.event_id ?? null;
  if (!eventId) return jsonResp({ ok: false, reason: 'missing_event_id' }, 400);

  // RLS-guarded read: if the user isn't allowed to see this row, we stop here.
  const { data: ev, error: evErr } = await authed
    .from('wavoip_webhook_events')
    .select('id, event, status, wavoip_call_id, call_id, phone_number, payload, owner_id, sub_company_id, call_history_id, received_at')
    .eq('id', eventId)
    .maybeSingle();

  if (evErr || !ev) return jsonResp({ ok: false, reason: 'not_found_or_forbidden' }, 404);

  const payload = ev.payload ?? {};
  const rawStatus = pick(payload, ['event', 'status', 'call_status', 'state']) ?? ev.event;
  const status = mapStatus(rawStatus as string);
  if (!status) return jsonResp({ ok: false, reason: 'unmappable_status' }, 422);

  const direction = String(pick(payload, ['direction', 'call_direction']) ?? 'outbound');
  const dirNorm = direction === 'inbound' || direction === 'in' ? 'inbound' : 'outbound';
  const phone: string | null = ev.phone_number ?? pick(payload, ['phone', 'number', 'from', 'to']) ?? null;
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return jsonResp({ ok: false, reason: 'missing_phone' }, 422);

  const wavoipCallId: string | null = ev.wavoip_call_id ?? pick(payload, ['wavoip_call_id', 'callId', 'call_id']) ?? null;
  const callId: string | null = ev.call_id ?? pick(payload, ['call_id', 'callId']) ?? null;
  const callKey = wavoipCallId || callId;
  if (!callKey) return jsonResp({ ok: false, reason: 'missing_call_id' }, 422);

  const duration = Number(pick(payload, ['duration', 'duration_seconds', 'talk_time']) ?? 0) || 0;
  const isFinal = FINAL_STATUSES.has(status);

  // Locate the customer within the same tenant scope.
  const scoped = (q: any) => {
    q = q.eq('owner_id', ev.owner_id);
    return ev.sub_company_id ? q.eq('sub_company_id', ev.sub_company_id) : q.is('sub_company_id', null);
  };
  let customerId: string | null = null;
  const { data: exact } = await scoped(
    admin.from('customers').select('id').eq('phone', digits).order('updated_at', { ascending: false }).limit(1),
  );
  customerId = (exact as any[] | null)?.[0]?.id ?? null;
  if (!customerId && digits.length >= 8) {
    const suffix = digits.slice(-8);
    const { data: fuzzy } = await scoped(
      admin.from('customers').select('id').ilike('phone', `%${suffix}`).order('updated_at', { ascending: false }).limit(1),
    );
    customerId = (fuzzy as any[] | null)?.[0]?.id ?? null;
  }
  if (!customerId) return jsonResp({ ok: false, reason: 'customer_not_found' }, 404);

  let content = 'Ligação de voz';
  if (status === 'missed') content = dirNorm === 'inbound' ? '📞 Ligação de voz perdida' : '📞 Ligação não atendida';
  else if (status === 'failed' || status === 'rejected') content = dirNorm === 'inbound' ? '📞 Ligação recusada' : '📞 Ligação não completada';
  else if (duration > 0) {
    const mm = String(Math.floor(duration / 60)).padStart(2, '0');
    const ss = String(Math.round(duration) % 60).padStart(2, '0');
    content = `📞 ${dirNorm === 'inbound' ? 'Ligação recebida' : 'Ligação efetuada'} · ${mm}:${ss}`;
  } else {
    content = dirNorm === 'inbound' ? '📞 Ligação de voz recebida' : '📞 Ligação de voz efetuada';
  }

  const clientMsgId = `wavoip_call:${callKey}:${status}`;
  const { error: upErr } = await admin.from('chat_messages').upsert({
    customer_id: customerId,
    sub_company_id: ev.sub_company_id,
    channel: 'whatsapp',
    sender_type: 'system',
    content,
    client_msg_id: clientMsgId,
    metadata: {
      kind: 'call_event',
      call_status: status,
      direction: dirNorm,
      duration_seconds: isFinal ? Math.round(duration) : null,
      wavoip_call_id: wavoipCallId,
      call_id: callId,
      phone: digits,
      call_history_id: ev.call_history_id,
      reprocessed_from_event: ev.id,
    },
  }, { onConflict: 'client_msg_id', ignoreDuplicates: false });

  if (upErr) return jsonResp({ ok: false, reason: 'insert_failed', detail: upErr.message }, 500);

  // Best-effort: mark the event as reprocessed (non-fatal).
  try {
    await admin
      .from('wavoip_webhook_events')
      .update({ status: 'success', error_message: `reprocessed at ${new Date().toISOString()}` })
      .eq('id', ev.id);
  } catch { /* ignore */ }

  return jsonResp({ ok: true, customer_id: customerId, client_msg_id: clientMsgId });
});
