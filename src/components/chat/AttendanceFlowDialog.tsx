/**
 * AttendanceFlowDialog — Fluxo de Atendimento com 4 abas.
 *
 * ABA 1: Entrada Manual (Quick Add com Primeira Nota obrigatória para CRM 360)
 * ABA 2: Distribuição Automática (leads roteados; visíveis a gestores)
 * ABA 3: Aguardando Você (fila pessoal do atendente com SLA)
 * ABA 4: Em Atendimento (chats ativos; snooze / encerrar com valor+tag)
 *
 * Gestores (supervisor/coordenador/diretor/admin) veem tudo do owner;
 * atendentes veem apenas seus próprios assignments.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useIsSupervisor } from '@/hooks/useIsSupervisor';
import { SlaTimer } from '@/components/chat/SlaTimer';
import { toast } from 'sonner';
import {
  UserPlus, Bot, Inbox, MessageCircle, Clock, RotateCcw, PauseCircle,
  CheckCircle2, Loader2, Sparkles, ArrowLeftRight, Archive,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelectCustomer?: (customerId: string) => void;
}

interface AssignmentRow {
  id: string;
  customer_id: string;
  assigned_to: string | null;
  queue_id: string | null;
  stage: string;
  priority: string | null;
  origin: string | null;
  first_note: string | null;
  assigned_at: string;
  first_response_at: string | null;
  snoozed_until: string | null;
  metadata: any;
  customer?: { name: string | null; phone: string | null; avatar_url: string | null } | null;
  queue?: { name: string | null } | null;
}

interface QueueRow {
  id: string;
  name: string;
  routing_strategy: string;
  pipeline_id: string | null;
}

const STAGE_LABEL: Record<string, string> = {
  manual: 'Manual',
  auto: 'Automática',
  waiting: 'Aguardando',
  active: 'Em Atendimento',
  snoozed: 'Snooze',
  closed: 'Encerrado',
  returned: 'Devolvido',
};

const STRATEGY_LABEL: Record<string, string> = {
  round_robin: 'Round-Robin',
  skill: 'Skill-Based',
  load_balance: 'Load Balancing',
  manual: 'Manual',
};

export function AttendanceFlowDialog({ open, onOpenChange, onSelectCustomer }: Props) {
  const { user, access } = useAuth();
  const { isSupervisor, userId } = useIsSupervisor();
  const ownerId = access?.owner_id || user?.id || null;

  const [tab, setTab] = useState('manual');
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [queues, setQueues] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Quick Add form
  const [qaName, setQaName] = useState('');
  const [qaPhone, setQaPhone] = useState('');
  const [qaOrigin, setQaOrigin] = useState('manual');
  const [qaQueue, setQaQueue] = useState<string>('');
  const [qaNote, setQaNote] = useState('');
  const [qaAutoAssign, setQaAutoAssign] = useState(true);
  const [qaSubmitting, setQaSubmitting] = useState(false);

  // Encerrar
  const [closeId, setCloseId] = useState<string | null>(null);
  const [closeValue, setCloseValue] = useState('');
  const [closeTag, setCloseTag] = useState<string>('ganho');

  const load = async () => {
    if (!ownerId) return;
    setLoading(true);
    try {
      let q = supabase
        .from('lead_assignments')
        .select('id, customer_id, assigned_to, queue_id, stage, priority, origin, first_note, assigned_at, first_response_at, snoozed_until, metadata, customer:customers(name, phone, avatar_url), queue:attendance_queues(name)')
        .eq('owner_id', ownerId)
        .order('assigned_at', { ascending: false })
        .limit(200);
      if (!isSupervisor && userId) q = q.eq('assigned_to', userId);
      const [{ data: a }, { data: qs }] = await Promise.all([
        q,
        supabase.from('attendance_queues').select('id, name, routing_strategy, pipeline_id').eq('owner_id', ownerId).eq('is_active', true).order('name'),
      ]);
      setAssignments((a as any) || []);
      setQueues((qs as any) || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) load(); }, [open, ownerId, isSupervisor, userId]);

  useEffect(() => {
    if (!open || !ownerId) return;
    const ch = supabase
      .channel(`attendance-flow-${ownerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_assignments', filter: `owner_id=eq.${ownerId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ownerId]);

  const filtered = useMemo(() => ({
    auto: assignments.filter(a => ['auto', 'waiting'].includes(a.stage)),
    waiting: assignments.filter(a => a.stage === 'waiting' && (!userId || a.assigned_to === userId)),
    active: assignments.filter(a => ['active', 'snoozed'].includes(a.stage) && (!userId || a.assigned_to === userId)),
    closed: assignments.filter(a => a.stage === 'closed'),
  }), [assignments, userId]);

  const openCustomer = (id: string) => {
    onSelectCustomer?.(id);
    onOpenChange(false);
  };

  const submitQuickAdd = async () => {
    if (!ownerId) return;
    if (!qaName.trim() || !qaPhone.trim()) { toast.error('Nome e telefone são obrigatórios'); return; }
    if (!qaNote.trim()) { toast.error('Primeira Nota é obrigatória para o CRM 360'); return; }
    setQaSubmitting(true);
    try {
      const { data: cust, error: cErr } = await supabase
        .from('customers')
        .insert({ owner_id: ownerId, name: qaName.trim(), phone: qaPhone.trim(), channel: 'manual', created_by: userId } as any)
        .select('id')
        .single();
      if (cErr || !cust) throw cErr || new Error('Falha ao criar cliente');

      await supabase.from('customer_notes').insert({
        customer_id: cust.id, owner_id: ownerId, author_id: userId, content: qaNote.trim(),
      } as any);

      const payload: any = {
        owner_id: ownerId,
        customer_id: cust.id,
        stage: qaAutoAssign ? 'waiting' : 'manual',
        priority: 'medium',
        origin: qaOrigin,
        first_note: qaNote.trim(),
        queue_id: qaQueue || null,
        assigned_to: qaAutoAssign ? null : userId,
      };
      if (qaAutoAssign && qaQueue) {
        const { data: nextUser } = await (supabase as any).rpc('pick_next_queue_member', { _queue_id: qaQueue });
        if (nextUser) payload.assigned_to = nextUser;
      }
      const { error: aErr } = await supabase.from('lead_assignments').insert(payload);
      if (aErr) throw aErr;
      toast.success('Lead cadastrado e registrado no CRM 360');
      setQaName(''); setQaPhone(''); setQaNote(''); setQaOrigin('manual'); setQaQueue('');
      load();
      openCustomer(cust.id);
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao cadastrar lead');
    } finally {
      setQaSubmitting(false);
    }
  };

  const returnToQueue = async (a: AssignmentRow) => {
    const { error } = await supabase.from('lead_assignments').update({ assigned_to: null, stage: 'waiting' } as any).eq('id', a.id);
    if (error) toast.error('Falha ao devolver'); else { toast.success('Devolvido para a fila'); load(); }
  };

  const takeAssignment = async (a: AssignmentRow) => {
    if (!userId) return;
    const { error } = await supabase.from('lead_assignments').update({ assigned_to: userId, stage: 'active', first_response_at: a.first_response_at || new Date().toISOString() } as any).eq('id', a.id);
    if (error) toast.error('Falha ao assumir'); else { toast.success('Atendimento assumido'); load(); openCustomer(a.customer_id); }
  };

  const snooze = async (a: AssignmentRow, minutes: number) => {
    const until = new Date(Date.now() + minutes * 60_000).toISOString();
    const { error } = await supabase.from('lead_assignments').update({ stage: 'snoozed', snoozed_until: until } as any).eq('id', a.id);
    if (error) toast.error('Falha no snooze'); else { toast.success(`Snooze por ${minutes} min`); load(); }
  };

  const openClose = (a: AssignmentRow) => { setCloseId(a.id); setCloseValue(''); setCloseTag('ganho'); };
  const submitClose = async () => {
    if (!closeId) return;
    const value = parseFloat(closeValue.replace(',', '.')) || 0;
    const { error } = await supabase.from('lead_assignments').update({
      stage: 'closed', closed_at: new Date().toISOString(),
      close_value: value, close_status_tag: closeTag,
    } as any).eq('id', closeId);
    if (error) { toast.error('Falha ao encerrar'); return; }
    toast.success('Atendimento encerrado e enviado ao CRM 360');
    setCloseId(null); load();
  };

  const renderRow = (a: AssignmentRow, actions: React.ReactNode) => (
    <div key={a.id} className="border border-border rounded-lg p-3 hover:bg-secondary/40 transition-colors">
      <div className="flex items-start gap-3">
        <button onClick={() => openCustomer(a.customer_id)} className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{a.customer?.name || 'Sem nome'}</span>
            <Badge variant="outline" className="text-[10px] h-5">{STAGE_LABEL[a.stage] || a.stage}</Badge>
            {a.queue?.name && <Badge variant="secondary" className="text-[10px] h-5">{a.queue.name}</Badge>}
            {a.origin && <Badge variant="outline" className="text-[10px] h-5">{a.origin}</Badge>}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{a.customer?.phone || '—'}</div>
          {a.first_note && <div className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">"{a.first_note}"</div>}
          {!a.first_response_at && a.stage === 'waiting' && (
            <div className="mt-2">
              <SlaTimer label="1ª resposta" dueAt={new Date(new Date(a.assigned_at).getTime() + 15 * 60_000).toISOString()} totalMinutes={15} />
            </div>
          )}
        </button>
        <div className="flex flex-col gap-1 shrink-0">{actions}</div>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-primary" /> Fluxo de Atendimento
            {isSupervisor && <Badge variant="secondary" className="text-[10px]">Visão gestor</Badge>}
          </DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-5">
            <TabsTrigger value="manual" className="gap-1.5"><UserPlus className="w-4 h-4" /> Entrada Manual</TabsTrigger>
            <TabsTrigger value="auto" className="gap-1.5"><Bot className="w-4 h-4" /> Distribuição<Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{filtered.auto.length}</Badge></TabsTrigger>
            <TabsTrigger value="waiting" className="gap-1.5"><Inbox className="w-4 h-4" /> Aguardando<Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{filtered.waiting.length}</Badge></TabsTrigger>
            <TabsTrigger value="active" className="gap-1.5"><MessageCircle className="w-4 h-4" /> Em Atendimento<Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{filtered.active.length}</Badge></TabsTrigger>
            <TabsTrigger value="closed" className="gap-1.5"><Archive className="w-4 h-4" /> Finalizados<Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{filtered.closed.length}</Badge></TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="flex-1 overflow-auto mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input value={qaName} onChange={e => setQaName(e.target.value)} placeholder="Nome completo" />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone *</Label>
                <Input value={qaPhone} onChange={e => setQaPhone(e.target.value)} placeholder="+55 11 90000-0000" />
              </div>
              <div className="space-y-1.5">
                <Label>Origem</Label>
                <Select value={qaOrigin} onValueChange={setQaOrigin}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="indicacao">Indicação</SelectItem>
                    <SelectItem value="site">Site</SelectItem>
                    <SelectItem value="landing">Landing Page</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="telefone">Telefone</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fila / Setor</Label>
                <Select value={qaQueue} onValueChange={setQaQueue}>
                  <SelectTrigger><SelectValue placeholder="Escolha uma fila (opcional)" /></SelectTrigger>
                  <SelectContent>
                    {queues.map(q => <SelectItem key={q.id} value={q.id}>{q.name} · {STRATEGY_LABEL[q.routing_strategy] || q.routing_strategy}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Primeira Nota * <span className="text-[10px] text-muted-foreground">(obrigatória — grava no CRM 360)</span></Label>
              <Textarea value={qaNote} onChange={e => setQaNote(e.target.value)} rows={4} placeholder="Contexto inicial, necessidade, canal de origem, próxima ação..." />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={qaAutoAssign} onChange={e => setQaAutoAssign(e.target.checked)} />
              Auto-atribuir usando estratégia da fila
            </label>
            <div className="flex justify-end">
              <Button onClick={submitQuickAdd} disabled={qaSubmitting} className="gap-2">
                {qaSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Cadastrar e abrir conversa
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="auto" className="flex-1 overflow-hidden mt-3">
            <ScrollArea className="h-[55vh] pr-2">
              <div className="space-y-2">
                {loading && <div className="text-xs text-muted-foreground">Carregando...</div>}
                {!loading && filtered.auto.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-8">
                    <Sparkles className="w-6 h-6 mx-auto mb-2 opacity-60" />
                    Nenhum lead em distribuição automática no momento.
                  </div>
                )}
                {filtered.auto.map(a => renderRow(a, (
                  <Button size="sm" variant="outline" onClick={() => openCustomer(a.customer_id)} className="h-7 text-xs">Abrir</Button>
                )))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="waiting" className="flex-1 overflow-hidden mt-3">
            <ScrollArea className="h-[55vh] pr-2">
              <div className="space-y-2">
                {!loading && filtered.waiting.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-8">
                    <Clock className="w-6 h-6 mx-auto mb-2 opacity-60" />
                    Nenhum lead aguardando você.
                  </div>
                )}
                {filtered.waiting.map(a => renderRow(a, (
                  <>
                    <Button size="sm" onClick={() => takeAssignment(a)} className="h-7 text-xs gap-1"><CheckCircle2 className="w-3 h-3" />Assumir</Button>
                    <Button size="sm" variant="outline" onClick={() => returnToQueue(a)} className="h-7 text-xs gap-1"><RotateCcw className="w-3 h-3" />Devolver</Button>
                  </>
                )))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="active" className="flex-1 overflow-hidden mt-3">
            <ScrollArea className="h-[55vh] pr-2">
              <div className="space-y-2">
                {!loading && filtered.active.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-8">
                    <MessageCircle className="w-6 h-6 mx-auto mb-2 opacity-60" />
                    Nenhum atendimento ativo.
                  </div>
                )}
                {filtered.active.map(a => renderRow(a, (
                  <>
                    <Button size="sm" onClick={() => openCustomer(a.customer_id)} className="h-7 text-xs">Abrir</Button>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => snooze(a, 30)} className="h-7 text-[10px] gap-1 px-2" title="Snooze 30min"><PauseCircle className="w-3 h-3" />30m</Button>
                      <Button size="sm" variant="outline" onClick={() => snooze(a, 120)} className="h-7 text-[10px] gap-1 px-2" title="Snooze 2h"><PauseCircle className="w-3 h-3" />2h</Button>
                    </div>
                    <Button size="sm" variant="destructive" onClick={() => openClose(a)} className="h-7 text-xs gap-1"><CheckCircle2 className="w-3 h-3" />Encerrar</Button>
                  </>
                )))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="closed" className="flex-1 overflow-hidden mt-3">
            <ScrollArea className="h-[55vh] pr-2">
              <div className="space-y-2">
                {!loading && filtered.closed.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-8">
                    <Archive className="w-6 h-6 mx-auto mb-2 opacity-60" />
                    Nenhum atendimento finalizado ainda.
                  </div>
                )}
                {filtered.closed.map(a => renderRow(a, (
                  <>
                    <Button size="sm" variant="outline" onClick={() => openCustomer(a.customer_id)} className="h-7 text-xs">Abrir</Button>
                    {a.metadata?.close_value != null && (
                      <Badge variant="secondary" className="text-[10px]">R$ {Number(a.metadata.close_value || 0).toLocaleString('pt-BR')}</Badge>
                    )}
                  </>
                )))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>


        {closeId && (
          <div className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4" onClick={() => setCloseId(null)}>
            <div className="bg-card border border-border rounded-xl p-5 max-w-md w-full space-y-3" onClick={e => e.stopPropagation()}>
              <h3 className="font-semibold flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" />Encerrar atendimento</h3>
              <p className="text-xs text-muted-foreground">Registra valor negociado e tag de status para o CRM 360 e os dashboards.</p>
              <div className="space-y-1.5">
                <Label>Valor negociado (R$)</Label>
                <Input value={closeValue} onChange={e => setCloseValue(e.target.value)} placeholder="0,00" inputMode="decimal" />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={closeTag} onValueChange={setCloseTag}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ganho">Ganho</SelectItem>
                    <SelectItem value="perdido">Perdido</SelectItem>
                    <SelectItem value="sem_interesse">Sem interesse</SelectItem>
                    <SelectItem value="sem_contato">Sem contato</SelectItem>
                    <SelectItem value="postergado">Postergado</SelectItem>
                    <SelectItem value="convertido">Convertido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setCloseId(null)}>Cancelar</Button>
                <Button onClick={submitClose}>Confirmar encerramento</Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
