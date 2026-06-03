import { useState, useEffect } from 'react';
import { 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Loader2, 
  Search, 
  Filter,
  History,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  User,
  MoreHorizontal
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';

export default function UazRemediationTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 15;

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data, count, error } = await supabase
        .from('uaz_audit_logs')
        .select('*, customers(name, phone)')
        .eq('event_type', 'remediation')
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;
      setLogs(data || []);
      setTotalCount(count || 0);
    } catch (err: any) {
      toast({ title: 'Erro ao carregar auditoria', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [page]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase text-muted-foreground flex items-center gap-2">
          <History className="w-4 h-4" /> Trilha de Remediação
        </h3>
        <p className="text-[10px] font-bold text-muted-foreground uppercase">{totalCount} Eventos</p>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader className="bg-secondary/20">
            <TableRow>
              <TableHead className="w-[180px]">Data/Hora</TableHead>
              <TableHead>Mensagem</TableHead>
              <TableHead>Ações</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="h-48 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : logs.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground italic">Nenhuma remediação executada.</TableCell></TableRow>
            ) : (
              logs.map(log => (
                <TableRow key={log.id} className="text-xs">
                  <TableCell className="whitespace-nowrap font-medium">{new Date(log.created_at).toLocaleString('pt-BR')}</TableCell>
                  <TableCell>{log.message}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {log.response?.remediations?.map((r: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-[9px] h-4 py-0 font-mono">{r}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={log.status === 'success' ? 'outline' : 'destructive'} className={log.status === 'success' ? 'text-success border-success/30' : ''}>
                      {log.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}><ChevronLeft className="w-4 h-4" /></Button>
        <span className="text-[10px] font-bold px-4">Página {page + 1}</span>
        <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * pageSize >= totalCount}><ChevronRight className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}
