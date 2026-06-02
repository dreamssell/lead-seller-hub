import { useEffect, useState } from 'react';
import { 
  User, 
  Clock, 
  History,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';

interface AuditLog {
  id: string;
  action: string;
  changed_by: string;
  changes: any;
  created_at: string;
  profiles?: {
    display_name: string;
    email: string;
  };
}

export default function WebhookAuditTab({ webhookId }: { webhookId: string }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAudit = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('audit_logs')
        .select(`
          *,
          profiles:changed_by (display_name, email)
        `)
        .eq('record_id', webhookId)
        .eq('table_name', 'webhooks')
        .order('created_at', { ascending: false });
      
      if (error) {
        toast({ title: 'Erro ao carregar auditoria', description: error.message, variant: 'destructive' });
      } else {
        setLogs((data as AuditLog[]) ?? []);
      }
      setLoading(false);
    };

    loadAudit();
  }, [webhookId]);

  if (loading) return <div className="flex justify-center py-12">Carregando auditoria...</div>;

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-4">
        <History className="w-5 h-5 text-primary" />
        <h3 className="font-bold">Trilha de Auditoria</h3>
      </div>
      
      {logs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground italic">Nenhuma alteração registrada.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map(log => (
              <TableRow key={log.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5" />
                    <div>
                      <p className="text-sm font-medium">{log.profiles?.display_name || 'Desconhecido'}</p>
                      <p className="text-[10px] text-muted-foreground">{log.profiles?.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">{log.action}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(log.created_at).toLocaleString()}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
