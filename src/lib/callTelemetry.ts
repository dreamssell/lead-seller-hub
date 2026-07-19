/**
 * Telemetria de UI dos botões de ligação (SIP/Wavoip) e da linha ocupada.
 *
 * Grava eventos em `telemetry_logs` (RLS: INSERT liberado para authenticated).
 * Tolerante a falhas — NUNCA lança exceção. A UI de chat/discador não pode
 * quebrar por causa de telemetria.
 *
 * Também loga no console (com prefixo estável) para permitir debug rápido
 * abrindo o DevTools sem depender do banco.
 */
import { supabase } from '@/integrations/supabase/client';

type CallButtonEvent =
  | 'sip_click'
  | 'sip_blocked_disconnected'
  | 'sip_no_phone'
  | 'sip_dial_start'
  | 'wa_click'
  | 'wa_blocked_busy'
  | 'wa_no_phone'
  | 'wa_dial_start'
  | 'wa_dial_ok'
  | 'wa_dial_fail'
  | 'line_busy_change'
  | 'line_wait_armed'
  | 'line_wait_fired'
  | 'call_event_reprocess_click'
  | 'call_event_reprocess_ok'
  | 'call_event_reprocess_fail';

interface Payload {
  event: CallButtonEvent;
  correlationId?: string;
  metadata?: Record<string, unknown>;
  message?: string;
}

function safeCorrId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* ignore */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let seq = 0;
export async function logCallUi({ event, correlationId, metadata, message }: Payload): Promise<void> {
  const corr = correlationId || safeCorrId();
  seq++;
  // Console breadcrumb — sempre presente, invisível em produção mas útil no DevTools.
  try {
    // eslint-disable-next-line no-console
    console.info(`[callUi:${event}] #${seq}`, { corr, ...metadata });
  } catch { /* ignore */ }

  try {
    await (supabase as any).from('telemetry_logs').insert({
      correlation_id: corr,
      type: `call_ui.${event}`,
      message: message ?? null,
      metadata: {
        seq,
        ts: new Date().toISOString(),
        path: typeof window !== 'undefined' ? window.location.pathname : null,
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        ...(metadata || {}),
      },
    });
  } catch {
    // Silencioso — telemetria nunca quebra fluxo do usuário.
  }
}
