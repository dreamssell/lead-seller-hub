// Helpers para registrar histórico de chamadas VoIP/Wavoip/SIP.
// Cria registro no início da chamada, atualiza duração/status ao encerrar
// e faz upload da gravação (Blob) no bucket privado "call-recordings".
import { supabase } from '@/integrations/supabase/client';

export type CallChannel = 'wavoip' | 'voip' | 'sip';
export type CallDirection = 'outbound' | 'inbound';
export type CallStatus =
  | 'initiated' | 'ringing' | 'answered' | 'ended'
  | 'missed' | 'failed' | 'rejected';

export interface StartCallInput {
  phone: string;
  contactName?: string | null;
  customerId?: string | null;
  leadId?: string | null;
  ownerId: string;
  subCompanyId?: string | null;
  userId?: string | null;
  channel?: CallChannel;
  direction?: CallDirection;
  connectionLabel?: string | null;
  connectionId?: string | null;
  metadata?: Record<string, any>;
}

export async function startCallLog(input: StartCallInput): Promise<string | null> {
  const row = {
    owner_id: input.ownerId,
    sub_company_id: input.subCompanyId ?? null,
    user_id: input.userId ?? null,
    customer_id: input.customerId ?? null,
    lead_id: input.leadId ?? null,
    contact_name: input.contactName ?? null,
    phone_number: input.phone,
    direction: input.direction ?? 'outbound',
    channel: input.channel ?? 'wavoip',
    connection_label: input.connectionLabel ?? null,
    connection_id: input.connectionId ?? null,
    status: 'initiated' as CallStatus,
    started_at: new Date().toISOString(),
    metadata: input.metadata ?? {},
  };
  const { data, error } = await (supabase as any)
    .from('call_history')
    .insert(row)
    .select('id')
    .single();
  if (error) {
    console.warn('[callHistory] insert failed', error);
    return null;
  }
  return data?.id ?? null;
}

export async function markCallAnswered(id: string): Promise<string | null> {
  if (!id) return null;
  const now = new Date().toISOString();
  await (supabase as any).from('call_history')
    .update({ status: 'answered', answered_at: now })
    .eq('id', id);
  return now;
}

export async function endCallLog(
  id: string,
  opts: {
    status?: CallStatus;
    startedAt?: number;
    answeredAt?: number | null;
    recordingPath?: string | null;
    recordingUrl?: string | null;
    wavoipCallId?: string | null;
    metadata?: Record<string, any>;
  } = {},
) {
  if (!id) return;
  const ended = new Date();
  // Duração = tempo falado (a partir do atendimento) quando disponível,
  // caso contrário usa o dial time como fallback.
  const baseline = opts.answeredAt ?? opts.startedAt;
  const duration = baseline ? Math.max(0, Math.round((Date.now() - baseline) / 1000)) : undefined;
  const patch: Record<string, any> = {
    status: opts.status ?? 'ended',
    ended_at: ended.toISOString(),
  };
  if (duration !== undefined) patch.duration_seconds = duration;
  if (opts.recordingPath) patch.recording_path = opts.recordingPath;
  if (opts.recordingUrl) patch.recording_url = opts.recordingUrl;
  if (opts.wavoipCallId || opts.metadata) {
    const meta: Record<string, any> = { ...(opts.metadata || {}) };
    if (opts.wavoipCallId) meta.wavoip_call_id = opts.wavoipCallId;
    patch.metadata = meta;
  }
  await (supabase as any).from('call_history').update(patch).eq('id', id);
}

// URL pública da gravação da Wavoip. Pode demorar alguns minutos após o
// encerramento da chamada para ficar disponível.
export function wavoipRecordingUrl(wavoipCallId: string): string {
  return `https://storage.wavoip.com/${wavoipCallId}`;
}

export async function uploadCallRecording(
  callId: string,
  ownerId: string,
  blob: Blob,
): Promise<string | null> {
  const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
  const path = `${ownerId}/${new Date().toISOString().slice(0, 10)}/${callId}.${ext}`;
  const { error } = await supabase.storage
    .from('call-recordings')
    .upload(path, blob, { upsert: true, contentType: blob.type || 'audio/webm' });
  if (error) {
    console.warn('[callHistory] upload failed', error);
    return null;
  }
  return path;
}

export async function getRecordingSignedUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('call-recordings')
    .createSignedUrl(path, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}

// Registra evento de assumir/soltar/reatribuir um contato para o histórico do cliente.
export async function logCustomerAssignment(input: {
  customerId: string;
  ownerId: string;
  subCompanyId?: string | null;
  userId?: string | null;
  eventType: 'created' | 'claimed' | 'released' | 'reassigned' | 'source_tagged';
  source?: string | null;
  channel?: string | null;
  notes?: string | null;
  metadata?: Record<string, any>;
}) {
  await (supabase as any).from('customer_assignments_history').insert({
    customer_id: input.customerId,
    owner_id: input.ownerId,
    sub_company_id: input.subCompanyId ?? null,
    user_id: input.userId ?? null,
    event_type: input.eventType,
    source: input.source ?? null,
    channel: input.channel ?? null,
    notes: input.notes ?? null,
    metadata: input.metadata ?? {},
  });
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
