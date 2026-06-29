import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, UserPlus, ArrowRightLeft, StickyNote, FileSignature, CheckSquare, MessageSquare, Layers } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props { customerId: string }

interface TimelineItem {
  id: string;
  kind: 'lead_event' | 'note' | 'task' | 'signature' | 'assignment' | 'message';
  title: string;
  body?: string;
  at: string;
  meta?: string;
}

const PAGE = 25;

const ICONS: Record<TimelineItem['kind'], any> = {
  lead_event: ArrowRightLeft,
  note: StickyNote,
  task: CheckSquare,
  signature: FileSignature,
  assignment: UserPlus,
  message: MessageSquare,
};

const COLORS: Record<TimelineItem['kind'], string> = {
  lead_event: 'text-blue-500 bg-blue-500/10',
  note: 'text-amber-500 bg-amber-500/10',
  task: 'text-purple-500 bg-purple-500/10',
  signature: 'text-emerald-500 bg-emerald-500/10',
  assignment: 'text-cyan-500 bg-cyan-500/10',
  message: 'text-muted-foreground bg-muted',
};

export function Customer360Timeline({ customerId }: Props) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchPage = useCallback(async (pageIdx: number) => {
    const from = pageIdx * PAGE;
    const to = from + PAGE - 1;
    const [events, notes, sigs, assigns] = await Promise.all([
      supabase.from('lead_events').select('id,type,from_stage_name,to_stage_name,channel,created_at').eq('lead_id', customerId).order('created_at', { ascending: false }).range(from, to),
      supabase.from('customer_notes').select('id,content,author_name,created_at').eq('customer_id', customerId).order('created_at', { ascending: false }).range(from, to),
      supabase.from('signature_documents').select('id,description,status,created_at,lead_id').eq('lead_id', customerId).order('created_at', { ascending: false }).range(from, to).then(r => r, () => ({ data: [], error: null } as any)),
      supabase.from('conversation_assignments').select('id,reason,to_user_id,to_queue_id,created_at').eq('customer_id', customerId).order('created_at', { ascending: false }).range(from, to),
    ]);

    const arr: TimelineItem[] = [];
    (events.data || []).forEach((e: any) => arr.push({
      id: 'e' + e.id, kind: 'lead_event', at: e.created_at,
      title: e.type === 'stage_changed' ? `Movido: ${e.from_stage_name || '—'} → ${e.to_stage_name || '—'}` : e.type,
      meta: e.channel || undefined,
    }));
    (notes.data || []).forEach((n: any) => arr.push({
      id: 'n' + n.id, kind: 'note', at: n.created_at,
      title: `Nota de ${n.author_name || 'atendente'}`, body: n.content,
    }));
    (sigs.data || []).forEach((s: any) => arr.push({
      id: 's' + s.id, kind: 'signature', at: s.created_at,
      title: s.description || 'Documento de assinatura', meta: s.status,
    }));
    (assigns.data || []).forEach((a: any) => arr.push({
      id: 'a' + a.id, kind: 'assignment', at: a.created_at,
      title: a.to_user_id ? 'Transferido para colega' : 'Movido para fila',
      body: a.reason || undefined,
    }));

    const got = (events.data?.length || 0) + (notes.data?.length || 0) + (sigs.data?.length || 0) + (assigns.data?.length || 0);
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
    return () => { cancelled = true; };
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
        <p className="text-xs text-muted-foreground italic">Sem eventos para este cliente ainda.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 -mx-3 px-3">
      <div className="relative pl-4 space-y-3">
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
        {items.map((it) => {
          const Icon = ICONS[it.kind];
          return (
            <div key={it.id} className="relative">
              <div className={`absolute -left-4 top-1 w-3.5 h-3.5 rounded-full flex items-center justify-center ${COLORS[it.kind]}`}>
                <Icon className="w-2 h-2" />
              </div>
              <div className="rounded-lg border border-border bg-secondary/40 p-2.5">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-xs font-semibold leading-tight">{it.title}</p>
                  {it.meta && <Badge variant="outline" className="text-[9px] h-4 px-1.5 shrink-0">{it.meta}</Badge>}
                </div>
                {it.body && <p className="text-[11px] text-foreground/80 whitespace-pre-wrap line-clamp-3">{it.body}</p>}
                <p className="text-[9px] text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(it.at), { addSuffix: true, locale: ptBR })}
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
