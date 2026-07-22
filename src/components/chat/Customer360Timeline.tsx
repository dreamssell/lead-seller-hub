// CRM 360 — apenas EVENTOS do cliente (agendamentos, notas, assinaturas,
// mudanças de etapa do funil). Não inclui histórico de ligações nem origem
// do lead — isso vai na aba "Histórico de Atendimento".
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Loader2, ArrowRightLeft, StickyNote, FileSignature,
  Layers, Clock, CheckCircle2, XCircle, Loader, Send,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props { customerId: string }

type Kind = 'lead_event' | 'note' | 'signature' | 'followup';

interface TimelineItem {
  id: string;
  kind: Kind;
  title: string;
  body?: string;
  at: string;
  meta?: string;
  status?: string;
  details?: { label: string; value: string }[];
}

const PAGE = 25;

const ICONS: Record<Kind, any> = {
  lead_event: ArrowRightLeft,
  note: StickyNote,
  signature: FileSignature,
  followup: Send,
};

const COLORS: Record<Kind, string> = {
  lead_event: 'text-blue-500 bg-blue-500/10',
  note: 'text-amber-500 bg-amber-500/10',
  signature: 'text-emerald-500 bg-emerald-500/10',
  followup: 'text-indigo-500 bg-indigo-500/10',
};

const STATUS_META: Record<string, { label: string; icon: any; className: string }> = {
  scheduled: { label: 'Agendado', icon: Clock, className: 'text-amber-600 border-amber-500/40 bg-amber-500/10' },
  processing: { label: 'Enviando', icon: Loader, className: 'text-blue-600 border-blue-500/40 bg-blue-500/10' },
  sent: { label: 'Enviado', icon: CheckCircle2, className: 'text-emerald-600 border-emerald-500/40 bg-emerald-500/10' },
  failed: { label: 'Falhou', icon: XCircle, className: 'text-red-600 border-red-500/40 bg-red-500/10' },
  error: { label: 'Erro', icon: XCircle, className: 'text-red-600 border-red-500/40 bg-red-500/10' },
  cancelled: { label: 'Cancelado', icon: XCircle, className: 'text-muted-foreground border-border bg-muted' },
  pending: { label: 'Pendente', icon: Clock, className: 'text-amber-600 border-amber-500/40 bg-amber-500/10' },
  signed: { label: 'Assinado', icon: CheckCircle2, className: 'text-emerald-600 border-emerald-500/40 bg-emerald-500/10' },
  completed: { label: 'Concluído', icon: CheckCircle2, className: 'text-emerald-600 border-emerald-500/40 bg-emerald-500/10' },
  expired: { label: 'Expirado', icon: XCircle, className: 'text-muted-foreground border-border bg-muted' },
};

function fmtDT(iso: string) {
  try { return format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }); }
  catch { return iso; }
}

function translateLeadEvent(type: string): string {
  const map: Record<string, string> = {
    stage_changed: 'Mudança de etapa',
    created: 'Lead criado',
    updated: 'Lead atualizado',
    assigned: 'Lead atribuído',
    reassigned: 'Lead reatribuído',
    lost: 'Lead perdido',
    won: 'Lead ganho',
    contacted: 'Contato realizado',
    qualified: 'Lead qualificado',
    note_added: 'Nota adicionada',
    transferred_to_user: 'Conversa transferida para colega',
    transferred_to_stage: 'Conversa movida para fluxo',
  };
  return map[type] || type;
}


