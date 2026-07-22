/**
 * Telemetria de performance — DONO-only via visualização em /internal/telemetry.
 *
 * - `logPageLoad`: mede tempo de carregamento por página (mount → primeiro
 *   frame idle após dados).
 * - `logRealtimeImpact`: mede o impacto de eventos realtime sobre listas
 *   visíveis (duração do reload, tamanho antes/depois, delta).
 *
 * Grava em `telemetry_logs` com `type` prefixado por `perf.`. Nunca lança —
 * a UI de produção não pode quebrar por causa de instrumentação.
 */
import { supabase } from '@/integrations/supabase/client';

function corrId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* ignore */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function insertPerf(type: string, message: string, metadata: Record<string, unknown>) {
  try {
    // eslint-disable-next-line no-console
    console.info(`[perf:${type}]`, message, metadata);
  } catch { /* ignore */ }
  try {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user ?? null;
    if (!user) return; // RLS: authenticated only
    await (supabase as any).from('telemetry_logs').insert({
      correlation_id: corrId(),
      type,
      message,
      metadata: {
        ts: new Date().toISOString(),
        path: typeof window !== 'undefined' ? window.location.pathname : null,
        href: typeof window !== 'undefined' ? window.location.href : null,
        viewport: typeof window !== 'undefined' ? { w: window.innerWidth, h: window.innerHeight } : null,
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        user_id: user.id,
        user_email: user.email,
        ...metadata,
      } as never,
    });
  } catch {
    // silencioso
  }
}

/* ---------- Page load ---------- */

export interface PageLoadPayload {
  pageKey: string;
  durationMs: number;
  navigationType?: string;
  metadata?: Record<string, unknown>;
}

export function logPageLoad({ pageKey, durationMs, navigationType, metadata }: PageLoadPayload) {
  void insertPerf('perf.page_load', `page ${pageKey} carregou em ${Math.round(durationMs)}ms`, {
    page_key: pageKey,
    duration_ms: Math.round(durationMs),
    navigation_type: navigationType ?? 'spa',
    ...(metadata || {}),
  });
}

/* ---------- Realtime impact on visible lists ---------- */

export interface RealtimeImpactPayload {
  scope: string;                 // ex.: 'chat_conversations', 'focus_conversations'
  event: string;                 // ex.: 'customers.update', 'message.insert', 'assignment.change'
  durationMs: number;            // tempo do refetch/reprocessamento
  sizeBefore?: number | null;
  sizeAfter?: number | null;
  message?: string;
  metadata?: Record<string, unknown>;
}

export function logRealtimeImpact({
  scope, event, durationMs, sizeBefore, sizeAfter, message, metadata,
}: RealtimeImpactPayload) {
  const delta = (sizeAfter ?? 0) - (sizeBefore ?? 0);
  void insertPerf(
    'perf.realtime_impact',
    message ?? `${scope} · ${event} · ${Math.round(durationMs)}ms · Δ${delta >= 0 ? '+' : ''}${delta}`,
    {
      scope,
      event,
      duration_ms: Math.round(durationMs),
      size_before: sizeBefore ?? null,
      size_after: sizeAfter ?? null,
      size_delta: delta,
      ...(metadata || {}),
    },
  );
}

/** Cria um timer reutilizável. Chame `.done(sizeBefore, sizeAfter, extra?)`. */
export function startRealtimeTimer(scope: string, event: string) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    done(sizeBefore: number | null, sizeAfter: number | null, extra?: Record<string, unknown>) {
      const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      logRealtimeImpact({
        scope, event,
        durationMs: t1 - t0,
        sizeBefore, sizeAfter,
        metadata: extra,
      });
    },
  };
}
