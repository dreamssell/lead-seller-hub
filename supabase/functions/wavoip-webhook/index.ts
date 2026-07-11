// Wavoip webhook receiver — MULTI-TENANT (LGPD)
// Cada Empresa/Sub-empresa possui o próprio token em `wavoip_webhook_tokens`.
// O endpoint valida o token via query string (?token=...) ou header
// `X-Webhook-Token`, resolve o tenant (owner_id + sub_company_id) e escopa
// TODAS as gravações em `call_history` e `wavoip_webhook_events` a esse tenant.
// Não existe segredo global compartilhado entre clientes.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

type CallHistoryRow = {
  id: string;
  status: string | null;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  metadata: Record<string, any> | null;
  user_id: string | null;
  started_at: string | null;
};

const FINAL_STATUSES = new Set(['ended', 'missed', 'failed', 'rejected']);

function mapStatus(ev: string | undefined | null): string | null {
  if (!ev) return null;
  const e = String(ev).toLowerCase();
  if (['answered', 'answer', 'in-call', 'in_call', 'active', 'accept', 'accepted'].includes(e)) return 'answered';
  if (['ended', 'end', 'hangup', 'terminated', 'completed', 'finished'].includes(e)) return 'ended';
  if (['missed', 'no-answer', 'noanswer'].includes(e)) return 'missed';
  if (['failed', 'error', 'canceled', 'cancelled', 'busy', 'rejected'].includes(e)) return 'failed';
  if (['ringing', 'ring'].includes(e)) return 'ringing';
  if (['initiated', 'invite', 'dialing'].includes(e)) return 'initiated';
  return null;
}

