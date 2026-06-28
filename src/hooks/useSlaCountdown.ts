import { useEffect, useState } from 'react';

export type SlaStatus = 'idle' | 'safe' | 'warn' | 'critical' | 'overdue';

export function useSlaCountdown(dueAt: string | null | undefined, totalMinutes = 30) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  if (!dueAt) return { status: 'idle' as SlaStatus, label: '—', pct: 0, ms: 0 };

  const due = new Date(dueAt).getTime();
  const ms = due - now;
  const totalMs = totalMinutes * 60 * 1000;
  const pct = Math.max(0, Math.min(100, (ms / totalMs) * 100));

  let status: SlaStatus = 'safe';
  if (ms <= 0) status = 'overdue';
  else if (pct < 20) status = 'critical';
  else if (pct < 50) status = 'warn';

  const absMs = Math.abs(ms);
  const mins = Math.floor(absMs / 60000);
  const secs = Math.floor((absMs % 60000) / 1000);
  const sign = ms < 0 ? '-' : '';
  const label =
    mins >= 60 ? `${sign}${Math.floor(mins / 60)}h${mins % 60}m` : `${sign}${mins}m${secs.toString().padStart(2, '0')}s`;

  return { status, label, pct, ms };
}
