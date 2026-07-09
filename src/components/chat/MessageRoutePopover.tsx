import { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Route, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MessageEvent {
  id: string;
  stage: string;
  status: string | null;
  detail: any;
  created_at: string;
}

const STAGE_LABEL: Record<string, string> = {
  composed: 'Composta',
  queued: 'Na fila',
  provider_sent: 'Enviada ao provedor',
  provider_ack: 'Confirmada pelo provedor',
  delivered: 'Entregue',
  read: 'Lida',
  failed: 'Falhou',
};

/**
 * Popover que mostra o "trajeto" de uma mensagem, unindo eventos por
 * message_id ou correlation_id. Serve como diagnóstico rápido no chat.
 */
export function MessageRoutePopover({ messageId, correlationId }: { messageId?: string | null; correlationId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<MessageEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const client = supabase as any;
        const q = client.from('message_events').select('id, stage, status, detail, created_at').order('created_at', { ascending: true });
        const res = messageId
          ? await q.eq('message_id', messageId)
          : correlationId
            ? await q.eq('correlation_id', correlationId)
            : { data: [] };
        if (!cancelled) setEvents((res?.data as MessageEvent[]) ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, messageId, correlationId]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-60 hover:opacity-100" title="Ver rota da mensagem">
          <Route className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-2">
          <div className="text-sm font-semibold">Rota da mensagem</div>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Carregando eventos…
            </div>
          ) : events.length === 0 ? (
            <div className="text-xs text-muted-foreground">Nenhum evento registrado ainda.</div>
          ) : (
            <ol className="space-y-1.5 text-xs">
              {events.map((e) => (
                <li key={e.id} className="flex items-start gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">{STAGE_LABEL[e.stage] ?? e.stage}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(e.created_at), { addSuffix: true, locale: ptBR })}
                      {e.status ? ` · ${e.status}` : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default MessageRoutePopover;
