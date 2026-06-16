import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowRight, Sparkles, History } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Event = {
  id: string;
  type: string;
  from_stage_name: string | null;
  to_stage_name: string | null;
  channel: string | null;
  source: string | null;
  created_at: string;
  metadata: any;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId: string | null;
  leadName?: string;
}

const TYPE_LABEL: Record<string, string> = {
  created: 'Lead criado',
  stage_changed: 'Mudança de etapa',
  assigned: 'Atribuição',
  status_changed: 'Status alterado',
  note: 'Nota',
};

export function LeadHistoryDialog({ open, onOpenChange, leadId, leadName }: Props) {
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    if (!open || !leadId) return;
    setLoading(true);
    supabase.from('lead_events')
      .select('id,type,from_stage_name,to_stage_name,channel,source,created_at,metadata')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setEvents((data as Event[]) || []);
        setLoading(false);
      });
  }, [open, leadId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="w-4 h-4" /> Histórico do lead</DialogTitle>
          <DialogDescription>{leadName || 'Eventos e mudanças de etapa'}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sem eventos registrados ainda.</p>
        ) : (
          <ol className="relative border-l border-border pl-5 space-y-4">
            {events.map(ev => (
              <li key={ev.id} className="relative">
                <span className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-primary ring-4 ring-background" />
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{TYPE_LABEL[ev.type] || ev.type}</span>
                  {ev.channel && <Badge variant="secondary" className="text-[10px]">{ev.channel}</Badge>}
                  {ev.source && <Badge variant="outline" className="text-[10px]">{ev.source}</Badge>}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true, locale: ptBR })}
                  </span>
                </div>
                {ev.type === 'stage_changed' && (
                  <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                    <span>{ev.from_stage_name || '—'}</span>
                    <ArrowRight className="w-3 h-3" />
                    <span className="text-foreground font-medium">{ev.to_stage_name || '—'}</span>
                  </div>
                )}
                {ev.type === 'created' && (
                  <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Entrou em {ev.to_stage_name || 'sem etapa'}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
