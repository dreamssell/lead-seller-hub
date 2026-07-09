// Histórico completo de atendimento do cliente:
// - Quem criou o Lead / canal / origem
// - Cada usuário que assumiu o número (com data/hora)
// - Chamadas registradas (VoIP/Wavoip) resumidas
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserPlus, UserCheck, ArrowRight, Phone, Sparkles } from 'lucide-react';
import { formatDuration } from '@/lib/callHistory';

interface Props { customerId: string; }

interface AssignRow {
  id: string;
  event_type: string;
  source: string | null;
  channel: string | null;
  user_id: string | null;
  notes: string | null;
  created_at: string;
}

interface LegacyAssign {
  id: string;
  from_user_id: string | null;
  to_user_id: string | null;
  reason: string | null;
  created_at: string;
}

interface CallRow {
  id: string;
  contact_name: string | null;
  phone_number: string;
  channel: string;
  connection_label: string | null;
  status: string;
  duration_seconds: number;
  started_at: string;
  user_id: string | null;
}

export function CustomerServiceHistory({ customerId }: Props) {
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<any>(null);
  const [rows, setRows] = useState<AssignRow[]>([]);
  const [legacy, setLegacy] = useState<LegacyAssign[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: cust }, assign, legacyAssign, callData] = await Promise.all([
        (supabase as any).from('customers')
          .select('name,created_at,created_by,source,channel,assigned_to')
          .eq('id', customerId).maybeSingle(),
        (supabase as any).from('customer_assignments_history')
          .select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
        supabase.from('conversation_assignments')
          .select('id,from_user_id,to_user_id,reason,created_at')
          .eq('customer_id', customerId).order('created_at', { ascending: false }).limit(50),
        (supabase as any).from('call_history')
          .select('id,contact_name,phone_number,channel,connection_label,status,duration_seconds,started_at,user_id')
          .eq('customer_id', customerId).order('started_at', { ascending: false }).limit(20),
      ]);
      setCustomer(cust);
      setRows((assign.data as AssignRow[]) || []);
      setLegacy((legacyAssign.data as LegacyAssign[]) || []);
      setCalls((callData.data as CallRow[]) || []);

      const uids = new Set<string>();
      if (cust?.created_by) uids.add(cust.created_by);
      if (cust?.assigned_to) uids.add(cust.assigned_to);
      (assign.data || []).forEach((r: any) => r.user_id && uids.add(r.user_id));
      (legacyAssign.data || []).forEach((r: any) => {
        if (r.from_user_id) uids.add(r.from_user_id);
        if (r.to_user_id) uids.add(r.to_user_id);
      });
      (callData.data || []).forEach((r: any) => r.user_id && uids.add(r.user_id));
      const arr = Array.from(uids);
      if (arr.length) {
        const { data: p } = await supabase.from('profiles')
          .select('user_id,display_name,email').in('user_id', arr);
        const m: Record<string, string> = {};
        (p || []).forEach((x: any) => { m[x.user_id] = x.display_name || x.email || x.user_id.slice(0, 8); });
        setNames(m);
      }
      setLoading(false);
    })();
  }, [customerId]);

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;

  const eventLabel: Record<string, string> = {
    created: 'Lead criado',
    claimed: 'Assumiu o atendimento',
    released: 'Liberou o atendimento',
    reassigned: 'Reatribuído',
    source_tagged: 'Origem atualizada',
  };

  const timeline: Array<{ key: string; when: string; body: React.ReactNode; icon: React.ReactNode }> = [];

  if (customer) {
    timeline.push({
      key: 'origin',
      when: customer.created_at,
      icon: <UserPlus className="w-3.5 h-3.5 text-primary" />,
      body: (
        <div>
          <p className="text-xs font-semibold">
            Lead registrado por {customer.created_by ? (names[customer.created_by] || 'usuário') : 'origem externa'}
          </p>
          <div className="flex gap-1.5 mt-1 flex-wrap">
            {customer.channel && <Badge variant="outline" className="text-[9px]">Canal: {customer.channel}</Badge>}
            {customer.source && <Badge variant="outline" className="text-[9px]">Origem: {customer.source}</Badge>}
          </div>
        </div>
      ),
    });
  }
  rows.forEach((r) => {
    timeline.push({
      key: r.id,
      when: r.created_at,
      icon: <UserCheck className="w-3.5 h-3.5 text-emerald-500" />,
      body: (
        <div>
          <p className="text-xs font-semibold">{eventLabel[r.event_type] || r.event_type}</p>
          <p className="text-[11px] text-muted-foreground">
            {r.user_id ? (names[r.user_id] || 'usuário') : '—'}
            {r.channel && ` · ${r.channel}`}
            {r.source && ` · ${r.source}`}
          </p>
          {r.notes && <p className="text-[11px] mt-1">{r.notes}</p>}
        </div>
      ),
    });
  });
  legacy.forEach((r) => {
    timeline.push({
      key: `legacy-${r.id}`,
      when: r.created_at,
      icon: <ArrowRight className="w-3.5 h-3.5 text-violet-500" />,
      body: (
        <div>
          <p className="text-xs font-semibold">Transferência de atendimento</p>
          <p className="text-[11px] text-muted-foreground">
            {names[r.from_user_id || ''] || '—'} → {names[r.to_user_id || ''] || 'fila'}
          </p>
          {r.reason && <p className="text-[11px] mt-1">{r.reason}</p>}
        </div>
      ),
    });
  });
  calls.forEach((r) => {
    timeline.push({
      key: `call-${r.id}`,
      when: r.started_at,
      icon: <Phone className="w-3.5 h-3.5 text-amber-500" />,
      body: (
        <div>
          <p className="text-xs font-semibold">
            Chamada {r.channel} · {formatDuration(r.duration_seconds)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {names[r.user_id || ''] || '—'} · {r.status}
            {r.connection_label && ` · ${r.connection_label}`}
          </p>
        </div>
      ),
    });
  });

  timeline.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());

  if (timeline.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-6 italic">Sem histórico de atendimento ainda.</p>;
  }

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-2">
        {timeline.map((t) => (
          <div key={t.key} className="rounded-lg border border-border bg-secondary/40 p-2.5">
            <div className="flex items-start gap-2">
              <div className="mt-0.5">{t.icon}</div>
              <div className="flex-1 min-w-0">
                {t.body}
                <p className="text-[10px] text-muted-foreground mt-1">
                  {new Date(t.when).toLocaleString('pt-BR')}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
