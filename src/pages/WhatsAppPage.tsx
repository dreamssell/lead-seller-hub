import { useEffect, useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, Loader2, Plug, RefreshCw, ShieldCheck, XCircle, History, Activity, Zap, Clock, LineChart as LineChartIcon, AlertTriangle, Settings, ChevronLeft, ChevronRight, MessageCircle, BarChart3 } from 'lucide-react';
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
  const [metrics, setMetrics] = useState<{ sessions?: number; latency?: number; lastSync?: string; failures?: number; lastAttempt?: string }>({
    failures: 0
  });
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

  useEffect(() => {
    if (conn.provider === 'uaz' && conn.status === 'connected') {
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
          const formatted = data.map(d => ({
            time: new Date(d.created_at).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit',
              ...(latencyPeriod !== '24h' && { day: '2-digit', month: '2-digit' })
            }),
            latency: d.latency_ms
          }));
          setLatencyHistory(formatted);
        }
        setLoadingHistory(false);
      };
      loadHistory();
    }
  }, [conn.status, conn.provider, latencyPeriod]);

  const [resendingLast, setResendingLast] = useState(false);

  useEffect(() => {
    if (conn.provider === 'uaz' && conn.status === 'connected') {
      const loadMetrics = async () => {
        const { data: recentLogs } = await supabase
          .from('uaz_audit_logs')
          .select('latency_ms, created_at, status, event_type, response, message')
          .order('created_at', { ascending: false })
          .limit(20);
        
        if (recentLogs && recentLogs.length > 0) {
          const successes = recentLogs.filter(l => l.status === 'success');
          const avgLatency = successes.length > 0 
            ? Math.round(successes.reduce((acc, curr) => acc + (curr.latency_ms || 0), 0) / successes.length)
            : 0;
            
          const failuresCount = recentLogs.filter(l => l.status === 'error').length;

          setMetrics({
            sessions: 1,
            latency: avgLatency,
            lastSync: successes[0]?.created_at,
            failures: failuresCount,
            lastAttempt: recentLogs[0]?.created_at
          });

          const lastSend = recentLogs.find(l => l.event_type === 'send_message');
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
        
        setAlerts(data || []);
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

      const loadQueue = async () => {
        setLoadingQueue(true);
        const queryParams = new URLSearchParams();
        if (filterTenant !== 'all') queryParams.append('tenant_id', filterTenant);
        if (filterChannel !== 'all') queryParams.append('channel_type', filterChannel);
        
        const { data } = await supabase.functions.invoke('uaz-queue-stats', {
          method: 'GET',
          headers: { 'x-url-search': queryParams.toString() } // Custom header or just append to path if invoke supports it
        });
        // Actually invoke doesn't take URL params easily in the first arg, we usually just pass in body or headers
        // Let's retry with body for easier handling in the function if needed, or just append to path if using raw fetch
        const { data: data2 } = await supabase.functions.invoke('uaz-queue-stats', {
          body: { tenant_id: filterTenant === 'all' ? null : filterTenant, channel_type: filterChannel === 'all' ? null : filterChannel }
        });
        if (data2) setQueueStats(data2);
        setLoadingQueue(false);
      };

      loadMetrics();
      loadAlerts();
      loadSettings();
      loadSubCompanies();
      loadQueue();

      const handleManualResend = async () => {
        if (!lastSendAttempt || lastSendAttempt.status !== 'error') return;
        setResendingLast(true);
        try {
          const { data, error } = await supabase.functions.invoke('uaz-send-message', {
            body: {
              customer_id: lastSendAttempt.payload?.customer_id,
              content: lastSendAttempt.payload?.content,
              client_msg_id: lastSendAttempt.payload?.client_msg_id || `manual-retry-${lastSendAttempt.id}`
            }
          });
          if (error) throw error;
          toast.success('Mensagem reenviada com sucesso');
          loadMetrics();
        } catch (err: any) {
          toast.error('Erro ao reenviar', { description: err.message });
        } finally {
          setResendingLast(false);
        }
      };

      loadMetrics();
      loadAlerts();
      loadSettings();
      loadQueue();
      
      const channel = supabase
        .channel(`uaz_metrics_${conn.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'uaz_audit_logs' }, () => {
          loadMetrics();
          loadAlerts();
        })
        .subscribe();
        
      return () => { supabase.removeChannel(channel); };
    }
  }, [conn.status, conn.provider, alertsPage, latencyThreshold]);

  const updateThreshold = async (val: number) => {
    setLatencyThreshold(val);
    const metadata = { ...(conn.metadata ?? {}), latency_threshold: val };
    await supabase.from('whatsapp_connections').update({ metadata }).eq('id', conn.id);
  };

  const handleSave = async () => {
    setSaving(true);
    const metadata: Record<string, any> = { ...(conn.metadata ?? {}), url, token };
    if (conn.provider === 'meta') metadata.phone_number_id = extra;
    const { error } = await supabase
      .from('whatsapp_connections')
      .update({ metadata })
      .eq('id', conn.id);
    setSaving(false);
    if (error) {
      toast.error('Erro ao salvar', { description: error.message });
      return;
    }
    toast.success('Configuração salva');
    onSaved();
  };

  const handleTest = async () => {
    setTesting(true);
    const payload: Record<string, any> = { provider: conn.provider, url, token };
    if (conn.provider === 'meta') payload.phone_number_id = extra;
    const { data, error } = await supabase.functions.invoke('whatsapp-status', { body: payload });
    setTesting(false);
    if (error) {
      toast.error('Falha ao testar', { description: error.message });
    } else if (data?.error) {
      toast.error('Conexão falhou', { description: data.error });
    } else if (data?.connected) {
      toast.success('Conectado!', { description: data.phone ?? '' });
    } else {
      toast.warning('Provedor respondeu, mas não está conectado');
    }
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
            {metrics && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-secondary/30 p-2 rounded-lg border border-border/40">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Activity className="w-3 h-3 text-primary" />
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">Sessões</span>
                    </div>
                    <p className="text-sm font-bold">{metrics.sessions}</p>
                  </div>
                  <div className={`p-2 rounded-lg border transition-colors ${
                    (metrics.latency || 0) > latencyThreshold ? 'bg-destructive/10 border-destructive/40' : 'bg-secondary/30 border-border/40'
                  }`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Zap className={`w-3 h-3 ${ (metrics.latency || 0) > latencyThreshold ? 'text-destructive' : 'text-amber-500' }`} />
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">Latência</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-bold ${ (metrics.latency || 0) > latencyThreshold ? 'text-destructive' : '' }`}>
                        {metrics.latency}ms
                      </p>
                      {(metrics.latency || 0) > latencyThreshold && (
                        <AlertTriangle className="w-3 h-3 text-destructive animate-pulse" />
                      )}
                    </div>
                  </div>
                  <div className="bg-secondary/30 p-2 rounded-lg border border-border/40">
                    <div className="flex items-center gap-1.5 mb-1">
                      <XCircle className={`w-3 h-3 ${ (metrics.failures || 0) > 0 ? 'text-destructive' : 'text-muted-foreground' }`} />
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">Falhas (20)</span>
                    </div>
                    <p className={`text-sm font-bold ${ (metrics.failures || 0) > 0 ? 'text-destructive' : '' }`}>
                      {metrics.failures}
                    </p>
                  </div>
                  <div className="bg-secondary/30 p-2 rounded-lg border border-border/40">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Clock className="w-3 h-3 text-emerald-500" />
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">Última Sync</span>
                    </div>
                    <p className="text-sm font-bold truncate">
                      {metrics.lastSync ? new Date(metrics.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Settings className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs font-bold text-foreground uppercase tracking-wider">Configurações & Diagnóstico</span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => setShowSettings(!showSettings)}>
                      {showSettings ? 'Ocultar' : 'Ver Detalhes'}
                    </Button>
                  </div>

                  {showSettings && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3 border-t border-border/40 pt-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Limite por Canal (ms)</Label>
                          <div className="flex items-center gap-2">
                            <Input 
                              type="number" 
                              value={latencyThreshold} 
                              onChange={(e) => updateThreshold(Number(e.target.value))}
                              className="h-8 text-xs"
                            />
                            <Badge variant="outline" className="h-8">ms</Badge>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Limite Global (Empresa)</Label>
                          <div className="flex items-center gap-2 h-8 px-3 rounded-md bg-secondary/30 border border-border/40 text-xs font-medium">
                            {globalThreshold} ms
                          </div>
                        </div>
                      </div>

                      {systemSettings && (
                        <div className="grid grid-cols-2 gap-3 p-3 bg-secondary/10 rounded-xl border border-border/40">
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold text-muted-foreground uppercase">Backoff Multiplier</p>
                            <div className="flex items-center gap-2">
                              <Input 
                                type="number" 
                                defaultValue={systemSettings.backoff_multiplier} 
                                onBlur={async (e) => {
                                  const val = Number(e.target.value);
                                  await supabase.from('uaz_system_settings').update({ backoff_multiplier: val }).eq('id', 'global');
                                  toast.success('Backoff atualizado');
                                }}
                                className="h-6 w-16 text-[10px] px-1"
                              />
                              <span className="text-[10px] font-mono">x</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold text-muted-foreground uppercase">Janela Idempotência</p>
                            <div className="flex items-center gap-2">
                              <Input 
                                type="number" 
                                defaultValue={systemSettings.idempotency_window_minutes} 
                                onBlur={async (e) => {
                                  const val = Number(e.target.value);
                                  await supabase.from('uaz_system_settings').update({ idempotency_window_minutes: val }).eq('id', 'global');
                                  toast.success('Janela atualizada');
                                }}
                                className="h-6 w-16 text-[10px] px-1"
                              />
                              <span className="text-[10px] font-mono">min</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold text-muted-foreground uppercase">Limite Incidentes</p>
                            <div className="flex items-center gap-2">
                              <Input 
                                type="number" 
                                defaultValue={systemSettings.incident_threshold_retries} 
                                onBlur={async (e) => {
                                  const val = Number(e.target.value);
                                  await supabase.from('uaz_system_settings').update({ incident_threshold_retries: val }).eq('id', 'global');
                                  toast.success('Limite atualizado');
                                }}
                                className="h-6 w-16 text-[10px] px-1 border-destructive/30"
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold text-muted-foreground uppercase">Retentativas Base</p>
                            <div className="flex items-center gap-2">
                              <Input 
                                type="number" 
                                defaultValue={systemSettings.backoff_max_retries} 
                                onBlur={async (e) => {
                                  const val = Number(e.target.value);
                                  await supabase.from('uaz_system_settings').update({ backoff_max_retries: val }).eq('id', 'global');
                                  toast.success('Retentativas atualizadas');
                                }}
                                className="h-6 w-16 text-[10px] px-1"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {lastSendAttempt && (
                        <div className="bg-secondary/10 p-3 rounded-xl border border-border/40 space-y-2">
                          <div className="flex items-center gap-2 mb-1">
                            <MessageCircle className="w-3.5 h-3.5 text-primary" />
                            <span className="text-[10px] font-bold text-foreground uppercase">Última Tentativa de Envio</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div>
                              <p className="text-muted-foreground uppercase font-bold">Status</p>
                              <div className="flex items-center gap-1 mt-0.5">
                                {lastSendAttempt.status === 'success' ? <CheckCircle2 className="w-3 h-3 text-success" /> : <XCircle className="w-3 h-3 text-destructive" />}
                                <span className={lastSendAttempt.status === 'success' ? 'text-success' : 'text-destructive font-bold'}>
                                  {lastSendAttempt.status.toUpperCase()}
                                </span>
                              </div>
                            </div>
                            <div>
                              <p className="text-muted-foreground uppercase font-bold">Data/Hora</p>
                              <p className="mt-0.5 font-medium">{new Date(lastSendAttempt.created_at).toLocaleString('pt-BR')}</p>
                            </div>
                          </div>
                          {lastSendAttempt.status === 'error' && (
                            <div className="mt-2 space-y-2">
                              <div className="p-2 bg-destructive/5 rounded-lg border border-destructive/20">
                                <p className="text-[10px] text-destructive font-medium leading-relaxed">
                                  {lastSendAttempt.message || (typeof lastSendAttempt.response === 'string' ? lastSendAttempt.response : JSON.stringify(lastSendAttempt.response))}
                                </p>
                              </div>
                              <div className="bg-background/40 p-2 rounded-lg border border-border/20">
                                <p className="text-[8px] font-bold text-muted-foreground uppercase mb-1 flex items-center gap-1">
                                  <Zap className="w-2.5 h-2.5" /> Payload Enviado
                                </p>
                                <pre className="text-[9px] font-mono text-muted-foreground overflow-auto max-h-20 leading-tight">
                                  {JSON.stringify({
                                    url: lastSendAttempt.payload?.url || 'https://api.uazapi.dev',
                                    headers: { Authorization: 'Bearer [TOKEN_HIDDEN]', 'Content-Type': 'application/json' },
                                    body: {
                                      customer_id: lastSendAttempt.payload?.customer_id,
                                      content: lastSendAttempt.payload?.content,
                                      client_msg_id: lastSendAttempt.payload?.client_msg_id
                                    }
                                  }, null, 2)}
                                </pre>
                              </div>

                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="w-full h-8 text-[10px] gap-2 border-destructive/30 hover:bg-destructive/10 text-destructive font-bold"
                                onClick={() => {
                                  if (lastSendAttempt.payload?.customer_id && lastSendAttempt.payload?.content) {
                                    const retry = async () => {
                                      setResendingLast(true);
                                      try {
                                        const { error } = await supabase.functions.invoke('uaz-send-message', {
                                          body: {
                                            customer_id: lastSendAttempt.payload.customer_id,
                                            content: lastSendAttempt.payload.content,
                                            client_msg_id: `manual-retry-${lastSendAttempt.id}`
                                          }
                                        });
                                        if (error) throw error;
                                        toast.success('Reenvio solicitado com sucesso');
                                      } catch (e: any) {
                                        toast.error('Falha no reenvio', { description: e.message });
                                      } finally {
                                        setResendingLast(false);
                                      }
                                    };
                                    retry();
                                  }
                                }}
                                disabled={resendingLast}
                              >
                                {resendingLast ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                REENVIAR AGORA
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-[10px] font-bold text-foreground uppercase">Histórico de Alertas</span>
                          </div>
                          <p className="text-[9px] text-muted-foreground uppercase font-bold">{totalAlerts} Alertas</p>
                        </div>
                        <div className="bg-background/50 rounded-xl border border-border/20 overflow-hidden">
                          {loadingAlerts ? (
                            <div className="p-8 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                          ) : alerts.length > 0 ? (
                            <div className="divide-y divide-border/20">
                              {alerts.map(alert => (
                                <div key={alert.id} className="p-2.5 hover:bg-secondary/20 transition-colors">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-[10px] font-medium truncate">{alert.message || 'Alerta de degradação'}</p>
                                      <div className="flex items-center gap-2 mt-1">
                                        <Badge variant="outline" className={`text-[8px] h-4 py-0 ${alert.status === 'error' ? 'text-destructive' : 'text-amber-500'}`}>
                                          {alert.event_type.toUpperCase()}
                                        </Badge>
                                        <span className="text-[9px] text-muted-foreground">
                                          {new Date(alert.created_at).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <p className="text-[10px] font-bold">{alert.latency_ms}ms</p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-8 text-center text-[10px] text-muted-foreground italic">Nenhum alerta recente.</div>
                          )}
                        </div>
                        {totalAlerts > 5 && (
                          <div className="flex items-center justify-center gap-2 pt-1">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setAlertsPage(p => Math.max(0, p - 1))} disabled={alertsPage === 0}>
                              <ChevronLeft className="w-3 h-3" />
                            </Button>
                            <span className="text-[9px] font-bold tabular-nums">{alertsPage + 1} / {Math.ceil(totalAlerts / 5)}</span>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setAlertsPage(p => p + 1)} disabled={alertsPage >= Math.ceil(totalAlerts / 5) - 1}>
                              <ChevronRight className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="bg-secondary/20 p-3 rounded-xl border border-border/40">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Fila de Mensagens (Erros/Pendentes)</span>
                    </div>
                    <Badge variant="outline" className="text-[9px] h-4 py-0 border-primary/30 text-primary">LIVE</Badge>
                  </div>
                  <div className="h-[80px] w-full">
                    {loadingQueue ? (
                      <div className="h-full flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                    ) : queueStats.trend.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={queueStats.trend}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="time" fontSize={7} tickLine={false} axisLine={false} stroke="#888888" />
                          <YAxis fontSize={7} tickLine={false} axisLine={false} stroke="#888888" />
                          <RechartsTooltip 
                            contentStyle={{ backgroundColor: 'rgba(23, 23, 23, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '9px' }}
                            itemStyle={{ color: '#3b82f6' }}
                          />
                          <Line type="stepAfter" dataKey="pending" stroke="#3b82f6" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-[10px] text-muted-foreground italic">Sem dados de fila.</div>
                    )}
                  </div>
                </div>

                <div className="bg-secondary/20 p-3 rounded-xl border border-border/40">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Fila de Mensagens (Erros/Pendentes)</span>
                    </div>
                    <Badge variant="outline" className="text-[9px] h-4 py-0 border-primary/30 text-primary">LIVE</Badge>
                  </div>
                  <div className="h-[80px] w-full">
                    {loadingQueue ? (
                      <div className="h-full flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                    ) : queueStats.trend.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={queueStats.trend}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="time" fontSize={7} tickLine={false} axisLine={false} stroke="#888888" />
                          <YAxis fontSize={7} tickLine={false} axisLine={false} stroke="#888888" />
                          <RechartsTooltip 
                            contentStyle={{ backgroundColor: 'rgba(23, 23, 23, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '9px' }}
                            itemStyle={{ color: '#3b82f6' }}
                          />
                          <Line type="stepAfter" dataKey="pending" stroke="#3b82f6" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-[10px] text-muted-foreground italic">Sem dados de fila.</div>
                    )}
                  </div>
                </div>

                <div className="bg-secondary/20 p-3 rounded-xl border border-border/40">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <LineChartIcon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Desempenho da Rede</span>
                    </div>
                    <div className="flex bg-background/50 p-0.5 rounded-md border border-border/40">
                      {(['24h', '7d', '30d'] as const).map((p) => (
                        <button
                          key={p}
                          onClick={() => setLatencyPeriod(p)}
                          className={`px-2 py-0.5 text-[9px] font-bold rounded transition-all ${
                            latencyPeriod === p 
                              ? 'bg-primary text-primary-foreground shadow-sm' 
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {p.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="h-[120px] w-full">
                    {loadingHistory ? (
                      <div className="h-full flex items-center justify-center">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : latencyHistory.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={latencyHistory}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis 
                            dataKey="time" 
                            fontSize={8} 
                            tickLine={false} 
                            axisLine={false} 
                            stroke="#888888"
                            interval="preserveStartEnd"
                            minTickGap={20}
                          />
                          <YAxis 
                            fontSize={8} 
                            tickLine={false} 
                            axisLine={false} 
                            stroke="#888888"
                            tickFormatter={(v) => `${v}ms`}
                          />
                          <RechartsTooltip 
                            contentStyle={{ 
                              backgroundColor: 'rgba(23, 23, 23, 0.95)', 
                              border: '1px solid rgba(255,255,255,0.1)',
                              borderRadius: '8px',
                              fontSize: '10px'
                            }}
                            itemStyle={{ color: '#10b981' }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="latency" 
                            stroke="#10b981" 
                            strokeWidth={2} 
                            dot={false}
                            activeDot={{ r: 4, fill: '#10b981' }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-[10px] text-muted-foreground italic">
                        Sem dados de latência no período.
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor={`${conn.id}-url`}>URL da API</Label>
          <Input id={`${conn.id}-url`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder={defaults.url} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${conn.id}-token`}>{defaults.tokenLabel}</Label>
          <Input id={`${conn.id}-token`} type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Cole o token do cliente" />
        </div>
        {conn.provider === 'meta' && (
          <div className="space-y-2">
            <Label htmlFor={`${conn.id}-extra`}>{defaults.extraLabel}</Label>
            <Input id={`${conn.id}-extra`} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Ex: 123456789012345" />
          </div>
        )}

        <Separator />

        <div className="text-xs text-muted-foreground space-y-1">
          {conn.phone_number && <p>📱 Número: <span className="font-medium text-foreground">{conn.phone_number}</span></p>}
          {conn.last_checked_at && <p>🕒 Última verificação: {new Date(conn.last_checked_at).toLocaleString('pt-BR')}</p>}
          {conn.last_error && <p className="text-destructive">⚠️ {conn.last_error}</p>}
          <a href={defaults.docs} target="_blank" rel="noreferrer" className="text-primary hover:underline">Ver documentação →</a>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar configuração
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={testing}>
            {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Testar conexão
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function WhatsAppPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data, error } = await supabase
      .from('whatsapp_connections')
      .select('*')
      .order('provider');
    if (error) {
      toast.error('Erro ao carregar conexões', { description: error.message });
    } else {
      setConnections((data ?? []) as Connection[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <AppLayout title="WhatsApp Business" subtitle="Escolha o provedor e configure a integração por cliente">
      <Tabs defaultValue="connections" className="space-y-6">
        <TabsList className="bg-secondary/40 border border-border/40 p-1">
          <TabsTrigger value="connections" className="gap-2">
            <Plug className="w-4 h-4" />
            Conexões
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <History className="w-4 h-4" />
            Auditoria UAZ
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connections">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Carregando...
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {connections.map((c) => (
                <ConnectionCard key={c.id} conn={c} onSaved={load} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="audit">
          <UazAuditTab />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
