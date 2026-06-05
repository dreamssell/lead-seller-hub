
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Activity, CheckCircle2, XCircle, Clock, 
  RefreshCw, AlertCircle, BarChart3, Webhook
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { WhatsAppConnection } from './types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface FacebookDiagnosticsProps {
  conn: WhatsAppConnection;
}

interface EventLog {
  id: string;
  event_type: string;
  status: string;
  error_message?: string;
  created_at: string;
  payload: any;
}

export function FacebookDiagnostics({ conn }: FacebookDiagnosticsProps) {
  const [logs, setLogs] = useState<EventLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    success: 0,
    failures: 0,
    lastSync: null as string | null
  });

  const loadLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('connection_events')
      .select('*')
      .eq('connection_id', conn.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (data) {
      setLogs(data as EventLog[]);
      const lastSync = data.find(l => l.event_type === 'sync')?.created_at;
      setStats({
        success: data.filter(l => l.status === 'success').length,
        failures: data.filter(l => l.status === 'failure').length,
        lastSync: lastSync || null
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    loadLogs();
    
    const channel = supabase
      .channel(`fb-diagnostics-${conn.id}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'connection_events',
        filter: `connection_id=eq.${conn.id}`
      }, () => {
        loadLogs();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conn.id]);

  return (
    <div className="space-y-4 pt-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="bg-secondary/20 border-border/40">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600">
              <Webhook className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Status Webhook</p>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-medium">Ativo</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-secondary/20 border-border/40">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Última Sincronização</p>
              <span className="text-xs font-medium">
                {stats.lastSync ? format(new Date(stats.lastSync), "HH:mm 'de' dd/MM", { locale: ptBR }) : 'Nenhuma'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-secondary/20 border-border/40">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Falhas Recentes</p>
              <span className="text-xs font-medium">{stats.failures} ocorrências</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-secondary/10 border-border/40">
        <CardHeader className="p-4 pb-0 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-bold">Logs de Eventos Real-time</CardTitle>
          </div>
          <Badge variant="outline" className="text-[10px] font-medium">
            Página ID: {conn.metadata?.page_id || 'N/A'}
          </Badge>
        </CardHeader>
        <CardContent className="p-4">
          <ScrollArea className="h-[200px] w-full pr-4">
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <Clock className="w-8 h-8 opacity-20" />
                <p className="text-xs">Aguardando primeiros eventos...</p>
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 p-2 rounded-lg bg-background/50 border border-border/20 text-[11px]">
                    {log.status === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-bold uppercase tracking-wider text-primary">
                          {log.event_type}
                        </span>
                        <span className="text-muted-foreground">
                          {format(new Date(log.created_at), "HH:mm:ss")}
                        </span>
                      </div>
                      {log.error_message && (
                        <p className="text-destructive font-medium mb-1">{log.error_message}</p>
                      )}
                      <div className="bg-black/5 p-1.5 rounded font-mono text-[9px] overflow-hidden text-ellipsis whitespace-nowrap">
                        {JSON.stringify(log.payload)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
