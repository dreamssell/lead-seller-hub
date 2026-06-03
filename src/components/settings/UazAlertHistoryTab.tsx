import { useState, useEffect } from 'react';
import { 
  Filter, 
  Search, 
  Download, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  Info,
  History,
  Calendar,
  ChevronLeft,
  ChevronRight,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from '@/hooks/use-toast';

export default function UazAlertHistoryTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const pageSize = 20;

  const loadLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('uaz_audit_logs')
        .select('*', { count: 'exact' });

      // Alerts are warnings or errors or high latency
      query = query.or('status.eq.error,status.eq.warning,latency_ms.gt.1000');

      if (search) {
        query = query.ilike('message', `%${search}%`);
      }

      if (statusFilter.length > 0) {
        query = query.in('status', statusFilter);
      }

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;
      setLogs(data || []);
      setTotalCount(count || 0);
    } catch (err: any) {
      toast({ title: 'Erro ao carregar alertas', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [page, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Filtrar alertas de degradação..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 h-9">
                <Filter className="w-4 h-4" /> Severidade
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filtrar Severidade</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {['error', 'warning'].map(s => (
                <DropdownMenuCheckboxItem
                  key={s}
                  checked={statusFilter.includes(s)}
                  onCheckedChange={(checked) => setStatusFilter(prev => checked ? [...prev, s] : prev.filter(x => x !== s))}
                >
                  {s.toUpperCase()}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" className="gap-2 h-9">
            <Download className="w-4 h-4" /> Exportar
          </Button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Mensagem</TableHead>
              <TableHead>Latência</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="h-48 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : logs.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground italic">Nenhuma degradação registrada.</TableCell></TableRow>
            ) : (
              logs.map(log => (
                <TableRow key={log.id} className="text-xs">
                  <TableCell className="whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</TableCell>
                  <TableCell><Badge variant="outline">{log.event_type.toUpperCase()}</Badge></TableCell>
                  <TableCell className="font-medium">{log.message}</TableCell>
                  <TableCell className={log.latency_ms > 1000 ? 'text-amber-500 font-bold' : ''}>{log.latency_ms}ms</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {log.status === 'error' ? <XCircle className="w-3 h-3 text-destructive" /> : <AlertTriangle className="w-3 h-3 text-amber-500" />}
                      <span className={log.status === 'error' ? 'text-destructive font-bold' : 'text-amber-500'}>
                        {log.status.toUpperCase()}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Total de {totalCount} registros</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}><ChevronLeft className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * pageSize >= totalCount}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  );
}
