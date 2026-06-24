import { supabase } from '@/integrations/supabase/client';

export type RouteTelemetryType =
  | 'route_404'
  | 'protected_route_blocked'
  | 'protected_route_unauthenticated'
  | 'api_unauthorized'
  | 'api_forbidden';

interface LogParams {
  type: RouteTelemetryType;
  message: string;
  metadata?: Record<string, unknown>;
}

function correlationId() {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `cid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Avoid duplicate logs (e.g. StrictMode double-render or rapid re-renders).
const recentlyLogged = new Map<string, number>();
const DEDUPE_WINDOW_MS = 5000;

export async function logRouteTelemetry({ type, message, metadata }: LogParams) {
  const dedupeKey = `${type}|${metadata?.path ?? ''}|${metadata?.pageKey ?? ''}`;
  const now = Date.now();
  const last = recentlyLogged.get(dedupeKey);
  if (last && now - last < DEDUPE_WINDOW_MS) return;
  recentlyLogged.set(dedupeKey, now);

  const enriched = {
    ...(metadata ?? {}),
    path: metadata?.path ?? (typeof window !== 'undefined' ? window.location.pathname : null),
    href: typeof window !== 'undefined' ? window.location.href : null,
    referrer: typeof document !== 'undefined' ? document.referrer || null : null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    viewport:
      typeof window !== 'undefined'
        ? { w: window.innerWidth, h: window.innerHeight }
        : null,
    timestamp: new Date().toISOString(),
  };

  // Always log to console for live debugging
  // eslint-disable-next-line no-console
  console.warn(`[route-telemetry] ${type}: ${message}`, enriched);

  try {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user ?? null;
    if (!user) return; // anonymous can't insert per RLS

    await supabase.from('telemetry_logs').insert({
      correlation_id: correlationId(),
      type,
      message,
      metadata: { ...enriched, user_id: user.id, user_email: user.email } as never,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[route-telemetry] failed to persist log', err);
  }
}
