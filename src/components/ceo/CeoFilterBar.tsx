import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Building2, Users, Calendar } from 'lucide-react';

export type Period = '7d' | '30d' | '90d' | '12m' | 'all';
export const PERIOD_LABELS: Record<Period, string> = {
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  '12m': 'Últimos 12 meses',
  'all': 'Todo o período',
};

export function periodStart(p: Period): Date | null {
  if (p === 'all') return null;
  const d = new Date();
  if (p === '7d') d.setDate(d.getDate() - 7);
  else if (p === '30d') d.setDate(d.getDate() - 30);
  else if (p === '90d') d.setDate(d.getDate() - 90);
  else if (p === '12m') d.setMonth(d.getMonth() - 12);
  return d;
}

export interface CeoFilters {
  period: Period;
  subCompanyId: string; // 'all' or uuid
  collaboratorId: string; // 'all' or uuid
}

interface Props {
  value: CeoFilters;
  onChange: (v: CeoFilters) => void;
  extraRight?: React.ReactNode;
}

export function CeoFilterBar({ value, onChange, extraRight }: Props) {
  const [subs, setSubs] = useState<{ id: string; name: string }[]>([]);
  const [people, setPeople] = useState<{ user_id: string; display_name: string | null }[]>([]);

  useEffect(() => {
    (async () => {
      const [s, p] = await Promise.all([
        supabase.from('sub_companies').select('id,name').order('name'),
        supabase.from('profiles').select('user_id,display_name').order('display_name'),
      ]);
      setSubs((s.data as any) || []);
      setPeople((p.data as any) || []);
    })();
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <Select value={value.period} onValueChange={(v) => onChange({ ...value, period: v as Period })}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
              <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Building2 className="w-4 h-4 text-muted-foreground" />
        <Select value={value.subCompanyId} onValueChange={(v) => onChange({ ...value, subCompanyId: v })}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Empresa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as empresas</SelectItem>
            {subs.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-muted-foreground" />
        <Select value={value.collaboratorId} onValueChange={(v) => onChange({ ...value, collaboratorId: v })}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Colaborador" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os colaboradores</SelectItem>
            {people.map(p => (
              <SelectItem key={p.user_id} value={p.user_id}>{p.display_name || p.user_id.slice(0, 8)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {extraRight && <div className="ml-auto flex items-center gap-2">{extraRight}</div>}
    </div>
  );
}
