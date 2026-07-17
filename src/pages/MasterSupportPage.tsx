import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { STATUS_META, PRIORITY_META, DEPARTMENT_META, KANBAN_COLUMNS, formatTicketNumber, type SupportStatus, type SupportPriority, type SupportDepartment } from '@/lib/supportHelpers';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LifeBuoy, AlertCircle } from 'lucide-react';

type Ticket = {
  id: string; number: number; title: string; status: SupportStatus; priority: SupportPriority;
  department: SupportDepartment; created_at: string; last_activity_at: string;
  owner_id: string; sub_company_id: string | null; user_id: string; assigned_to: string | null;
};

export default function MasterSupportPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDept, setFilterDept] = useState<'all' | SupportDepartment>('all');
  const [filterPrio, setFilterPrio] = useState<'all' | SupportPriority>('all');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('support_tickets' as any)
      .select('*').order('created_at', { ascending: false }).limit(200);
    setTickets((data as any) || []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    const ch = supabase.channel('support-master')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => tickets.filter(t =>
    (filterDept === 'all' || t.department === filterDept) &&
    (filterPrio === 'all' || t.priority === filterPrio)
  ), [tickets, filterDept, filterPrio]);

  const counts = useMemo(() => {
    const c: Record<SupportStatus, number> = { novo: 0, em_analise: 0, aguardando_cliente: 0, resolvido: 0, fechado: 0 };
    for (const t of filtered) c[t.status] = (c[t.status] || 0) + 1;
    return c;
  }, [filtered]);

  return (
    <AppLayout title="Central de Suporte · Master" subtitle="Todos os tickets abertos por Empresas e Sub-empresas">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <LifeBuoy className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium">{filtered.length} tickets</span>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Select value={filterDept} onValueChange={(v: any) => setFilterDept(v)}>
            <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Departamento"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos departamentos</SelectItem>
              {(Object.keys(DEPARTMENT_META) as SupportDepartment[]).map(d => <SelectItem key={d} value={d}>{DEPARTMENT_META[d].label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterPrio} onValueChange={(v: any) => setFilterPrio(v)}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Prioridade"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas prioridades</SelectItem>
              {(Object.keys(PRIORITY_META) as SupportPriority[]).map(p => <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {Array.from({length:4}).map((_,i)=><div key={i} className="h-64 rounded-xl bg-muted/40 animate-pulse"/>)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {KANBAN_COLUMNS.map((col) => {
            const meta = STATUS_META[col];
            const items = filtered.filter(t => t.status === col);
            return (
              <div key={col} className="glass-card p-3 flex flex-col min-h-[400px]">
                <header className="flex items-center justify-between mb-2 pb-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <meta.icon className={`w-4 h-4 ${meta.color}`}/>
                    <h3 className="text-sm font-semibold">{meta.kanbanTitle}</h3>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{counts[col]}</span>
                </header>
                <div className="flex-1 space-y-2 overflow-y-auto max-h-[70vh] pr-1">
                  {items.length === 0 && <p className="text-[11px] text-muted-foreground text-center py-6">Sem tickets</p>}
                  {items.map((t) => {
                    const pr = PRIORITY_META[t.priority];
                    const dept = DEPARTMENT_META[t.department];
                    const critical = t.priority === 'critica';
                    return (
                      <motion.button
                        layout key={t.id}
                        onClick={() => navigate(`/suporte/${t.id}`)}
                        className={`w-full text-left p-3 rounded-lg border transition-all hover:shadow-md ${critical ? 'border-red-400/50 bg-red-500/5' : 'border-border bg-card'}`}
                        whileHover={{ y: -1 }}
                      >
                        <div className="flex items-center gap-1.5 mb-1.5">
                          {critical && <AlertCircle className="w-3.5 h-3.5 text-red-500 animate-pulse"/>}
                          <span className="text-[10px] font-mono text-muted-foreground">{formatTicketNumber(t.number)}</span>
                          <span className={`ml-auto text-[10px] px-1.5 rounded ${pr.badge}`}>{pr.label}</span>
                        </div>
                        <p className="text-xs font-medium line-clamp-2">{t.title}</p>
                        <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{dept.label}</span>
                          <span>·</span>
                          <span>{new Date(t.last_activity_at).toLocaleDateString('pt-BR')}</span>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
