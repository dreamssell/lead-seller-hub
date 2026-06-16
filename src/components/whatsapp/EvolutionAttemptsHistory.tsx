import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, RefreshCw, Loader2, CheckCircle2, XCircle, Info } from 'lucide-react';

interface AttemptRow {
  id: string;
  event_type: string;
  status: string;
  status_detail: string | null;
  error_message: string | null;
  payload: any;
  metadata_json: any;
  created_at: string;
}

interface Props {
  connectionId: string;
  /** When true, only Evolution-prefixed events are shown. */
  evolutionOnly?: boolean;
  limit?: number;
}

const STATUS_ICON: Record<string, { icon: any; cls: string }> = {
  success: { icon: CheckCircle2, cls: 'text-emerald-500' },
  error: { icon: XCircle, cls: 'text-destructive' },
  info: { icon: Info, cls: 'text-muted-foreground' },
};

export function EvolutionAttemptsHistory({ connectionId, evolutionOnly = true, limit = 30 }: Props) {
  const [rows, setRows] = useState<AttemptRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from('connection_events')
      .select('id,event_type,status,status_detail,error_message,payload,metadata_json,created_at')
      .eq('connection_id', connectionId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (evolutionOnly) q = q.like('event_type', 'evolution.%');
    const { data } = await q;
    setRows((data ?? []) as AttemptRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  return (
    <div className="rounded-xl border border-border/60 bg-secondary/20">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <History className="w-4 h-4 text-violet-500" />
          Histórico de tentativas
          <Badge variant="outline" className="text-[10px]">{rows.length}</Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="h-7 px-2">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </Button>
      </div>
      <ScrollArea className="max-h-64">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground p-4 text-center">
            Nenhuma tentativa registrada ainda. Gere um QR Code para começar.
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {rows.map((r) => {
              const meta = STATUS_ICON[r.status] ?? STATUS_ICON.info;
              const Icon = meta.icon;
              return (
                <li key={r.id} className="px-3 py-2 flex items-start gap-2 text-xs">
                  <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${meta.cls}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-medium truncate">{r.event_type}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {new Date(r.created_at).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    {(r.status_detail || r.error_message) && (
                      <p className="text-muted-foreground truncate">
                        {r.error_message || r.status_detail}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
