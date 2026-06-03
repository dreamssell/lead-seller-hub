import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, Loader2, Plug, RefreshCw, ShieldCheck, XCircle, History, Activity, Zap, Clock, LineChart as LineChartIcon, AlertTriangle, Settings, ChevronLeft, ChevronRight, MessageCircle, BarChart3, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import UazAuditTab from '@/components/settings/UazAuditTab';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';

type Provider = 'uaz' | 'meta';
type Status = 'disconnected' | 'connecting' | 'connected' | 'error';

interface Connection {
  id: string;
  provider: Provider;
  display_name: string;
  phone_number: string | null;
  status: Status;
  last_checked_at: string | null;
  last_error: string | null;
  metadata: Record<string, any>;
}

const PROVIDER_DEFAULTS: Record<Provider, { url: string; tokenLabel: string; extraLabel?: string; description: string; docs: string }> = {
  uaz: {
    url: 'https://api.uazapi.dev',
    tokenLabel: 'Token da Instância',
    description: 'Conexão via UAZ API — ideal para WhatsApp não oficial com QR Code.',
    docs: 'https://docs.uazapi.com',
  },
  meta: {
    url: 'https://graph.facebook.com/v21.0',
    tokenLabel: 'Access Token',
    extraLabel: 'Phone Number ID',
    description: 'Integração oficial via Meta Cloud API (WhatsApp Business Platform).',
    docs: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
  },
};

function statusBadge(status: Status) {
  const map: Record<Status, { label: string; cls: string; icon: any }> = {
    connected: { label: 'Conectado', cls: 'text-success border-success/30', icon: CheckCircle2 },
    connecting: { label: 'Conectando...', cls: 'text-primary border-primary/30', icon: Loader2 },
    error: { label: 'Erro', cls: 'text-destructive border-destructive/30', icon: XCircle },
    disconnected: { label: 'Desconectado', cls: 'text-muted-foreground border-border', icon: Plug },
  };
  const { label, cls, icon: Icon } = map[status];
  return (
    <Badge variant="outline" className={cls}>
      <Icon className={`w-3 h-3 mr-1 ${status === 'connecting' ? 'animate-spin' : ''}`} />
      {label}
    </Badge>
  );
}

