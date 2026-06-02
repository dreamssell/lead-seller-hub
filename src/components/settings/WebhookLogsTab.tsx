import { useEffect, useState } from 'react';
import { 
  Webhook as WebhookIcon, 
  Plus, 
  Trash2, 
  Loader2, 
  Copy, 
  Check, 
  Search, 
  Calendar,
  Settings,
  ListRestart,
  Code2,
  ChevronRight,
  MoreVertical,
  Activity,
  ArrowRight,
  Database,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { motion } from 'framer-motion';

interface WebhookLog {
  id: string;
  webhook_id: string;
  event_type: string;
  url: string;
  method: string;
  headers: any;
  payload: any;
  response_status: number;
  response_body: string;
  latency_ms: number;
  created_at: string;
  direction: 'inbound' | 'outbound';
}

export default function WebhookLogsTab({ webhookId }: { webhookId: string }) {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState<string | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('webhook_logs')
      .select('*')
      .eq('webhook_id', webhookId)
      .order('created_at', { ascending: false });
    
    if (error) {
      toast({ title: 'Erro ao carregar logs', description: error.message, variant: 'destructive' });
    } else {
      setLogs((data as WebhookLog[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { loadLogs(); }, [webhookId]);

  const resendEvent = async (log: WebhookLog) => {
    setResending(log.id);
    try {
      // For outbound, we send to the external URL
      // For inbound, we send to our own edge function (re-process)
      const url = log.direction === 'inbound' 
        ? `${window.location.origin}/functions/v1/handle-inbound-webhook`
        : log.url;

      const response = await fetch(url, {
        method: log.method,
        headers: {
          ...log.headers,
          'Content-Type': 'application/json',
          'X-Webhook-Resend': 'true'
        },
        body: JSON.stringify(log.payload)
      });
      
      if (!response.ok) throw new Error(`Status ${response.status}`);
      
      toast({ title: 'Evento reenviado com sucesso!' });
      loadLogs();
    } catch (error: any) {
      toast({ title: 'Erro ao reenviar', description: error.message, variant: 'destructive' });
    } finally {
      setResending(null);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="glass-card overflow-hidden">
      <Table>
        <TableHeader className="bg-secondary/40">
          <TableRow>
            <TableHead className="w-[100px]">Tipo</TableHead>
            <TableHead>Evento</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Latência</TableHead>
            <TableHead>Data</TableHead>
            <TableHead className="text-right">Ação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map(log => (
            <TableRow key={log.id}>
              <TableCell>
                <Badge variant="outline" className="text-[10px] uppercase">
                  {log.direction || 'outbound'}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">{log.event_type}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant={log.response_status >= 200 && log.response_status < 300 ? 'default' : 'destructive'}>
                    {log.response_status}
                  </Badge>
                  {log.response_status >= 400 && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <AlertTriangle className="w-3 h-3 text-destructive" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">{log.response_body || 'Sem detalhes do erro'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-xs">{log.latency_ms}ms</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {new Date(log.created_at).toLocaleString()}
              </TableCell>
              <TableCell className="text-right">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => resendEvent(log)}
                  disabled={resending === log.id}
                  title="Reenviar este evento"
                >
                  {resending === log.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {logs.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-12 text-muted-foreground italic">
                Nenhum log encontrado para este webhook.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
