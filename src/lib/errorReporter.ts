import { supabase } from '@/integrations/supabase/client';

interface ReportInput {
  message: string;
  stack?: string | null;
  component_stack?: string | null;
  severity?: 'error' | 'warning' | 'fatal';
  source?: 'react' | 'window' | 'promise' | 'manual';
  metadata?: Record<string, unknown>;
}

let inflight = 0;
const MAX_INFLIGHT = 3;
const seen = new Set<string>(); // dedupe (mesma msg + stack) por sessão

/**
 * Envia um relatório de erro para a tabela public.error_reports.
 * O trigger no backend notifica automaticamente os administradores da plataforma.
 * Tolerante a falhas: nunca lança exceção (senão viraria loop).
 */
export async function reportError(input: ReportInput): Promise<void> {
  try {
    if (inflight >= MAX_INFLIGHT) return;
    const key = `${input.message}::${(input.stack || '').slice(0, 200)}`;
    if (seen.has(key)) return;
    seen.add(key);
    inflight++;

    const { data: sess } = await supabase.auth.getSession();
    const uid = sess?.session?.user?.id ?? null;
    let ownerId: string | null = null;
    let subCompanyId: string | null = null;
    try {
      const { data } = await (supabase as any).rpc('get_my_account_access');
      if (Array.isArray(data) && data[0]) {
        ownerId = data[0].owner_id ?? null;
        subCompanyId = data[0].sub_company_id ?? null;
      }
    } catch {
      /* ignore */
    }

    await (supabase as any).from('error_reports').insert({
      user_id: uid,
      owner_id: ownerId,
      sub_company_id: subCompanyId,
      path: typeof window !== 'undefined' ? window.location.pathname : null,
      route: typeof window !== 'undefined' ? window.location.pathname + window.location.search : null,
      message: String(input.message).slice(0, 2000),
      stack: input.stack ? String(input.stack).slice(0, 8000) : null,
      component_stack: input.component_stack ? String(input.component_stack).slice(0, 8000) : null,
      severity: input.severity ?? 'error',
      source: input.source ?? 'manual',
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      metadata: input.metadata ?? {},
    });
  } catch {
    // Nunca propagar — reporter não pode quebrar a app.
  } finally {
    inflight = Math.max(0, inflight - 1);
  }
}

/** Instala handlers globais para window.error e unhandledrejection. */
export function installGlobalErrorReporter() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (ev) => {
    void reportError({
      message: ev.message || 'window.onerror',
      stack: ev.error?.stack || null,
      source: 'window',
      severity: 'error',
      metadata: { filename: ev.filename, lineno: ev.lineno, colno: ev.colno },
    });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const reason: any = ev.reason;
    void reportError({
      message: (reason?.message ?? String(reason ?? 'unhandledrejection')).toString(),
      stack: reason?.stack || null,
      source: 'promise',
      severity: 'error',
    });
  });
}