function ConnectionCard({ conn, onSaved }: { conn: Connection; onSaved: () => void }) {
  const defaults = PROVIDER_DEFAULTS[conn.provider];
  const [url, setUrl] = useState<string>(conn.metadata?.url ?? defaults.url);
  const [token, setToken] = useState<string>(conn.metadata?.token ?? '');
  const [extra, setExtra] = useState<string>(conn.metadata?.phone_number_id ?? '');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [metrics, setMetrics] = useState<{ sessions?: number; latency?: number; lastSync?: string; failures?: number; lastAttempt?: string }>({});
  const [latencyHistory, setLatencyHistory] = useState<any[]>([]);
  const [latencyPeriod, setLatencyPeriod] = useState<'24h' | '7d' | '30d'>('24h');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [latencyThreshold, setLatencyThreshold] = useState<number>(conn.metadata?.latency_threshold ?? 500);
  const [globalThreshold, setGlobalThreshold] = useState<number>(500);
  const [systemSettings, setSystemSettings] = useState<any>(null);
  const [lastSendAttempt, setLastSendAttempt] = useState<any>(null);
  const [queueStats, setQueueStats] = useState<{ current_queue: number; trend: any[] }>({ current_queue: 0, trend: [] });
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [alertsPage, setAlertsPage] = useState(0);
  const [totalAlerts, setTotalAlerts] = useState(0);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [filterTenant, setFilterTenant] = useState<string>('all');
  const [filterChannel, setFilterChannel] = useState<string>('whatsapp');
  const [subCompanies, setSubCompanies] = useState<any[]>([]);
  const [resendingLast, setResendingLast] = useState(false);

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
    if (data) setQueueStats(data);
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

      const lastSend = filtered.find(l => l.event_type === 'send_message');
      if (lastSend) setLastSendAttempt(lastSend);
    }
  };

  const loadAlerts = async () => {
    setLoadingAlerts(true);
    const { data, count } = await supabase
      .from('uaz_audit_logs')
      .select('*', { count: 'exact' })
      .or(`status.eq.error,latency_ms.gt.${latencyThreshold}`)
      .order('created_at', { ascending: false })
      .range(alertsPage * 5, (alertsPage + 1) * 5 - 1);
    
    const filteredAlerts = data?.filter(l => {
      const payload = l.payload as any;
      const matchesTenant = filterTenant === 'all' || payload?.tenant_id === filterTenant || payload?.sub_company_id === filterTenant;
      const matchesChannel = filterChannel === 'all' || l.event_type.toLowerCase().startsWith(filterChannel.toLowerCase());
      return matchesTenant && matchesChannel;
    }) || [];

    setAlerts(filteredAlerts);
    setTotalAlerts(count || 0);
    setLoadingAlerts(false);
  };

  const loadSettings = async () => {
    const { data } = await supabase.from('uaz_system_settings').select('*').eq('id', 'global').single();
    if (data) {
      setGlobalThreshold(data.alert_threshold_latency);
      setSystemSettings(data);
    }
  };

  const loadSubCompanies = async () => {
    const { data } = await supabase.from('sub_companies').select('id, name');
    if (data) setSubCompanies(data);
  };

  useEffect(() => {
    if (conn.provider === 'uaz' && conn.status === 'connected') {
      loadHistory();
      loadQueue();
      loadMetrics();
      loadAlerts();
      loadSettings();
      loadSubCompanies();
    }
  }, [conn.status, conn.provider, latencyPeriod, filterTenant, filterChannel, alertsPage]);

  const updateThreshold = async (val: number) => {
    setLatencyThreshold(val);
    await supabase.from('whatsapp_connections').update({ metadata: { ...(conn.metadata ?? {}), latency_threshold: val } }).eq('id', conn.id);
  };

  const handleSave = async () => {
    setSaving(true);
    const metadata = { ...(conn.metadata ?? {}), url, token, ...(conn.provider === 'meta' && { phone_number_id: extra }) };
    const { error } = await supabase.from('whatsapp_connections').update({ metadata }).eq('id', conn.id);
    setSaving(false);
    if (error) toast.error('Erro ao salvar', { description: error.message });
    else { toast.success('Configuração salva'); onSaved(); }
  };

  const handleTest = async () => {
    setTesting(true);
    const { data, error } = await supabase.functions.invoke('whatsapp-status', { 
      body: { provider: conn.provider, url, token, ...(conn.provider === 'meta' && { phone_number_id: extra }) } 
    });
    setTesting(false);
    if (error) toast.error('Falha ao testar', { description: error.message });
    else if (data?.error) toast.error('Conexão falhou', { description: data.error });
    else if (data?.connected) toast.success('Conectado!', { description: data.phone ?? '' });
    else toast.warning('Provedor respondeu, mas não está conectado');
    onSaved();
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              {conn.provider === 'meta' ? <ShieldCheck className="w-5 h-5 text-primary" /> : <Plug className="w-5 h-5 text-primary" />}
              {conn.display_name}
            </CardTitle>
            <CardDescription className="mt-1">{defaults.description}</CardDescription>
          </div>
          {statusBadge(conn.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {conn.provider === 'uaz' && conn.status === 'connected' && (
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
                <span className="text-xs font-bold text-foreground uppercase">Configurações & Diagnóstico</span>
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
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">Fila de Mensagens</span>
                      <div className="flex gap-2">
                        <select value={filterTenant} onChange={(e) => setFilterTenant(e.target.value)} className="bg-background border border-border/40 rounded px-2 py-0.5 text-[9px] font-bold">
                          <option value="all">Todas Empresas</option>
                          {subCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <select value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)} className="bg-background border border-border/40 rounded px-2 py-0.5 text-[9px] font-bold">
                          <option value="whatsapp">WhatsApp</option>
                          <option value="voip">VoIP</option>
                          <option value="video">Vídeo</option>
                        </select>
                      </div>
                    </div>
                    <div className="h-[100px] w-full">
                      {loadingQueue ? <Loader2 className="w-4 h-4 animate-spin m-auto" /> : (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={queueStats.trend}>
                            <XAxis dataKey="time" fontSize={8} hide />
                            <YAxis fontSize={8} hide />
                            <Line type="monotone" dataKey="pending" stroke="#3b82f6" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  <div className="bg-secondary/20 p-3 rounded-xl border border-border/40">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">Latência Histórica</span>
                      <div className="flex gap-1">
                        {(['24h', '7d', '30d'] as const).map(p => (
                          <Button key={p} variant={latencyPeriod === p ? 'default' : 'ghost'} size="sm" className="h-5 px-1.5 text-[8px]" onClick={() => setLatencyPeriod(p)}>{p.toUpperCase()}</Button>
                        ))}
                      </div>
                    </div>
                    <div className="h-[100px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={latencyHistory}>
                          <Line type="monotone" dataKey="latency" stroke="#10b981" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label>URL da API</Label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={defaults.url} />
        </div>
        <div className="space-y-2">
          <Label>{defaults.tokenLabel}</Label>
          <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Token" />
        </div>
        <Separator />
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Salvar</Button>
          <Button variant="outline" onClick={handleTest} disabled={testing}>{testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Testar</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function WhatsAppPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase.from('whatsapp_connections').select('*').order('provider');
    if (data) setConnections(data as Connection[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <AppLayout title="WhatsApp Business" subtitle="Integração UAZ e Meta">
      <Tabs defaultValue="connections" className="space-y-6">
        <TabsList><TabsTrigger value="connections">Conexões</TabsTrigger><TabsTrigger value="audit">Auditoria</TabsTrigger></TabsList>
        <TabsContent value="connections">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {connections.map(c => <ConnectionCard key={c.id} conn={c} onSaved={load} />)}
          </div>
        </TabsContent>
        <TabsContent value="audit"><UazAuditTab /></TabsContent>
      </Tabs>
    </AppLayout>
  );
}