function isFinalStatus(status: string | null | undefined): boolean {
  return !!status && FINAL_STATUSES.has(status);
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

function secondsBetween(startIso?: string | null, endIso?: string | null): number | null {
  if (!startIso || !endIso) return null;
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  return seconds > 0 ? seconds : null;
}

function durationConflict(official: number, derived: number): boolean {
  const tolerance = Math.max(5, Math.round(derived * 0.15));
  return Math.abs(official - derived) > tolerance;
}

function asMetadata(value: any): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function validUuid(value: unknown): string | null {
  const s = String(value || '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s) ? s : null;
}

async function logEvent(row: {
  event?: string | null;
  status: EventStatus;
  wavoip_call_id?: string | null;
  call_id?: string | null;
  phone_number?: string | null;
  call_history_id?: string | null;
  http_status: number;
  error_message?: string | null;
  payload: any;
  source_ip?: string | null;
  owner_id?: string | null;
  sub_company_id?: string | null;
  token_id?: string | null;
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

  let tokenRow: {
    id: string;
    owner_id: string;
    sub_company_id: string | null;
    is_active: boolean;
    revoked_at: string | null;
  } | null = null;

  if (token) {
    const { data } = await admin
      .from('wavoip_webhook_tokens')
      .select('id, owner_id, sub_company_id, is_active, revoked_at')
      .eq('token', token)
      .maybeSingle();
    tokenRow = data ?? null;
  }

  if (!tokenRow || !tokenRow.is_active || tokenRow.revoked_at) {
    await logEvent({
      status: 'unauthorized',
      http_status: 401,
      error_message: !token ? 'missing token' : (!tokenRow ? 'unknown token' : 'token revoked'),
      payload: { path: url.pathname, has_token: !!token },
      source_ip: ip,
    });
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ownerId = tokenRow.owner_id;
  const subCompanyId = tokenRow.sub_company_id;

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
      owner_id: ownerId,
      sub_company_id: subCompanyId,
      token_id: tokenRow.id,
    });
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const data = payload?.data ?? payload ?? {};
  const event: string = payload?.event ?? data?.event ?? data?.status ?? '';
  const receivedAt = new Date().toISOString();

  const explicitWavoipCallId: string | undefined = pick(data, ['wavoip_call_id', 'whatsapp_call_id', 'whatsappCallId']);
  const rawCallId: string | undefined = pick(data, ['call_id', 'callId', 'id', 'uuid', 'session_id']);
  const wavoipCallId: string | undefined = explicitWavoipCallId || rawCallId;
  const callId: string | undefined = rawCallId || explicitWavoipCallId;
  const phone: string | undefined = pick(data, ['phone', 'number', 'to', 'from', 'destination', 'caller', 'callee']);
  const direction: string | undefined = pick(data, ['direction', 'type']);
  const startedAt = toIso(pick(data, ['started_at', 'start_time', 'startedAt', 'created_at']));
  const answeredAt = toIso(pick(data, ['answered_at', 'answer_time', 'answeredAt']));
  const endedAt = toIso(pick(data, ['ended_at', 'end_time', 'endedAt', 'hangup_time']));
  const duration = Number(pick(data, ['duration', 'duration_seconds', 'talk_time', 'call_duration'])) || null;
  const recordingUrl: string | undefined = pick(data, ['recording_url', 'recordingUrl', 'record_url', 'audio_url']);
  const status = mapStatus(event) ?? mapStatus(data?.status);
  const webhookUserId = validUuid(pick(data, ['user_id', 'userId', 'agent_user_id', 'attendant_user_id', 'answered_by', 'operator_id']));

  let updated = 0;
  let matchedId: string | null = null;
  let updateError: string | null = null;
  let outcome: EventStatus = 'success';

  if (wavoipCallId || callId) {
    const scoped = (q: any) => {
      q = q.eq('owner_id', ownerId);
      return subCompanyId ? q.eq('sub_company_id', subCompanyId) : q.is('sub_company_id', null);
    };
    const found = new Map<string, CallHistoryRow>();
    const addRows = (rows?: CallHistoryRow[] | null) => (rows || []).forEach((r) => found.set(r.id, r));
    const selectCols = 'id,status,answered_at,ended_at,duration_seconds,metadata,user_id,started_at';

    for (const [key, value] of [['wavoip_call_id', wavoipCallId], ['call_id', callId]] as const) {
      if (!value) continue;
      const { data: rows } = await scoped(
        admin.from('call_history').select(selectCols).filter(`metadata->>${key}`, 'eq', value).limit(10),
      );
      addRows(rows as CallHistoryRow[] | null);
    }

    // Se o webhook chegou antes do front persistir o wavoip_call_id, liga o
    // evento à linha iniciada recentemente pelo usuário para preservar user_id.
    if (found.size === 0 && phone) {
      const { data: phoneRows } = await scoped(
        admin
          .from('call_history')
          .select(selectCols)
          .eq('phone_number', phone)
          .in('status', ['initiated', 'ringing', 'answered'])
          .order('started_at', { ascending: false })
          .limit(1),
      );
      addRows(phoneRows as CallHistoryRow[] | null);

      if (found.size === 0 && phone.replace(/\D/g, '').length >= 8) {
        const suffix = phone.replace(/\D/g, '').slice(-8);
        const { data: fuzzyRows } = await scoped(
          admin
            .from('call_history')
            .select(selectCols)
            .ilike('phone_number', `%${suffix}`)
            .in('status', ['initiated', 'ringing', 'answered'])
            .order('started_at', { ascending: false })
            .limit(1),
        );
        addRows(fuzzyRows as CallHistoryRow[] | null);
      }
    }

    const buildPatch = (row: CallHistoryRow): Record<string, any> => {
      const meta = asMetadata(row.metadata);
      const currentFinal = isFinalStatus(row.status) || !!row.ended_at;
      const patch: Record<string, any> = {};
      let nextAnsweredAt = row.answered_at;
      let nextEndedAt = row.ended_at;

      if (status === 'answered') {
        nextAnsweredAt = row.answered_at ?? answeredAt ?? receivedAt;
        if (!row.answered_at) patch.answered_at = nextAnsweredAt;
        if (!currentFinal) patch.status = 'answered';
      } else if (status === 'ringing' || status === 'initiated') {
        if (!currentFinal) patch.status = status;
      } else if (status && isFinalStatus(status)) {
        nextEndedAt = row.ended_at ?? endedAt ?? receivedAt;
        patch.ended_at = nextEndedAt;
        if (answeredAt && !row.answered_at) {
          nextAnsweredAt = answeredAt;
          patch.answered_at = answeredAt;
        }
        patch.status = status;
      } else {
        if (answeredAt && !row.answered_at) {
          nextAnsweredAt = answeredAt;
          patch.answered_at = answeredAt;
        }
        if (endedAt && !row.ended_at) {
          nextEndedAt = endedAt;
          patch.ended_at = endedAt;
        }
      }

      if (recordingUrl) patch.recording_url = recordingUrl;
      if (!row.user_id && webhookUserId) patch.user_id = webhookUserId;

      const officialDuration = duration && duration > 0 ? Math.round(duration) : null;
      const derivedDuration = secondsBetween(nextAnsweredAt, nextEndedAt);
      const finalOrEnded = isFinalStatus(status) || !!nextEndedAt;
      let durationSource: string | null = null;
      let durationMismatch = false;
      if (finalOrEnded) {
        if (officialDuration && derivedDuration && durationConflict(officialDuration, derivedDuration)) {
          patch.duration_seconds = derivedDuration;
          durationSource = 'derived_answered_to_ended';
          durationMismatch = true;
        } else if (officialDuration) {
          patch.duration_seconds = officialDuration;
          durationSource = 'official';
        } else if (derivedDuration) {
          patch.duration_seconds = derivedDuration;
          durationSource = 'derived_answered_to_ended';
        }
      }

      patch.metadata = {
        ...meta,
        wavoip_call_id: wavoipCallId ?? meta.wavoip_call_id,
        call_id: callId ?? meta.call_id,
        last_webhook_event: event || null,
        last_webhook_status: status,
        last_webhook_received_at: receivedAt,
        webhook_answered_at: answeredAt,
        webhook_ended_at: endedAt,
        webhook_official_duration_seconds: officialDuration,
        webhook_derived_duration_seconds: derivedDuration,
        duration_source: durationSource ?? meta.duration_source,
        duration_mismatch: durationMismatch,
      };
      return patch;
    };

    for (const row of found.values()) {
      const patch = buildPatch(row);
      const { error } = await admin.from('call_history').update(patch).eq('id', row.id);
      if (error) {
        updateError = error.message;
        outcome = 'update_error';
        console.warn('[wavoip-webhook] update failed', error.message);
      } else {
        updated += 1;
        matchedId = matchedId ?? row.id;
      }
    }

    if (updated === 0 && outcome !== 'update_error') {
      if (status === 'answered' || isFinalStatus(status)) {
        const effectiveAnsweredAt = answeredAt ?? (status === 'answered' ? receivedAt : null);
        const effectiveEndedAt = endedAt ?? (isFinalStatus(status) ? receivedAt : null);
        const officialDuration = duration && duration > 0 ? Math.round(duration) : null;
        const derivedDuration = secondsBetween(effectiveAnsweredAt, effectiveEndedAt);
        const insertRow: Record<string, any> = {
          owner_id: ownerId,
          sub_company_id: subCompanyId,
          user_id: webhookUserId,
          channel: 'wavoip',
          direction: direction === 'inbound' || direction === 'in' ? 'inbound' : 'outbound',
          phone_number: phone ?? 'unknown',
          status: status ?? 'ended',
          started_at: startedAt ?? effectiveAnsweredAt ?? receivedAt,
          answered_at: effectiveAnsweredAt,
          ended_at: effectiveEndedAt,
          recording_url: recordingUrl ?? null,
          metadata: {
            wavoip_call_id: wavoipCallId ?? null,
            call_id: callId ?? null,
            source: 'webhook',
            last_webhook_event: event || null,
            last_webhook_status: status,
            last_webhook_received_at: receivedAt,
            webhook_official_duration_seconds: officialDuration,
            webhook_derived_duration_seconds: derivedDuration,
            duration_source: derivedDuration ? 'derived_answered_to_ended' : officialDuration ? 'official' : null,
          },
        };
        if (derivedDuration) insertRow.duration_seconds = derivedDuration;
        else if (officialDuration && isFinalStatus(status)) insertRow.duration_seconds = officialDuration;

        const { data: ins, error: insErr } = await admin
          .from('call_history')
          .insert(insertRow)
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
  } else {
    outcome = 'bad_payload';
    updateError = 'missing wavoip_call_id/call_id in payload';
  }

  await admin
    .from('wavoip_webhook_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', tokenRow.id);

  await logEvent({
    event: event || null,
    status: outcome,
    wavoip_call_id: wavoipCallId ?? null,
    call_id: callId ?? null,
    phone_number: phone ?? null,
    call_history_id: matchedId,
    http_status: 200,
    error_message: updateError,
    payload,
    source_ip: ip,
    owner_id: ownerId,
    sub_company_id: subCompanyId,
    token_id: tokenRow.id,
  });

  return new Response(
    JSON.stringify({
      ok: outcome === 'success' || outcome === 'inserted_stub',
      outcome,
      event,
      wavoip_call_id: wavoipCallId ?? null,
      call_id: callId ?? null,
      updated,
      error: updateError,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});