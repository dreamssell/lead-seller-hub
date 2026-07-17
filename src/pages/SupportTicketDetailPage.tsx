import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { STATUS_META, PRIORITY_META, DEPARTMENT_META, formatTicketNumber, slaState, SLA_META, slaRemainingLabel, type SupportStatus } from '@/lib/supportHelpers';
import { usePlatformOwner } from '@/hooks/usePlatformOwner';
import { ArrowLeft, Send, StickyNote, Paperclip, Star, Download, UserCircle2, History, Save, Bell, CheckCircle2, XCircle, Clock } from 'lucide-react';

type Ticket = any;
type Message = { id: string; ticket_id: string; sender_id: string; is_internal_note: boolean; message: string; created_at: string };
type Attachment = { id: string; storage_path: string; file_name: string; file_type: string; file_size: number; message_id: string | null };
type AssignmentLog = { id: string; from_user: string | null; to_user: string | null; changed_by: string; created_at: string };
type Agent = { user_id: string; display_name: string | null; email: string | null };
type NotifLog = { id: string; event_type: string; audience: string; channel: string; recipient: string; body: string; status: string; error: string | null; created_at: string };

export default function SupportTicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isOwner } = usePlatformOwner();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [assignments, setAssignments] = useState<AssignmentLog[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [notifLogs, setNotifLogs] = useState<NotifLog[]>([]);
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});

  async function load() {
    if (!id) return;
    setLoading(true);
    const { data: t } = await supabase.from('support_tickets' as any).select('*').eq('id', id).maybeSingle();
    const { data: m } = await supabase.from('support_ticket_messages' as any).select('*').eq('ticket_id', id).order('created_at');
    const { data: a } = await supabase.from('support_ticket_attachments' as any).select('*').eq('ticket_id', id);
    const { data: nl } = await supabase.from('support_notification_logs' as any).select('*').eq('ticket_id', id).order('created_at');
    setTicket(t as any);
    setMessages((m as any) || []);
    setAttachments((a as any) || []);
    setNotifLogs((nl as any) || []);
    setInternalNotes(((t as any)?.internal_notes) || '');
    if (isOwner) {
      const [{ data: al }, { data: ag }] = await Promise.all([
        supabase.from('support_ticket_assignments' as any).select('*').eq('ticket_id', id).order('created_at', { ascending: false }),
        supabase.from('user_roles').select('user_id, profiles!inner(display_name, email)').eq('role', 'admin' as any),
      ]);
      setAssignments((al as any) || []);
      setAgents((ag as any || []).map((r: any) => ({
        user_id: r.user_id, display_name: r.profiles?.display_name, email: r.profiles?.email,
      })));
    }
    setLoading(false);

    // Signed URLs
    const urls: Record<string, string> = {};
    for (const att of (a as any) || []) {
      const { data } = await supabase.storage.from('support-attachments').createSignedUrl(att.storage_path, 3600);
      if (data?.signedUrl) urls[att.id] = data.signedUrl;
    }
    setAttachmentUrls(urls);
  }

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`support-detail-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_ticket_messages', filter: `ticket_id=eq.${id}` }, load)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `id=eq.${id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const attachmentsByMessage = useMemo(() => {
    const map = new Map<string | 'root', Attachment[]>();
    for (const a of attachments) {
      const key = a.message_id ?? 'root';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [attachments]);

  async function sendReply(isInternal: boolean) {
    if (!user || !ticket) return;
    const text = (isInternal ? note : reply).trim();
    if (!text) return;
    const { error } = await supabase.from('support_ticket_messages' as any).insert({
      ticket_id: ticket.id, sender_id: user.id, is_internal_note: isInternal, message: text,
    });
    if (error) return toast({ title: 'Erro ao enviar', description: error.message, variant: 'destructive' });
    isInternal ? setNote('') : setReply('');
    // Se admin respondeu publicamente e status era 'novo', move para em_analise
    if (isOwner && !isInternal && ticket.status === 'novo') {
      await supabase.from('support_tickets' as any).update({ status: 'em_analise' }).eq('id', ticket.id);
    }
  }

  async function changeStatus(s: SupportStatus) {
    if (!ticket) return;
    const patch: any = { status: s };
    if (s === 'fechado' || s === 'resolvido') patch.closed_at = new Date().toISOString();
    const { error } = await supabase.from('support_tickets' as any).update(patch).eq('id', ticket.id);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else void supabase.functions.invoke('support-notify', { body: { ticket_id: ticket.id, event: 'status_changed' } }).catch(() => {});
  }

  async function submitCsat(rating: number) {
    if (!ticket) return;
    await supabase.from('support_tickets' as any).update({ csat_rating: rating, status: 'fechado', closed_at: new Date().toISOString() }).eq('id', ticket.id);
    toast({ title: 'Obrigado pelo seu feedback! ⭐' });
  }

  async function assignTo(userId: string | null) {
    if (!ticket) return;
    const { error } = await supabase.from('support_tickets' as any)
      .update({ assigned_to: userId }).eq('id', ticket.id);
    if (error) toast({ title: 'Erro ao atribuir', description: error.message, variant: 'destructive' });
    else toast({ title: userId ? 'Responsável atualizado' : 'Atribuição removida' });
  }

  async function saveInternalNotes() {
    if (!ticket) return;
    setSavingNotes(true);
    const { error } = await supabase.from('support_tickets' as any)
      .update({ internal_notes: internalNotes }).eq('id', ticket.id);
    setSavingNotes(false);
    if (error) toast({ title: 'Erro ao salvar nota', description: error.message, variant: 'destructive' });
    else toast({ title: 'Anotação salva' });
  }

  function agentName(userId: string | null) {
    if (!userId) return '—';
    const a = agents.find(x => x.user_id === userId);
    return a?.display_name || a?.email || userId.slice(0, 8);
  }

  if (loading || !ticket) {
    return (
      <AppLayout title="Ticket">
        <div className="h-64 rounded-2xl bg-muted/40 animate-pulse" />
      </AppLayout>
    );
  }

  const st = STATUS_META[ticket.status as SupportStatus];
  const pr = PRIORITY_META[ticket.priority as keyof typeof PRIORITY_META];
  const dept = DEPARTMENT_META[ticket.department as keyof typeof DEPARTMENT_META];

  return (
    <AppLayout title={`Ticket ${formatTicketNumber(ticket.number)}`}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Timeline */}
        <motion.section className="glass-card p-5 lg:col-span-2 space-y-4" initial={{opacity:0}} animate={{opacity:1}}>
          <button onClick={() => navigate(-1)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Voltar
          </button>
          <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className={`px-2 py-0.5 rounded ${pr.badge}`}>{pr.label}</span>
              <span className="px-2 py-0.5 rounded bg-secondary text-muted-foreground">{dept.label}</span>
              <span className={`px-2 py-0.5 rounded bg-secondary ${st.color}`}>{st.label}</span>
            </div>
            <h1 className="text-xl font-semibold">{ticket.title}</h1>
            <p className="text-[11px] text-muted-foreground">Aberto em {new Date(ticket.created_at).toLocaleString('pt-BR')}</p>
          </header>

          {/* Descrição original */}
          <article className="p-4 rounded-xl bg-secondary/40 whitespace-pre-wrap text-sm">{ticket.description}</article>

          {/* Anexos originais */}
          {(attachmentsByMessage.get('root') || []).length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Evidências</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(attachmentsByMessage.get('root') || []).map((a) => (
                  <AttachmentTile key={a.id} a={a} url={attachmentUrls[a.id]} />
                ))}
              </div>
            </div>
          )}

          {/* Timeline mensagens */}
          <div className="space-y-3">
            {messages.map((m) => {
              const isMine = m.sender_id === user?.id;
              const isNote = m.is_internal_note;
              return (
                <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3 rounded-2xl text-sm whitespace-pre-wrap ${
                    isNote ? 'bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400/50 text-yellow-900 dark:text-yellow-100'
                           : isMine ? 'bg-primary text-primary-foreground' : 'bg-secondary'
                  }`}>
                    {isNote && <div className="flex items-center gap-1 text-[10px] font-semibold uppercase mb-1"><StickyNote className="w-3 h-3"/> Nota interna</div>}
                    {m.message}
                    <div className={`text-[10px] mt-1 opacity-70`}>{new Date(m.created_at).toLocaleString('pt-BR')}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Composers */}
          {ticket.status !== 'fechado' && (
            <div className="space-y-3 pt-2 border-t border-border">
              <div>
                <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="Escreva uma resposta…" />
                <div className="flex justify-end mt-2">
                  <Button size="sm" onClick={() => sendReply(false)} disabled={!reply.trim()} className="gap-1"><Send className="w-3.5 h-3.5"/> Responder</Button>
                </div>
              </div>
              {isOwner && (
                <div>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                    placeholder="Nota interna (só a equipe master vê)…"
                    className="bg-yellow-50 dark:bg-yellow-950/30 border-yellow-400/40"
                  />
                  <div className="flex justify-end mt-2">
                    <Button size="sm" variant="outline" onClick={() => sendReply(true)} disabled={!note.trim()} className="gap-1"><StickyNote className="w-3.5 h-3.5"/> Salvar nota</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CSAT — cliente vê quando status=resolvido */}
          {!isOwner && ticket.status === 'resolvido' && !ticket.csat_rating && (
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-center space-y-2">
              <p className="text-sm font-medium">Como você avalia nosso atendimento?</p>
              <div className="flex justify-center gap-1">
                {[1,2,3,4,5].map((n) => (
                  <button key={n} onClick={() => submitCsat(n)}
                    className="p-2 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition">
                    <Star className="w-6 h-6 text-yellow-500" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.section>

        {/* Painel lateral */}
        <motion.aside className="glass-card p-4 space-y-3 self-start" initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.1}}>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</p>
            {isOwner ? (
              <Select value={ticket.status} onValueChange={(v) => changeStatus(v as SupportStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_META) as SupportStatus[]).map(s => (
                    <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : <p className="text-sm font-medium">{st.label}</p>}
          </div>
          {ticket.contact_phone && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Contato</p>
              <p className="text-sm">{ticket.contact_phone}</p>
            </div>
          )}
          {(() => {
            const sla = slaState(ticket.resolution_due_at, ticket.status);
            const meta = SLA_META[sla];
            return (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">SLA</p>
                <span className={`text-xs px-2 py-1 rounded ${meta.badge}`}>
                  {meta.label} · {slaRemainingLabel(ticket.resolution_due_at)}
                </span>
              </div>
            );
          })()}
          {isOwner && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <UserCircle2 className="w-3 h-3"/> Responsável
              </p>
              <Select value={ticket.assigned_to || 'none'} onValueChange={(v) => assignTo(v === 'none' ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Atribuir a…"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem responsável</SelectItem>
                  {agents.map(a => (
                    <SelectItem key={a.user_id} value={a.user_id}>{a.display_name || a.email || a.user_id.slice(0,8)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {isOwner && assignments.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <History className="w-3 h-3"/> Histórico de atribuições
              </p>
              <ul className="space-y-1 mt-1 max-h-32 overflow-y-auto text-[11px]">
                {assignments.map(al => (
                  <li key={al.id} className="p-1.5 rounded bg-secondary/60">
                    <span className="text-muted-foreground">{agentName(al.from_user)}</span>
                    <span className="mx-1">→</span>
                    <span className="font-medium">{agentName(al.to_user)}</span>
                    <div className="text-[9px] text-muted-foreground">{new Date(al.created_at).toLocaleString('pt-BR')}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {isOwner && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <StickyNote className="w-3 h-3"/> Anotação interna (só master)
              </p>
              <div className="relative mt-1">
                <Textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={5}
                  placeholder="Anote aqui contexto, ações tomadas, contatos externos…"
                  className="bg-yellow-100 dark:bg-yellow-900/40 border-yellow-400/60 text-yellow-950 dark:text-yellow-50 placeholder:text-yellow-800/60 dark:placeholder:text-yellow-200/60 shadow-inner font-medium"
                />
              </div>
              <Button size="sm" variant="outline" onClick={saveInternalNotes} disabled={savingNotes} className="mt-2 gap-1 w-full">
                <Save className="w-3.5 h-3.5"/> {savingNotes ? 'Salvando…' : 'Salvar anotação'}
              </Button>
            </div>
          )}
          {isOwner && ticket.csat_rating && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">CSAT</p>
              <div className="flex gap-0.5">
                {Array.from({length: ticket.csat_rating}).map((_, i) => <Star key={i} className="w-4 h-4 text-yellow-500 fill-yellow-500"/>)}
              </div>
            </div>
          )}
        </motion.aside>
      </div>
    </AppLayout>
  );
}

function AttachmentTile({ a, url }: { a: Attachment; url?: string }) {
  const isImage = a.file_type.startsWith('image/');
  const isVideo = a.file_type.startsWith('video/');
  return (
    <div className="relative rounded-lg overflow-hidden border border-border bg-secondary/40">
      {isImage && url && <img src={url} alt={a.file_name} className="w-full h-32 object-cover" />}
      {isVideo && url && <video src={url} controls className="w-full h-32 object-cover" />}
      {!isImage && !isVideo && (
        <div className="p-4 text-center"><Paperclip className="w-6 h-6 mx-auto text-muted-foreground"/></div>
      )}
      <div className="p-1.5 flex items-center gap-1 text-[10px]">
        <span className="flex-1 truncate">{a.file_name}</span>
        {url && (
          <a href={url} download={a.file_name} target="_blank" rel="noreferrer" className="p-1 rounded hover:bg-primary/10 text-primary">
            <Download className="w-3 h-3"/>
          </a>
        )}
      </div>
    </div>
  );
}
