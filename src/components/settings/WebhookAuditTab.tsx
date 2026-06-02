import { useEffect, useState } from 'react';
import { 
  User, 
  Clock, 
  History
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
import { Badge } from '@/components/ui/badge';

interface AuditLog {
  id: string;
  action: string;
  changed_by: string;
  changes: any;
  created_at: string;
  profiles?: any;
}

export default function WebhookAuditTab({ webhookId }: { webhookId: string }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAudit = async () => {
      setLoading(true);
      // We'll fetch separately if the relation is not working in PostgREST
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('record_id', webhookId)
        .eq('table_name', 'webhooks')
        .order('created_at', { ascending: false });
      
      if (error) {
        toast({ title: 'Erro ao carregar auditoria', description: error.message, variant: 'destructive' });
      } else {
        // Simple fix: just show the ID for now or fetch profiles in a second step if needed
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
                      <p className="text-sm font-medium">{log.changed_by?.split('-')[0]}</p>
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
