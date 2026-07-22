import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  STATUS_META, PRIORITY_META, DEPARTMENT_META, KANBAN_COLUMNS,
  formatTicketNumber, slaState, SLA_META, slaRemainingLabel,
  type SupportStatus, type SupportPriority, type SupportDepartment, type SlaState,
} from '@/lib/supportHelpers';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LifeBuoy, AlertCircle, UserCircle2, Clock3, Bell } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { describeSupabaseError } from '@/lib/supabaseErrorMessage';
import { NotificationTemplatesDialog } from '@/components/support/NotificationTemplatesDialog';
import { useAuth } from '@/contexts/AuthContext';

type Ticket = {
  id: string; number: number; title: string; status: SupportStatus; priority: SupportPriority;
  department: SupportDepartment; created_at: string; last_activity_at: string;
  owner_id: string; sub_company_id: string | null; user_id: string; assigned_to: string | null;
  resolution_due_at: string | null; first_response_due_at: string | null;
};
type Agent = { user_id: string; display_name: string | null; email: string | null };

export default function MasterSupportPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDept, setFilterDept] = useState<'all' | SupportDepartment>('all');
  const [filterPrio, setFilterPrio] = useState<'all' | SupportPriority>('all');
  const [filterType, setFilterType] = useState<'all' | 'company' | 'subcompany'>('all');
  const [filterSla, setFilterSla] = useState<'all' | SlaState>('all');
  const [templatesOpen, setTemplatesOpen] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: t }, { data: a }] = await Promise.all([
      supabase.from('support_tickets' as any).select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('user_roles').select('user_id, profiles!inner(display_name, email)').eq('role', 'admin' as any),
    ]);
    setTickets((t as any) || []);
    setAgents((a as any || []).map((r: any) => ({
      user_id: r.user_id, display_name: r.profiles?.display_name, email: r.profiles?.email,
    })));
    setLoading(false);
  }

  useEffect(() => {
    void load();
    const ch = supabase.channel('support-master')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_ticket_status_history' }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_ticket_assignments' }, load)
      .subscribe();
    // Recomputa a cada minuto para atualizar contadores de SLA
    const iv = setInterval(() => setTickets((prev) => [...prev]), 60000);
    return () => { supabase.removeChannel(ch); clearInterval(iv); };
  }, []);

  const filtered = useMemo(() => tickets.filter(t => {
    if (filterDept !== 'all' && t.department !== filterDept) return false;
    if (filterPrio !== 'all' && t.priority !== filterPrio) return false;
    if (filterType === 'company' && t.sub_company_id) return false;
    if (filterType === 'subcompany' && !t.sub_company_id) return false;
    if (filterSla !== 'all' && slaState(t.resolution_due_at, t.status) !== filterSla) return false;
    return true;
  }), [tickets, filterDept, filterPrio, filterType, filterSla]);

  const counts = useMemo(() => {
    const c: Record<SupportStatus, number> = { novo: 0, em_analise: 0, aguardando_cliente: 0, resolvido: 0, fechado: 0 };
    for (const t of filtered) c[t.status] = (c[t.status] || 0) + 1;
    return c;
  }, [filtered]);

  const slaSummary = useMemo(() => {
    let breach = 0, warn = 0;
    for (const t of filtered) {
      const s = slaState(t.resolution_due_at, t.status);
      if (s === 'breach') breach++; else if (s === 'warn') warn++;
    }
    return { breach, warn };
  }, [filtered]);

  async function assignTo(ticket: Ticket, userId: string | null) {
    // Optimistic update — reflete imediatamente na caixa seletora
    setTickets((prev) => prev.map((t) => (t.id === ticket.id ? { ...t, assigned_to: userId } : t)));
    const { error } = await supabase.from('support_tickets' as any)
      .update({ assigned_to: userId }).eq('id', ticket.id);
    if (error) {
      toast({
        title: 'Não foi possível atualizar o responsável',
        description: describeSupabaseError(error, 'Tente novamente ou verifique suas permissões.'),
        variant: 'destructive',
      });
      // rollback
      setTickets((prev) => prev.map((t) => (t.id === ticket.id ? { ...t, assigned_to: ticket.assigned_to } : t)));
      return;
    }
    toast({ title: userId ? 'Ticket atribuído' : 'Atribuição removida' });
    if (userId) void supabase.functions.invoke('support-notify', { body: { ticket_id: ticket.id, event: 'assigned' } }).catch(() => {});
  }

  async function changeStatus(ticket: Ticket, status: SupportStatus) {
    const prevStatus = ticket.status;
    setTickets((prev) => prev.map((t) => (t.id === ticket.id ? { ...t, status } : t)));
    const patch: any = { status };
    if (status === 'fechado' || status === 'resolvido') patch.closed_at = new Date().toISOString();
    const { error } = await supabase.from('support_tickets' as any).update(patch).eq('id', ticket.id);
    if (error) {
      toast({
        title: 'Não foi possível mudar o status',
        description: describeSupabaseError(error, 'Tente novamente ou verifique suas permissões.'),
        variant: 'destructive',
      });
      setTickets((prev) => prev.map((t) => (t.id === ticket.id ? { ...t, status: prevStatus } : t)));
      return;
    }
    const event = status === 'resolvido' ? 'resolved' : 'status_changed';
    void supabase.functions.invoke('support-notify', { body: { ticket_id: ticket.id, event } }).catch(() => {});
  }

  return (
    <AppLayout title="Central de Suporte · Master" subtitle="Todos os tickets abertos por Empresas e Sub-empresas">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <LifeBuoy className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium">{filtered.length} tickets</span>
        </div>
        {slaSummary.breach > 0 && (
          <span className="text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-300 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {slaSummary.breach} estourou SLA
          </span>
        )}
        {slaSummary.warn > 0 && (
          <span className="text-xs px-2 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-300 flex items-center gap-1">
            <Clock3 className="w-3 h-3" /> {slaSummary.warn} perto do SLA
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2 items-center">
          <Button size="sm" variant="outline" className="gap-1 h-9" onClick={() => setTemplatesOpen(true)}>
            <Bell className="w-3.5 h-3.5"/> Templates
          </Button>
          <Select value={filterDept} onValueChange={(v: any) => setFilterDept(v)}>
            <SelectTrigger className="w-[170px] h-9"><SelectValue placeholder="Departamento"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos departamentos</SelectItem>
              {(Object.keys(DEPARTMENT_META) as SupportDepartment[]).map(d => <SelectItem key={d} value={d}>{DEPARTMENT_META[d].label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={(v: any) => setFilterType(v)}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Origem"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Empresas + Sub</SelectItem>
              <SelectItem value="company">Só Empresas</SelectItem>
              <SelectItem value="subcompany">Só Sub-empresas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterPrio} onValueChange={(v: any) => setFilterPrio(v)}>
            <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Prioridade"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas prioridades</SelectItem>
              {(Object.keys(PRIORITY_META) as SupportPriority[]).map(p => <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterSla} onValueChange={(v: any) => setFilterSla(v)}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="SLA"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos SLAs</SelectItem>
              <SelectItem value="breach">Estourados</SelectItem>
              <SelectItem value="warn">Perto do prazo</SelectItem>
              <SelectItem value="ok">No prazo</SelectItem>
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
                    const sla = slaState(t.resolution_due_at, t.status);
                    const slaMeta = SLA_META[sla];
                    const isSub = !!t.sub_company_id;
                    return (
                      <motion.div layout key={t.id}
                        className={`w-full text-left p-3 rounded-lg border transition-all hover:shadow-md ${slaMeta.border} ${sla === 'breach' ? 'bg-red-500/5' : sla === 'warn' ? 'bg-amber-500/5' : 'bg-card'}`}
                        whileHover={{ y: -1 }}
                      >
                        <button onClick={() => navigate(`/suporte/${t.id}`)} className="w-full text-left">
                          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                            {sla === 'breach' && <AlertCircle className="w-3.5 h-3.5 text-red-500 animate-pulse"/>}
                            <span className="text-[10px] font-mono text-muted-foreground">{formatTicketNumber(t.number)}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded ${isSub ? 'bg-violet-500/10 text-violet-600 dark:text-violet-300' : 'bg-sky-500/10 text-sky-600 dark:text-sky-300'}`}>
                              {isSub ? 'Sub' : 'Empresa'}
                            </span>
                            <span className={`ml-auto text-[10px] px-1.5 rounded ${pr.badge}`}>{pr.label}</span>
                          </div>
                          <p className="text-xs font-medium line-clamp-2">{t.title}</p>
                          <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                            <span>{dept.label}</span>
                            <span>·</span>
                            <span className={`px-1.5 py-0.5 rounded ${slaMeta.badge}`}>SLA {slaRemainingLabel(t.resolution_due_at)}</span>
                          </div>
                        </button>
                        <div className="mt-2 pt-2 border-t border-border/60 flex items-center gap-1.5">
                          <UserCircle2 className="w-3.5 h-3.5 text-muted-foreground shrink-0"/>
                          <Select value={t.assigned_to || 'none'} onValueChange={(v) => assignTo(t, v === 'none' ? null : v)}>
                            <SelectTrigger className="h-7 text-[11px] px-2"><SelectValue placeholder="Atribuir…"/></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem responsável</SelectItem>
                              {agents.map(a => (
                                <SelectItem key={a.user_id} value={a.user_id}>{a.display_name || a.email || a.user_id.slice(0,8)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <Select value={t.status} onValueChange={(v) => changeStatus(t, v as SupportStatus)}>
                            <SelectTrigger className="h-7 text-[11px] px-2"><SelectValue/></SelectTrigger>
                            <SelectContent>
                              {KANBAN_COLUMNS.map((s) => (
                                <SelectItem key={s} value={s}>{STATUS_META[s].kanbanTitle}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {user?.id && (
        <NotificationTemplatesDialog
          open={templatesOpen}
          onOpenChange={setTemplatesOpen}
          ownerId={user.id}
        />
      )}
    </AppLayout>
  );
}
