import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Flag } from 'lucide-react';

export const PRIORITY_META: Record<string, { label: string; color: string }> = {
  low: { label: 'Baixa', color: 'text-slate-500' },
  medium: { label: 'Média', color: 'text-blue-500' },
  high: { label: 'Alta', color: 'text-orange-500' },
  urgent: { label: 'Urgente', color: 'text-red-500' },
};

export function PrioritySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const meta = PRIORITY_META[value] || PRIORITY_META.medium;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs w-[130px] gap-1.5">
        <Flag className={`w-3 h-3 ${meta.color}`} />
        <span>{meta.label}</span>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(PRIORITY_META).map(([k, m]) => (
          <SelectItem key={k} value={k}>
            <span className="flex items-center gap-2">
              <Flag className={`w-3 h-3 ${m.color}`} /> {m.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
