import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserPlus, ArrowRightLeft, StickyNote, FileSignature, Phone, CheckSquare, MessageSquare, Layers } from 'lucide-react';
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      const [events, notes, tasks, sigs, assigns] = await Promise.all([
        supabase.from('lead_events').select('id,type,from_stage_name,to_stage_name,channel,created_at').eq('lead_id', customerId).order('created_at', { ascending: false }).limit(30),
        supabase.from('customer_notes').select('id,content,author_name,created_at').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(20),
        supabase.from('tasks').select('id,title,status,due_at,created_at').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(20).then(r => r, () => ({ data: [], error: null } as any)),
        supabase.from('signature_documents').select('id,title,status,created_at').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(20).then(r => r, () => ({ data: [], error: null } as any)),
        supabase.from('conversation_assignments').select('id,reason,to_user_id,to_queue_id,created_at').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(20),
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
      (tasks.data || []).forEach((t: any) => arr.push({
        id: 't' + t.id, kind: 'task', at: t.created_at,
        title: t.title, meta: t.status,
      }));
      (sigs.data || []).forEach((s: any) => arr.push({
        id: 's' + s.id, kind: 'signature', at: s.created_at,
        title: s.title || 'Documento de assinatura', meta: s.status,
      }));
      (assigns.data || []).forEach((a: any) => arr.push({
        id: 'a' + a.id, kind: 'assignment', at: a.created_at,
        title: a.to_user_id ? 'Transferido para colega' : 'Movido para fila',
        body: a.reason || undefined,
      }));

      arr.sort((a, b) => +new Date(b.at) - +new Date(a.at));
      if (!cancelled) { setItems(arr); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [customerId]);

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
      </div>
    </ScrollArea>
  );
}