export function Customer360Timeline({ customerId }: Props) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchPage = useCallback(async (pageIdx: number) => {
    const from = pageIdx * PAGE;
    const to = from + PAGE - 1;

    const { data: leadsData } = await supabase
      .from('leads')
      .select('id')
      .eq('customer_id', customerId);
    const leadIds = (leadsData || []).map((l: any) => l.id);

    const leadEventsQuery = leadIds.length
      ? supabase.from('lead_events')
          .select('id,type,from_stage_name,to_stage_name,channel,source,created_at')
          .in('lead_id', leadIds)
          .order('created_at', { ascending: false })
          .range(from, to)
      : Promise.resolve({ data: [], error: null } as any);

    const [notes, sigs, followups, events] = await Promise.all([
      supabase.from('customer_notes').select('id,content,author_name,created_at').eq('customer_id', customerId).order('created_at', { ascending: false }).range(from, to),
      supabase.from('signature_documents').select('id,description,status,created_at,lead_id')
        .in('lead_id', leadIds.length ? leadIds : ['00000000-0000-0000-0000-000000000000'])
        .order('created_at', { ascending: false }).range(from, to)
        .then(r => r, () => ({ data: [], error: null } as any)),
      supabase.from('auto_followups').select('id,status,scheduled_for,sent_at,cancelled_reason,message_template,created_at,updated_at').eq('customer_id', customerId).order('created_at', { ascending: false }).range(from, to),
      leadEventsQuery,
    ]);

    const arr: TimelineItem[] = [];

    (events.data || []).forEach((e: any) => {
      const isStage = e.type === 'stage_changed';
      arr.push({
        id: 'e' + e.id,
        kind: 'lead_event',
        at: e.created_at,
        title: isStage
          ? `Etapa: ${e.from_stage_name || '—'} → ${e.to_stage_name || '—'}`
          : translateLeadEvent(e.type),
        meta: e.channel || e.source || undefined,
      });
    });

    (followups.data || []).forEach((f: any) => {
      const s = STATUS_META[f.status] || STATUS_META.scheduled;
      const at = f.sent_at || f.updated_at || f.scheduled_for || f.created_at;
      arr.push({
        id: 'f' + f.id,
        kind: 'followup',
        at,
        status: f.status,
        title: `Agendamento — ${s.label}`,
        body: f.message_template,
        details: [
          { label: 'Agendado para', value: fmtDT(f.scheduled_for) },
          f.sent_at ? { label: 'Enviado em', value: fmtDT(f.sent_at) } : null,
          f.cancelled_reason ? { label: 'Motivo', value: f.cancelled_reason } : null,
        ].filter(Boolean) as any,
      });
    });

    (notes.data || []).forEach((n: any) => arr.push({
      id: 'n' + n.id, kind: 'note', at: n.created_at,
      title: `Nota de ${n.author_name || 'atendente'}`, body: n.content,
    }));
    (sigs.data || []).forEach((s: any) => arr.push({
      id: 's' + s.id, kind: 'signature', at: s.created_at,
      title: s.description || 'Documento de assinatura',
      status: s.status,
    }));

    const got =
      (events.data?.length || 0) +
      (notes.data?.length || 0) +
      (sigs.data?.length || 0) +
      (followups.data?.length || 0);

    arr.sort((a, b) => +new Date(b.at) - +new Date(a.at));
    return { arr, exhausted: got < PAGE };
  }, [customerId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setItems([]); setPage(0); setHasMore(true);
    (async () => {
      const { arr, exhausted } = await fetchPage(0);
      if (cancelled) return;
      setItems(arr); setHasMore(!exhausted); setLoading(false);
    })();

    const ch = supabase
      .channel(`c360-${customerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auto_followups', filter: `customer_id=eq.${customerId}` }, () => {
        fetchPage(0).then(({ arr, exhausted }) => {
          if (cancelled) return;
          setItems(arr); setHasMore(!exhausted); setPage(0);
        });
      })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [customerId, fetchPage]);

  const loadMore = async () => {
    setLoadingMore(true);
    const next = page + 1;
    const { arr, exhausted } = await fetchPage(next);
    setItems(prev => {
      const seen = new Set(prev.map(i => i.id));
      const merged = [...prev, ...arr.filter(i => !seen.has(i.id))];
      merged.sort((a, b) => +new Date(b.at) - +new Date(a.at));
      return merged;
    });
    setPage(next); setHasMore(!exhausted); setLoadingMore(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  }
  if (!items.length) {
    return (
      <div className="text-center py-8 px-3">
        <Layers className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-xs text-muted-foreground italic">Nenhum evento registrado ainda.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 -mx-3 px-3">
      <div className="relative pl-4 space-y-3">
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
        {items.map((it) => {
          const Icon = ICONS[it.kind];
          const statusMeta = it.status ? STATUS_META[it.status] : undefined;
          const StatusIcon = statusMeta?.icon;
          return (
            <div key={it.id} className="relative">
              <div className={`absolute -left-4 top-1 w-3.5 h-3.5 rounded-full flex items-center justify-center ${COLORS[it.kind]}`}>
                <Icon className="w-2 h-2" />
              </div>
              <div className="rounded-lg border border-border bg-secondary/40 p-2.5">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-xs font-semibold leading-tight">{it.title}</p>
                  {statusMeta ? (
                    <Badge variant="outline" className={`text-[9px] h-4 px-1.5 shrink-0 gap-1 ${statusMeta.className}`}>
                      {StatusIcon && <StatusIcon className={`w-2.5 h-2.5 ${it.status === 'processing' ? 'animate-spin' : ''}`} />}
                      {statusMeta.label}
                    </Badge>
                  ) : it.meta ? (
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 shrink-0">{it.meta}</Badge>
                  ) : null}
                </div>
                {it.body && <p className="text-[11px] text-foreground/80 whitespace-pre-wrap line-clamp-3">{it.body}</p>}
                {it.details && it.details.length > 0 && (
                  <div className="mt-1.5 grid grid-cols-1 gap-0.5">
                    {it.details.map((d, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[10px]">
                        <span className="text-muted-foreground">{d.label}:</span>
                        <span className="text-foreground/90 font-medium">{d.value}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[9px] text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(it.at), { addSuffix: true, locale: ptBR })} · {fmtDT(it.at)}
                </p>
              </div>
            </div>
          );
        })}
        {hasMore && (
          <div className="pt-2 pb-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-7 text-[11px]"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Carregando…</> : 'Carregar mais'}
            </Button>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
