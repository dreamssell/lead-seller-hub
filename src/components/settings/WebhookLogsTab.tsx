import { useEffect, useState } from 'react';
import { 
  Webhook as WebhookIcon, 
  Loader2, 
  Search, 
  Calendar,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Filter,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Download,
  FileJson,
  FileSpreadsheet
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from 'framer-motion';

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
  retry_count?: number;
  status?: string;
  error_message?: string;
  timeout_limit?: number;
  request_id?: string;
  idempotency_key?: string;
  is_idempotent_hit?: boolean;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export default function WebhookLogsTab({ webhookId }: { webhookId: string }) {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  
  // Filtering & Pagination state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | '2xx' | '4xx' | '5xx' | '409' | 'error'>('all');
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [dateFilter, setDateFilter] = useState<{ from: string; to: string }>({ from: '', to: '' });



  const loadLogs = async () => {
    setLoading(true);
    try {
      const query = applyFilters(supabase.from('webhook_logs').select('*', { count: 'exact' }));

      const { data, count, error } = await query
        .order('created_at', { ascending: sortOrder === 'asc' })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      
      if (error) throw error;

      setLogs((data as WebhookLog[]) ?? []);
      setTotalCount(count ?? 0);
    } catch (error: any) {
      toast({ title: 'Erro ao carregar logs', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    loadLogs(); 
  }, [webhookId, page, pageSize, statusFilter, onlyDuplicates, sortOrder, dateFilter]);


  // Handle search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(0);
      loadLogs();
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const applyFilters = (query: any) => {
    let q = query.eq('webhook_id', webhookId);

    if (search) {
      q = q.or(`event_type.ilike.%${search}%,idempotency_key.ilike.%${search}%,request_id.ilike.%${search}%`);
    }

    if (statusFilter === '2xx') {
      q = q.gte('response_status', 200).lt('response_status', 300);
    } else if (statusFilter === '4xx') {
      q = q.gte('response_status', 400).lt('response_status', 500);
    } else if (statusFilter === '5xx') {
      q = q.gte('response_status', 500);
    } else if (statusFilter === '409') {
      q = q.eq('response_status', 409);
    } else if (statusFilter === 'error') {
      q = q.or('response_status.lt.200,response_status.gte.300');
    }

    if (onlyDuplicates) {
      q = q.eq('is_idempotent_hit', true);
    }


    if (dateFilter.from) {
      q = q.gte('created_at', new Date(dateFilter.from).toISOString());
    }
    if (dateFilter.to) {
      const toDate = new Date(dateFilter.to);
      toDate.setHours(23, 59, 59, 999);
      q = q.lte('created_at', toDate.toISOString());
    }
    return q;
  };

  const exportLogs = async (format: 'csv' | 'json') => {
    setExporting(true);
    setExportProgress(0);
    try {
      // 1. Obter contagem total para os filtros atuais
      const countQuery = applyFilters(supabase.from('webhook_logs').select('*', { count: 'exact', head: true }));
      const { count: filterTotal, error: countError } = await countQuery;
      
      if (countError) throw countError;
      const totalToExport = filterTotal || 0;

      if (totalToExport === 0) {
        toast({ title: 'Nenhum log para exportar', variant: 'destructive' });
        return;
      }

      // 2. Buscar em pedaços (chunks) para evitar travar a UI e o banco
      const CHUNK_SIZE = 1000;
      let allData: any[] = [];
      let from = 0;

      while (from < totalToExport) {
        const query = applyFilters(supabase.from('webhook_logs').select('*'));
        const { data, error } = await query
          .order('created_at', { ascending: false })
          .range(from, Math.min(from + CHUNK_SIZE - 1, totalToExport - 1));

        if (error) throw error;
        if (!data || data.length === 0) break;

        allData = [...allData, ...data];
        from += CHUNK_SIZE;
        setExportProgress(Math.min(100, Math.round((allData.length / totalToExport) * 100)));
      }

      const filename = `webhook_logs_${webhookId}_${new Date().toISOString().split('T')[0]}`;
      
      if (format === 'json') {
        const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.json`;
        a.click();
      } else {
        const headers = ['ID', 'Event', 'Status', 'Latency', 'Date', 'URL', 'Request ID', 'Idempotency Key', 'Is Hit', 'Error'];
        const rows = allData.map(log => [
          log.id,
          log.event_type,
          log.response_status,
          log.latency_ms,
          new Date(log.created_at).toLocaleString(),
          log.url,
          log.request_id || '',
          log.idempotency_key || '',
          log.is_idempotent_hit ? 'Sim' : 'Não',
          log.error_message || ''
        ]);
        
        const csvContent = [
          headers.join(','),
          ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.csv`;
        a.click();
      }
      
      toast({ title: 'Exportação concluída!', description: `${allData.length} registros exportados.` });
    } catch (error: any) {
      toast({ title: 'Erro ao exportar', description: error.message, variant: 'destructive' });
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  };


  const resendEvent = async (log: WebhookLog) => {
    setResending(log.id);
    try {
      const url = log.direction === 'inbound' 
        ? `${window.location.origin}/functions/v1/handle-inbound-webhook`
        : log.url;

      const response = await fetch(url, {
        method: log.method,
        headers: {
          ...log.headers,
          'Content-Type': 'application/json',
          'X-Webhook-Resend': 'true',
          'X-Idempotency-Key': log.id, // Use log ID as idempotency key for resends
          'Idempotency-Key': log.id
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

  const totalPages = Math.ceil(totalCount / pageSize);

  const getStatusLabel = (status: string) => {
    switch (status) {
      case '2xx': return 'Sucesso (2xx)';
      case '4xx': return 'Erro Cliente (4xx)';
      case '5xx': return 'Erro Servidor (5xx)';
      case '409': return 'Conflito (409)';
      case 'error': return 'Todos os Erros';
      default: return 'Todos os Status';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 bg-secondary/20 p-4 rounded-xl border border-border/40">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por evento, Idempotency-Key ou Request ID..." 
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
                  {getStatusLabel(statusFilter)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Filtrar por Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem checked={statusFilter === 'all'} onCheckedChange={() => setStatusFilter('all')}>
                  Todos os Status
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={statusFilter === '2xx'} onCheckedChange={() => setStatusFilter('2xx')}>
                  Sucesso (200-299)
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={statusFilter === '4xx'} onCheckedChange={() => setStatusFilter('4xx')}>
                  Erro Cliente (400-499)
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={statusFilter === '5xx'} onCheckedChange={() => setStatusFilter('5xx')}>
                  Erro Servidor (500+)
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={statusFilter === '409'} onCheckedChange={() => setStatusFilter('409')}>
                  Conflito (409)
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={statusFilter === 'error'} onCheckedChange={() => setStatusFilter('error')}>
                  Qualquer Erro
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button 
              variant={onlyDuplicates ? "default" : "outline"}
              size="sm" 
              className="gap-2 h-9"
              onClick={() => setOnlyDuplicates(!onlyDuplicates)}
            >
              <RotateCcw className={`w-4 h-4 ${onlyDuplicates ? 'animate-spin-once' : ''}`} />
              Somente Duplicatas
            </Button>


          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2 h-9"
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
          >
            <ArrowUpDown className="w-4 h-4" />
            {sortOrder === 'desc' ? 'Mais recentes' : 'Mais antigos'}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 h-9">
                <Calendar className="w-4 h-4" />
                Datas
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="p-4 w-72 space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">De:</label>
                <Input 
                  type="date" 
                  value={dateFilter.from} 
                  onChange={(e) => setDateFilter(prev => ({ ...prev, from: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Até:</label>
                <Input 
                  type="date" 
                  value={dateFilter.to} 
                  onChange={(e) => setDateFilter(prev => ({ ...prev, to: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full h-7 text-[10px]"
                onClick={() => setDateFilter({ from: '', to: '' })}
              >
                Limpar Período
              </Button>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 h-9 border-primary/20 hover:border-primary/40 text-primary min-w-[100px]" disabled={exporting}>
                {exporting ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-[10px] tabular-nums">{exportProgress}%</span>
                  </div>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Exportar
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportLogs('csv')} className="gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                CSV (Planilha)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportLogs('json')} className="gap-2">
                <FileJson className="w-4 h-4 text-blue-500" />
                JSON (Raw)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px]">Exportar Filtrados</DropdownMenuLabel>
              <DropdownMenuItem 
                onClick={async () => exportLogs('csv')} 
                className="gap-2"
              >
                <FileSpreadsheet className="w-4 h-4 text-amber-500" />
                CSV (Com filtros atuais)
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={async () => exportLogs('json')} 
                className="gap-2"
              >
                <FileJson className="w-4 h-4 text-amber-500" />
                JSON (Com filtros atuais)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>


      <div className="glass-card overflow-hidden border-border/40">
        <Table>
          <TableHeader className="bg-secondary/40">
            <TableRow>
              <TableHead>Evento</TableHead>
              <TableHead>Status / Tentativas</TableHead>
              <TableHead>Latência</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence mode="wait">
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-48">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Carregando logs...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground italic">
                    Nenhum log encontrado para os filtros selecionados.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map(log => (
                  <motion.tr 
                    key={log.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="group hover:bg-secondary/10 transition-colors"
                  >
                    <TableCell className="font-mono text-xs">
                      <div className="flex flex-col gap-1">
                        <span>{log.event_type}</span>
                        {log.request_id && (
                          <div className="flex items-center gap-1 opacity-50 text-[9px] uppercase tracking-tighter">
                            <span className="bg-primary/20 text-primary px-1 rounded-sm">REQ ID</span>
                            <span className="truncate max-w-[80px]" title={log.request_id}>{log.request_id.split('-')[0]}</span>
                          </div>
                        )}
                        {log.idempotency_key && (
                          <div className="flex items-center gap-1 opacity-50 text-[9px] uppercase tracking-tighter">
                            <span className="bg-amber-500/20 text-amber-600 px-1 rounded-sm">IDEM POT</span>
                            <span className="truncate max-w-[80px]" title={log.idempotency_key}>{log.idempotency_key.split('-')[0]}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={log.response_status >= 200 && log.response_status < 300 ? 'default' : 'destructive'}
                            className="font-mono text-[10px]"
                          >
                            {log.response_status === 0 ? 'FAIL' : (log.response_status === 408 ? 'T-OUT' : log.response_status)}
                          </Badge>
                          
                          {log.is_idempotent_hit && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="text-[9px] bg-blue-500/10 text-blue-600 border-blue-500/20 cursor-help">
                                    <RotateCcw className="w-2.5 h-2.5 mr-1" /> DUPLICATA (IGNORADO)
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs p-3">
                                  <div className="space-y-2">
                                    <p className="font-bold text-xs border-b border-border/40 pb-1">Resumo da Idempotência</p>
                                    <div className="space-y-1">
                                      <p className="text-[10px]"><strong>Chave:</strong> {log.idempotency_key}</p>
                                      <p className="text-[10px]"><strong>Motivo:</strong> Requisição idêntica já processada com sucesso no endpoint.</p>
                                      <p className="text-[10px]"><strong>Status Original:</strong> {log.response_status}</p>
                                      <p className="text-[10px] text-muted-foreground italic">Este log reflete o cache do processamento original para evitar duplicidade de efeitos colaterais.</p>
                                    </div>
                                  </div>
                                </TooltipContent>

                              </Tooltip>
                            </TooltipProvider>
                          )}
                          
                          {log.status === 'pending_retry' && (
                            <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/20 animate-pulse">
                              <RotateCcw className="w-2.5 h-2.5 mr-1" /> Reenviando
                            </Badge>
                          )}

                          {log.response_status === 408 && (
                            <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-600 border-red-500/20">
                              TIMEOUT ({log.timeout_limit}s)
                            </Badge>
                          )}

                          {log.retry_count && log.retry_count > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              ({log.retry_count}ª tentativa)
                            </span>
                          )}
                        </div>

                        {(log.response_status >= 400 || log.response_status === 0) ? (
                          <div className="flex items-center gap-1.5">
                            <AlertTriangle className="w-3 h-3 text-destructive/60" />
                            <span className="text-[10px] text-destructive/70 truncate max-w-[200px]">
                              {log.response_status === 408 
                                ? `Limite de ${log.timeout_limit}s excedido (Duração: ${(log.latency_ms/1000).toFixed(1)}s)` 
                                : (log.error_message || log.response_body || 'Erro na entrega')}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className={log.latency_ms > 1000 ? 'text-amber-500' : 'text-emerald-500'}>
                        {log.latency_ms}ms
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(log.created_at).toLocaleString('pt-BR')}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => resendEvent(log)}
                        disabled={resending === log.id}
                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        {resending === log.id ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <RotateCcw className="w-4 h-4" />}
                      </Button>
                    </TableCell>
                  </motion.tr>
                ))
              )}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>

      {totalCount > 0 && (
        <div className="flex items-center justify-between px-2 py-4 border-t border-border/40">
          <div className="flex items-center gap-4">
            <p className="text-xs text-muted-foreground whitespace-nowrap">
              Mostrando <b>{page * pageSize + 1}</b> a <b>{Math.min((page + 1) * pageSize, totalCount)}</b> de <b>{totalCount}</b> logs
            </p>
            
            <div className="flex items-center gap-2 ml-4 border-l pl-4 border-border/40">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Por página:</span>
              <div className="flex items-center gap-1">
                {PAGE_SIZE_OPTIONS.map(size => (
                  <Button
                    key={size}
                    variant={pageSize === size ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 px-2 text-[10px]"
                    onClick={() => {
                      setPageSize(size);
                      setPage(0);
                    }}
                  >
                    {size}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
            </Button>
            <div className="flex items-center gap-1">
              {[...Array(Math.min(5, totalPages))].map((_, i) => {
                let pageNum = i;
                if (totalPages > 5 && page > 2) {
                  pageNum = page - 2 + i;
                  if (pageNum >= totalPages) pageNum = totalPages - 5 + i;
                }
                if (pageNum < 0) return null;
                
                return (
                  <Button
                    key={pageNum}
                    variant={page === pageNum ? 'default' : 'ghost'}
                    size="sm"
                    className="w-8 h-8 p-0"
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum + 1}
                  </Button>
                );
              })}
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              Próximo <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}