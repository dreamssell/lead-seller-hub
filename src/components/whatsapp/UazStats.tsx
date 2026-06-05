
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2, FileSpreadsheet, AlertOctagon, Activity, History, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { WhatsAppConnection } from './types';

interface UazStatsProps {
  conn: WhatsAppConnection;
  onOpenAudit: (filters?: { tenantId?: string; logId?: string }) => void;
}

export function UazStats({ conn, onOpenAudit }: UazStatsProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [metrics, setMetrics] = useState<{ sessions?: number; latency?: number; lastSync?: string; failures?: number; lastAttempt?: string }>({});
  const [latencyHistory, setLatencyHistory] = useState<any[]>([]);
  const [latencyPeriod, setLatencyPeriod] = useState<'24h' | '7d' | '30d'>('24h');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [latencyThreshold, setLatencyThreshold] = useState<number>(conn.metadata?.latency_threshold ?? 500);
  const [globalThreshold, setGlobalThreshold] = useState<number>(500);
  const [queueStats, setQueueStats] = useState<{ current_queue: number; trend: any[] }>({ current_queue: 0, trend: [] });
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [filterTenant, setFilterTenant] = useState<string>('all');
  const [filterChannel, setFilterChannel] = useState<string>('whatsapp');
  const [subCompanies, setSubCompanies] = useState<any[]>([]);
  const [drillDownOpen, setDrillDownOpen] = useState(false);
  const [drillDownLogs, setDrillDownLogs] = useState<any[]>([]);
  const [loadingDrillDown, setLoadingDrillDown] = useState(false);
  const [selectedRange, setSelectedRange] = useState<{ start: string; end: string } | null>(null);
  const [selectedDetailLog, setSelectedDetailLog] = useState<any>(null);

  const loadHistory = async () => {
    setLoadingHistory(true);
    const now = new Date();
    let fromDate = new Date();
    if (latencyPeriod === '24h') fromDate.setHours(now.getHours() - 24);
    else if (latencyPeriod === '7d') fromDate.setDate(now.getDate() - 7);
    else fromDate.setDate(now.getDate() - 30);

    const { data } = await supabase
      .from('uaz_audit_logs')
      .select('latency_ms, created_at')
      .eq('event_type', 'webhook')
      .gte('created_at', fromDate.toISOString())
      .order('created_at', { ascending: true });

    if (data) {
      setLatencyHistory(data.map(d => ({
        time: new Date(d.created_at).toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit',
          ...(latencyPeriod !== '24h' && { day: '2-digit', month: '2-digit' })
        }),
        timestamp: d.created_at,
        latency: d.latency_ms
      })));
    }
    setLoadingHistory(false);
  };

  const loadQueue = async () => {
    setLoadingQueue(true);
    const { data } = await supabase.functions.invoke('uaz-queue-stats', {
      body: { tenant_id: filterTenant === 'all' ? null : filterTenant, channel_type: filterChannel === 'all' ? null : filterChannel }
    });
    if (data) {
      setQueueStats(data);
    }
    setLoadingQueue(false);
  };

  const loadMetrics = async () => {
    const { data: recentLogs } = await supabase
      .from('uaz_audit_logs')
      .select('latency_ms, created_at, status, event_type, response, message, payload')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (recentLogs && recentLogs.length > 0) {
      const filtered = recentLogs.filter(l => {
        const payload = l.payload as any;
        const matchesTenant = filterTenant === 'all' || payload?.tenant_id === filterTenant || payload?.sub_company_id === filterTenant;
        const matchesChannel = filterChannel === 'all' || l.event_type.toLowerCase().startsWith(filterChannel.toLowerCase());
        return matchesTenant && matchesChannel;
      });

      const successes = filtered.filter(l => l.status === 'success');
      const avgLatency = successes.length > 0 
        ? Math.round(successes.reduce((acc, curr) => acc + (curr.latency_ms || 0), 0) / successes.length)
        : 0;
        
      setMetrics({
        sessions: 1,
        latency: avgLatency,
        lastSync: successes[0]?.created_at,
        failures: filtered.filter(l => l.status === 'error').length,
        lastAttempt: filtered[0]?.created_at
      });
    }
  };

  const loadSubCompanies = async () => {
    const { data } = await supabase.from('sub_companies').select('id, name');
    if (data) setSubCompanies(data);
  };

  const updateThreshold = async (val: number) => {
    setLatencyThreshold(val);
    await supabase.from('whatsapp_connections').update({ metadata: { ...(conn.metadata ?? {}), latency_threshold: val } }).eq('id', conn.id);
  };

  const handleChartClick = async (data: any) => {
    if (!data || !data.activePayload || data.activePayload.length === 0) return;
    const point = data.activePayload[0].payload;
    if (!point.timestamp) return;

    const clickedTime = new Date(point.timestamp);
    const start = new Date(clickedTime.getTime() - 15 * 60000).toISOString();
    const end = new Date(clickedTime.getTime() + 15 * 60000).toISOString();

    setSelectedRange({ start, end });
    setDrillDownOpen(true);
    setLoadingDrillDown(true);

    let query = supabase
      .from('uaz_audit_logs')
      .select('*')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false });

    if (filterTenant !== 'all') {
      query = query.or(`payload->>tenant_id.eq.${filterTenant},payload->>sub_company_id.eq.${filterTenant}`);
    }
    if (filterChannel !== 'all') {
      query = query.filter('event_type', 'ilike', `${filterChannel}%`);
    }

    const { data: logs } = await query;
    setDrillDownLogs(logs || []);
    setLoadingDrillDown(false);
  };

  const exportQueueToCSV = () => {
    if (!queueStats.trend || queueStats.trend.length === 0) {
      toast.error('Sem dados para exportar');
      return;
    }
    const headers = ['Horário', 'Timestamp', 'Mensagens Pendentes', 'Tenant', 'Canal'];
    const rows = queueStats.trend.map(point => [
      point.time,
      point.timestamp,
      point.pending,
      filterTenant === 'all' ? 'Todos' : subCompanies.find(c => c.id === filterTenant)?.name || filterTenant,
      filterChannel.toUpperCase()
    ]);
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `uaz_queue_metrics_${new Date().toISOString()}.csv`;
    link.click();
    toast.success('Métricas exportadas em CSV');
  };

  useEffect(() => {
    loadHistory();
    loadQueue();
    loadMetrics();
    loadSubCompanies();
  }, [latencyPeriod, filterTenant, filterChannel]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-secondary/30 p-2 rounded-lg border border-border/40">
          <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Sessões</p>
          <p className="text-sm font-bold">{metrics.sessions || 0}</p>
        </div>
        <div className={`p-2 rounded-lg border ${ (metrics.latency || 0) > latencyThreshold ? 'bg-destructive/10 border-destructive/40' : 'bg-secondary/30 border-border/40' }`}>
          <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Latência</p>
          <p className="text-sm font-bold">{metrics.latency || 0}ms</p>
        </div>
        <div className="bg-secondary/30 p-2 rounded-lg border border-border/40">
          <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Falhas</p>
          <p className="text-sm font-bold">{metrics.failures || 0}</p>
        </div>
        <div className="bg-secondary/30 p-2 rounded-lg border border-border/40">
          <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Última Sync</p>
          <p className="text-sm font-bold truncate">{metrics.lastSync ? new Date(metrics.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</p>
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-foreground uppercase">Métricas de Performance</span>
          <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => setShowSettings(!showSettings)}>
            {showSettings ? 'Ocultar' : 'Ver Detalhes'}
          </Button>
        </div>

        {showSettings && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 border-t border-border/40 pt-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Limite Canal (ms)</Label>
                <Input type="number" value={latencyThreshold} onChange={(e) => updateThreshold(Number(e.target.value))} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Limite Global</Label>
                <div className="h-8 flex items-center px-3 rounded-md bg-secondary/30 border border-border/40 text-xs">{globalThreshold}ms</div>
              </div>
            </div>

            <div className="bg-secondary/20 p-3 rounded-xl border border-border/40 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Fila de Mensagens</span>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={exportQueueToCSV}><FileSpreadsheet className="w-3 h-3" /></Button>
                </div>
                <div className="flex gap-2">
                  <select value={filterTenant} onChange={(e) => setFilterTenant(e.target.value)} className="bg-background border rounded px-2 py-0.5 text-[9px]">
                    <option value="all">Todas Empresas</option>
                    {subCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="h-[100px] w-full">
                {loadingQueue ? <Loader2 className="w-4 h-4 animate-spin m-auto" /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={queueStats.trend} onClick={handleChartClick} style={{ cursor: 'pointer' }}>
                      <XAxis dataKey="time" hide />
                      <YAxis hide />
                      <RechartsTooltip />
                      <Line type="monotone" dataKey="pending" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </div>

      <Dialog open={drillDownOpen} onOpenChange={setDrillDownOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Logs de Auditoria</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingDrillDown ? (
                  <TableRow><TableCell colSpan={4} className="text-center">Carregando...</TableCell></TableRow>
                ) : drillDownLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-[10px]">{new Date(log.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-[10px]">{log.event_type}</TableCell>
                    <TableCell><Badge variant={log.status === 'success' ? 'outline' : 'destructive'}>{log.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => onOpenAudit({ logId: log.id })}><Eye className="h-3 w-3" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
