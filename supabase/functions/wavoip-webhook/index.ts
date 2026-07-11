// Wavoip webhook receiver
// Endpoint público chamado pela Wavoip a cada evento de ligação.
// Segurança: token compartilhado via query string (?token=...) OU header
// `X-Webhook-Token`, comparado contra a variável WAVOIP_WEBHOOK_SECRET.
//
// Persistimos os eventos em `public.call_history` casando por
// `metadata->>'wavoip_call_id'` e mantemos um log bruto em
// `public.wavoip_audit_logs` para auditoria.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRET = Deno.env.get('WAVOIP_WEBHOOK_SECRET') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Mapeia status/evento Wavoip → nosso enum interno
function mapStatus(ev: string | undefined | null): string | null {
  if (!ev) return null;
  const e = ev.toLowerCase();
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get('token') || req.headers.get('x-webhook-token') || '';
  if (!SECRET || token !== SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  // Wavoip pode enviar { event, data: {...} } ou o objeto direto
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

  // Persistir log bruto (não falha o webhook se der erro)
  try {
    await admin.from('wavoip_audit_logs').insert({
      event: event || 'unknown',
      payload,
      wavoip_call_id: wavoipCallId ?? null,
      phone_number: phone ?? null,
    });
  } catch (e) {
    console.warn('[wavoip-webhook] audit log failed', (e as Error).message);
  }

  // Atualiza call_history pelo wavoip_call_id (JSONB match)
  let updated = 0;
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
      if (error) console.warn('[wavoip-webhook] update failed', error.message);
      updated = rows?.length ?? 0;

      // Se não achou registro (chamada iniciada fora do webphone), cria stub
      if (updated === 0 && (status === 'ended' || status === 'answered')) {
        await admin.from('call_history').insert({
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
        });
        updated = 1;
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, event, wavoip_call_id: wavoipCallId ?? null, updated }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
