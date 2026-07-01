import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Circle, CheckCircle2, Clock, Pause, XCircle } from 'lucide-react';

export const STATUS_META: Record<string, { label: string; icon: any; color: string }> = {
  open: { label: 'Aberto', icon: Circle, color: 'text-blue-500' },
  pending: { label: 'Pendente', icon: Clock, color: 'text-amber-500' },
  snoozed: { label: 'Adiado', icon: Pause, color: 'text-violet-500' },
  resolved: { label: 'Resolvido', icon: CheckCircle2, color: 'text-emerald-500' },
  closed: { label: 'Fechado', icon: XCircle, color: 'text-zinc-500' },
};

export function TicketStatusSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const meta = STATUS_META[value] || STATUS_META.open;
  const Icon = meta.icon;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs w-[140px] gap-1.5">
        <Icon className={`w-3 h-3 ${meta.color}`} />
        <span>{meta.label}</span>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(STATUS_META).map(([k, m]) => {
          const I = m.icon;
          return (
            <SelectItem key={k} value={k}>
              <span className="flex items-center gap-2">
                <I className={`w-3 h-3 ${m.color}`} /> {m.label}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
