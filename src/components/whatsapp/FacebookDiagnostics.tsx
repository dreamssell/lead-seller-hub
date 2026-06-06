
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Activity, CheckCircle2, XCircle, Clock, 
  RefreshCw, AlertCircle, Webhook, Search, Filter,
  ChevronLeft, ChevronRight, Loader2, AlertTriangle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { WhatsAppConnection } from './types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const [page, setPage] = useState(0);
  const [pageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  
  const [stats, setStats] = useState({
    success: 0,
    failures: 0,
    lastSync: null as string | null
  });

  const loadLogs = async () => {
    setLoading(true);
    let query = supabase
      .from('connection_events')
      .select('*', { count: 'exact' })
      .eq('connection_id', conn.id);

    if (search) {
      query = query.or(`error_message.ilike.%${search}%,event_type.ilike.%${search}%`);
    }

    if (typeFilter !== 'all') {
      query = query.eq('event_type', typeFilter);
    }

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (data) {
      setLogs(data as EventLog[]);
      setTotalCount(count || 0);
      
      // Update stats based on recent events
      const lastSync = data.find(l => l.event_type === 'sync' || l.event_type === 'webhook')?.created_at;
      setStats(prev => ({
        ...prev,
        lastSync: lastSync || prev.lastSync,
        // Calculate success/failures for the current view
        success: data.filter(l => l.status === 'success').length,
        failures: data.filter(l => l.status === 'failure').length,
      }));
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
  }, [conn.id, page, typeFilter, statusFilter]);

  const totalPages = Math.ceil(totalCount / pageSize);

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
                <div className={`w-2 h-2 rounded-full ${stats.failures > 3 ? 'bg-destructive' : 'bg-emerald-500 animate-pulse'}`} />
                <span className="text-xs font-medium">{stats.failures > 3 ? 'Alerta: Falhas Detectadas' : 'Operacional'}</span>
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
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Saúde (Últimos 10)</p>
              <span className="text-xs font-medium">{stats.failures} falhas encontradas</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-secondary/10 border-border/40">
        <CardHeader className="p-4 pb-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm font-bold">Logs de Eventos Real-time</CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full md:w-48">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input 
                  placeholder="Buscar logs..." 
                  className="h-8 pl-8 text-[10px]"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadLogs()}
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-8 w-[100px] text-[10px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Tipos</SelectItem>
                  <SelectItem value="lead">Leads</SelectItem>
                  <SelectItem value="message">Mensagens</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                  <SelectItem value="sync">Sincronização</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-[100px] text-[10px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Status</SelectItem>
                  <SelectItem value="success">Sucesso</SelectItem>
                  <SelectItem value="failure">Falha</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <ScrollArea className="h-[250px] w-full pr-4">
            {loading && logs.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <Clock className="w-8 h-8 opacity-20" />
                <p className="text-xs">Nenhum evento encontrado com os filtros atuais.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 p-2 rounded-lg bg-background/50 border border-border/20 text-[11px] group hover:border-primary/30 transition-colors">
                    {log.status === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold uppercase tracking-wider text-primary">
                            {log.event_type}
                          </span>
                          <Badge variant="outline" className={`text-[8px] h-4 py-0 ${log.status === 'success' ? 'text-emerald-500' : 'text-destructive'}`}>
                            {log.status}
                          </Badge>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(log.created_at), "HH:mm:ss dd/MM")}
                        </span>
                      </div>
                      {log.error_message && (
                        <div className="flex items-center gap-1.5 text-destructive font-bold mb-1">
                          <AlertTriangle className="w-3 h-3" />
                          <p>{log.error_message}</p>
                        </div>
                      )}
                      <div className="bg-black/5 p-1.5 rounded font-mono text-[9px] overflow-hidden group-hover:bg-black/10 transition-colors">
                        <code className="block truncate">{JSON.stringify(log.payload)}</code>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-2 border-t border-border/20">
              <span className="text-[10px] text-muted-foreground">
                Total: {totalCount} logs
              </span>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-7 w-7" 
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span className="text-[10px] font-medium">
                  {page + 1} / {totalPages}
                </span>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-7 w-7" 
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
