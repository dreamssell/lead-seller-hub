import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  accent?: 'primary' | 'success' | 'warning' | 'destructive' | 'accent';
  delay?: number;
}

const accentClass: Record<NonNullable<Props['accent']>, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  accent: 'bg-accent/10 text-accent-foreground',
};

export function OwnerMetricCard({ icon: Icon, label, value, hint, accent = 'primary', delay = 0 }: Props) {
  return (
    <motion.div
      className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accentClass[accent]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground/80 mt-1">{hint}</p>}
      </div>
    </motion.div>
  );
}
