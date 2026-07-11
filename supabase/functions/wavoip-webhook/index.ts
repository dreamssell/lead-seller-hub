// Wavoip webhook receiver
// Endpoint público chamado pela Wavoip a cada evento de ligação.
// Segurança: token compartilhado via query string (?token=...) OU header
// `X-Webhook-Token`, comparado contra a variável WAVOIP_WEBHOOK_SECRET.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRET = Deno.env.get('WAVOIP_WEBHOOK_SECRET') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type EventStatus =
  | 'success'
  | 'unauthorized'
  | 'bad_payload'
  | 'not_found'
  | 'update_error'
  | 'inserted_stub';

function mapStatus(ev: string | undefined | null): string | null {
  if (!ev) return null;
  const e = String(ev).toLowerCase();
  if (['answered', 'answer', 'in-call', 'in_call', 'accept', 'accepted'].includes(e)) return 'answered';
  if (['ended', 'end', 'hangup', 'terminated', 'completed', 'finished'].includes(e)) return 'ended';
  if (['missed', 'no-answer', 'noanswer'].includes(e)) return 'missed';
  if (['failed', 'error', 'canceled', 'cancelled', 'busy', 'rejected'].includes(e)) return 'failed';
  if (['ringing', 'ring'].includes(e)) return 'ringing';
  if (['initiated', 'invite', 'dialing'].includes(e)) return 'initiated';
  return null;
}

function toIso(v: any): string | null {
  if (!v) return null;
  if (typeof v === 'number') {
    const ms = v < 1e12 ? v * 1000 : v;
    return new Date(ms).toISOString();
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function pick<T = any>(obj: any, keys: string[]): T | undefined {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  }
  return undefined;
}

async function logEvent(row: {
  event?: string | null;
  status: EventStatus;
  wavoip_call_id?: string | null;
  phone_number?: string | null;
  call_history_id?: string | null;
  http_status: number;
  error_message?: string | null;
  payload: any;
  source_ip?: string | null;
}) {
  try {
    await admin.from('wavoip_webhook_events').insert(row);
  } catch (e) {
    console.warn('[wavoip-webhook] failed to persist event log', (e as Error).message);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    null;
  const token = url.searchParams.get('token') || req.headers.get('x-webhook-token') || '';

  if (!SECRET || token !== SECRET) {
    await logEvent({
      status: 'unauthorized',
      http_status: 401,
      error_message: !SECRET ? 'WAVOIP_WEBHOOK_SECRET not configured' : 'invalid token',
      payload: { url: url.pathname, has_token: !!token },
      source_ip: ip,
    });
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    await logEvent({
      status: 'bad_payload',
      http_status: 400,
      error_message: 'Invalid JSON body',
      payload: {},
      source_ip: ip,
    });
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const data = payload?.data ?? payload ?? {};
  const event: string = payload?.event ?? data?.event ?? data?.status ?? '';

  const wavoipCallId: string | undefined = pick(data, [
    'wavoip_call_id', 'call_id', 'callId', 'id', 'uuid', 'session_id',
  ]);
  const phone: string | undefined = pick(data, ['phone', 'number', 'to', 'from', 'destination', 'caller', 'callee']);
  const direction: string | undefined = pick(data, ['direction', 'type']);
  const startedAt = toIso(pick(data, ['started_at', 'start_time', 'startedAt', 'created_at']));
  const answeredAt = toIso(pick(data, ['answered_at', 'answer_time', 'answeredAt']));
  const endedAt = toIso(pick(data, ['ended_at', 'end_time', 'endedAt', 'hangup_time']));
  const duration = Number(pick(data, ['duration', 'duration_seconds', 'talk_time', 'call_duration'])) || null;
  const recordingUrl: string | undefined = pick(data, ['recording_url', 'recordingUrl', 'record_url', 'audio_url']);
  const status = mapStatus(event) ?? mapStatus(data?.status);

  let updated = 0;
  let matchedId: string | null = null;
  let updateError: string | null = null;
  let outcome: EventStatus = 'success';

  if (wavoipCallId) {
    const patch: Record<string, any> = {};
    if (status) patch.status = status;
    if (answeredAt) patch.answered_at = answeredAt;
    if (endedAt) patch.ended_at = endedAt;
    if (duration && duration > 0) patch.duration_seconds = Math.round(duration);
    if (recordingUrl) patch.recording_url = recordingUrl;

    if (Object.keys(patch).length > 0) {
      const { data: rows, error } = await admin
        .from('call_history')
        .update(patch)
        .filter('metadata->>wavoip_call_id', 'eq', wavoipCallId)
        .select('id');
      if (error) {
        updateError = error.message;
        outcome = 'update_error';
        console.warn('[wavoip-webhook] update failed', error.message);
      } else {
        updated = rows?.length ?? 0;
        matchedId = rows?.[0]?.id ?? null;
        if (updated === 0) {
          // Cria stub se possível (chamada iniciada fora do webphone)
          if (status === 'ended' || status === 'answered') {
            const { data: ins, error: insErr } = await admin
              .from('call_history')
              .insert({
                channel: 'wavoip',
                direction: direction === 'inbound' || direction === 'in' ? 'inbound' : 'outbound',
                phone_number: phone ?? 'unknown',
                status: status ?? 'ended',
                started_at: startedAt ?? new Date().toISOString(),
                answered_at: answeredAt,
                ended_at: endedAt,
                duration_seconds: duration && duration > 0 ? Math.round(duration) : null,
                recording_url: recordingUrl ?? null,
                metadata: { wavoip_call_id: wavoipCallId, source: 'webhook' },
              })
              .select('id')
              .single();
            if (insErr) {
              updateError = insErr.message;
              outcome = 'update_error';
            } else {
              matchedId = ins?.id ?? null;
              updated = 1;
              outcome = 'inserted_stub';
            }
          } else {
            outcome = 'not_found';
          }
        }
      }
    }
  } else {
    outcome = 'bad_payload';
    updateError = 'missing wavoip_call_id in payload';
  }

  await logEvent({
    event: event || null,
    status: outcome,
    wavoip_call_id: wavoipCallId ?? null,
    phone_number: phone ?? null,
    call_history_id: matchedId,
    http_status: 200,
    error_message: updateError,
    payload,
    source_ip: ip,
  });

  return new Response(
    JSON.stringify({
      ok: outcome === 'success' || outcome === 'inserted_stub',
      outcome,
      event,
      wavoip_call_id: wavoipCallId ?? null,
      updated,
      error: updateError,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
