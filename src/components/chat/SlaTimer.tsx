import { useSlaCountdown } from '@/hooks/useSlaCountdown';
import { Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const COLORS = {
  idle: 'bg-muted/40 text-muted-foreground border-border',
  safe: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400',
  warn: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400',
  critical: 'bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-400',
  overdue: 'bg-red-500/10 text-red-700 border-red-500/40 dark:text-red-400 animate-pulse',
};

interface Props {
  label: string;
  dueAt: string | null | undefined;
  totalMinutes?: number;
}

export function SlaTimer({ label, dueAt, totalMinutes = 30 }: Props) {
  const { status, label: tLabel } = useSlaCountdown(dueAt, totalMinutes);
  if (!dueAt) return null;
  const Icon = status === 'overdue' ? AlertTriangle : Clock;
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-medium',
        COLORS[status],
      )}
      title={`${label} · vence em ${tLabel}`}
    >
      <Icon className="w-3 h-3" />
      <span className="uppercase tracking-wider">{label}</span>
      <span className="font-mono">{tLabel}</span>
    </div>
  );
}
