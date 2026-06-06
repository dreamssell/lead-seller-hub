import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Clock, User, Globe, Info, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function VideoErrorLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('video_error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Erro ao buscar logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    
    // Inscrever para novos logs em tempo real
    const channel = supabase.channel('video_error_logs_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'video_error_logs' }, (payload) => {
        setLogs(prev => [payload.new, ...prev].slice(0, 20));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <Card className="glass-card border-red-500/20">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-lg flex items-center gap-2 text-red-500">
            <AlertCircle className="w-5 h-5" /> Diagnóstico de Falhas
          </CardTitle>
          <CardDescription>Últimos erros registrados nas videochamadas.</CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchLogs} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {logs.length === 0 && !isLoading ? (
          <div className="py-12 text-center space-y-2">
            <Info className="w-8 h-8 text-muted-foreground mx-auto opacity-20" />
            <p className="text-sm text-muted-foreground">Nenhum erro registrado recentemente.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Data/Hora</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Contexto</TableHead>
                  <TableHead>Mensagem de Erro</TableHead>
                  <TableHead className="text-right">Detalhes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id} className="group">
                    <TableCell className="text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        {format(new Date(log.created_at), 'dd/MM HH:mm:ss', { locale: ptBR })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <User className="w-3 h-3 text-muted-foreground" />
                        {log.user_name || 'Desconhecido'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {log.context}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate text-sm text-red-400 font-medium">
                      {log.error_message}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {log.browser_info?.platform && (
                          <Badge variant="secondary" className="text-[9px] bg-zinc-800">
                            {log.browser_info.platform}
                          </Badge>
                        )}
                        <Globe className="w-3 h-3 text-muted-foreground opacity-50" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
