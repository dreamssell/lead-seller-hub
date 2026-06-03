import { useEffect, useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, Loader2, Plug, RefreshCw, ShieldCheck, XCircle, History, Activity, Zap, Clock, LineChart as LineChartIcon, AlertTriangle, Settings } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import UazAuditTab from '@/components/settings/UazAuditTab';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

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
  const [metrics, setMetrics] = useState<{ sessions?: number; latency?: number; lastSync?: string } | null>(null);
  const [latencyHistory, setLatencyHistory] = useState<any[]>([]);
  const [latencyPeriod, setLatencyPeriod] = useState<'24h' | '7d' | '30d'>('24h');
  const [loadingHistory, setLoadingHistory] = useState(false);

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

  useEffect(() => {
    if (conn.provider === 'uaz' && conn.status === 'connected') {
      const loadMetrics = async () => {
        const { data } = await supabase
          .from('uaz_audit_logs')
          .select('latency_ms, created_at')
          .order('created_at', { ascending: false })
          .limit(10);
        
        if (data && data.length > 0) {
          const avgLatency = Math.round(data.reduce((acc, curr) => acc + (curr.latency_ms || 0), 0) / data.length);
          setMetrics({
            sessions: 1, // UAZ usually 1 session per instance token
            latency: avgLatency,
            lastSync: data[0].created_at
          });
        }
      };
      loadMetrics();
    }
  }, [conn.status, conn.provider]);

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

                <div className="flex items-center gap-4 px-3 py-2 bg-secondary/10 rounded-lg border border-border/40">
                  <div className="flex items-center gap-2 flex-1">
                    <Settings className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Alerta de Latência:</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input 
                      type="number" 
                      value={latencyThreshold} 
                      onChange={(e) => updateThreshold(Number(e.target.value))}
                      className="w-20 h-7 text-xs px-2"
                    />
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">ms</span>
                  </div>
                </div>
              </>
            )}

            <div className="bg-secondary/20 p-3 rounded-xl border border-border/40">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <LineChartIcon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Histórico de Latência</span>
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
