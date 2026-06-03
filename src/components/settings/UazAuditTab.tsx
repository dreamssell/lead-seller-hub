import { useState, useEffect } from 'react';
import { 
  History, 
  Loader2, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  Info,
  ChevronLeft,
  ChevronRight,
  Filter
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuCheckboxItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';

export default function UazAuditTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(15);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('uaz_audit_logs')
        .select('*', { count: 'exact' });

      if (search) {
        query = query.ilike('message', `%${search}%`);
      }
      
      if (statusFilter.length > 0) {
        query = query.in('status', statusFilter);
      }

      if (typeFilter.length > 0) {
        query = query.in('event_type', typeFilter);
      }

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;
      setLogs(data || []);
      setTotalCount(count || 0);
    } catch (err: any) {
      toast({ title: 'Erro ao carregar logs', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadLogs();
    }, 300);
    return () => clearTimeout(timer);
  }, [page, search, statusFilter, typeFilter]);

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 bg-secondary/20 p-4 rounded-xl border border-border/40">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Filtrar por mensagem de auditoria..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background/50 border-none shadow-none h-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 h-9">
                  <Filter className="w-4 h-4" />
                  Status
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Filtrar por Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {['success', 'error', 'warning'].map(s => (
                  <DropdownMenuCheckboxItem
                    key={s}
                    checked={statusFilter.includes(s)}
                    onCheckedChange={(checked) => {
                      setStatusFilter(prev => checked ? [...prev, s] : prev.filter(x => x !== s));
                    }}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 h-9">
                  <History className="w-4 h-4" />
                  Tipo
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Filtrar por Evento</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {['auth', 'webhook', 'send_message', 'status_check'].map(t => (
                  <DropdownMenuCheckboxItem
                    key={t}
                    checked={typeFilter.includes(t)}
                    onCheckedChange={(checked) => {
                      setTypeFilter(prev => checked ? [...prev, t] : prev.filter(x => x !== t));
                    }}
                  >
                    {t.replace('_', ' ').charAt(0).toUpperCase() + t.replace('_', ' ').slice(1)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="glass-card overflow-hidden border-border/40">
        <Table>
          <TableHeader className="bg-secondary/40">
            <TableRow>
              <TableHead>Evento</TableHead>
              <TableHead>Mensagem</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Latência</TableHead>
              <TableHead>Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-48 text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground italic">
                  Nenhum log de auditoria encontrado.
                </TableCell>
              </TableRow>
            ) : (
              logs.map(log => (
                <TableRow key={log.id} className="text-xs">
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[10px] uppercase">
                      {log.event_type.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md truncate font-medium">
                    {log.message}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {log.status === 'success' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                      ) : log.status === 'error' ? (
                        <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                      ) : (
                        <Info className="w-3.5 h-3.5 text-amber-500" />
                      )}
                      <span className={log.status === 'error' ? 'text-destructive font-semibold' : ''}>
                        {log.status.toUpperCase()}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {log.latency_ms ? `${log.latency_ms}ms` : '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString('pt-BR')}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 bg-secondary/10 p-2 rounded-lg">
          <p className="text-xs text-muted-foreground">
            Mostrando {logs.length} de {totalCount} logs
          </p>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(p => Math.max(0, p - 1))} 
              disabled={page === 0}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs font-medium px-3">
              Página {page + 1} de {totalPages}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} 
              disabled={page === totalPages - 1}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
