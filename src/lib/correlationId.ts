// Correlation ID helpers: one id per outbound message, propagated from the
// ChatComposer → adapter → edge function → provider → webhook ACK. Used to
// stitch together logs across the client, edge and provider responses.

export function newCorrelationId(prefix = 'msg'): string {
  const rand = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, '');
  return `${prefix}_${rand.slice(0, 16)}_${Date.now().toString(36)}`;
}

export function tagLog(scope: string, correlationId: string | null | undefined) {
  const cid = correlationId ?? '—';
  return (level: 'info' | 'warn' | 'error', event: string, data?: Record<string, unknown>) => {
    // Uses structured console output so it is easy to grep in remote logs.
    const payload = { scope, cid, event, ...(data ?? {}) };
    // eslint-disable-next-line no-console
    (console[level] ?? console.log)(`[${scope}][cid=${cid}] ${event}`, payload);
  };
}
