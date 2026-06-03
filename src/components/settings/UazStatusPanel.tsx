import { useState, useEffect } from 'react';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Loader2, 
  RefreshCw, 
  XCircle,
  Zap,
  Filter,
  BarChart3,
  Settings2,
  Building,
  History
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

export default function UazStatusPanel() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [filterTenant, setFilterTenant] = useState<string>('all');
  const [filterChannel, setFilterChannel] = useState<string>('all');
  const [subCompanies, setSubCompanies] = useState<any[]>([]);
  const [queueStats, setQueueStats] = useState<any>(null);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('uaz-healthcheck', {
        body: { tenant_id: filterTenant === 'all' ? null : filterTenant, channel_type: filterChannel === 'all' ? null : filterChannel }
      });
      if (error) throw error;
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchQueue = async () => {
    setLoadingQueue(true);
    try {
      const { data: res } = await supabase.functions.invoke('uaz-queue-stats', {
        body: { tenant_id: filterTenant === 'all' ? null : filterTenant, channel_type: filterChannel === 'all' ? null : filterChannel }
      });
      if (res) setQueueStats(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingQueue(false);
    }
  };

  const fetchSubCompanies = async () => {
    const { data } = await supabase.from('sub_companies').select('id, name');
    if (data) setSubCompanies(data);
  };

  const fetchSettings = async () => {
    const { data } = await supabase.from('uaz_system_settings').select('*').eq('id', 'global').single();
    if (data) setSettings(data);
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    const { error } = await supabase.from('uaz_system_settings').update(settings).eq('id', 'global');
    if (error) toast.error('Erro ao salvar configurações');
    else toast.success('Configurações atualizadas');
    setSavingSettings(false);
  };

  useEffect(() => {
    fetchSubCompanies();
    fetchSettings();
  }, []);

  useEffect(() => {
    fetchData();
    fetchQueue();
    const interval = setInterval(() => {
      fetchData();
      fetchQueue();
    }, 60000);
    return () => clearInterval(interval);
  }, [filterTenant, filterChannel]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const isHealthy = data?.status === 'online';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-muted-foreground flex items-center justify-between">
              Status Geral
              <Badge variant="outline" className={isHealthy ? 'text-success border-success/30' : 'text-destructive border-destructive/30'}>
                {isHealthy ? 'Operacional' : data?.status === 'degraded' ? 'Degradado' : 'Offline'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isHealthy ? 'bg-success/10' : 'bg-destructive/10'}`}>
                {isHealthy ? <CheckCircle2 className="w-6 h-6 text-success" /> : <XCircle className="w-6 h-6 text-destructive" />}
              </div>
              <div>
                <p className="text-2xl font-bold">{isHealthy ? '100%' : 'Degradado'}</p>
                <p className="text-[10px] text-muted-foreground">Disponibilidade atual</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Latência Média</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                <Zap className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data?.latency_ms}ms</p>
                <p className="text-[10px] text-muted-foreground">Tempo de resposta (50 reqs)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Taxa de Falhas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-bold">{data?.failure_rate?.toFixed(1)}%</p>
                <Progress value={data?.failure_rate} className="h-1.5 mt-1" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4 bg-secondary/20 p-4 rounded-xl border border-border/40">
        <div className="flex items-center gap-2 flex-1 w-full">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Filtros de Monitoramento:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <select 
            value={filterTenant} 
            onChange={(e) => setFilterTenant(e.target.value)}
            className="flex-1 sm:w-48 bg-background border border-border/40 rounded px-3 py-1.5 text-xs font-medium outline-none"
          >
            <option value="all">Todas Empresas (Multi-tenant)</option>
            {subCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select 
            value={filterChannel} 
            onChange={(e) => setFilterChannel(e.target.value)}
            className="flex-1 sm:w-32 bg-background border border-border/40 rounded px-3 py-1.5 text-xs font-medium outline-none"
          >
            <option value="all">Todos Canais</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="voip">VoIP</option>
            <option value="video">Vídeo</option>
          </select>
        </div>
      </div>

      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold uppercase flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Tendência da Fila de Mensagens
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] w-full mt-4">
            {loadingQueue && !queueStats ? (
              <div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : queueStats?.trend?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={queueStats.trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="time" fontSize={10} tickLine={false} axisLine={false} stroke="#888888" />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="#888888" />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'rgba(23, 23, 23, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                    itemStyle={{ color: '#3b82f6' }}
                  />
                  <Line type="monotone" dataKey="pending" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground italic">Sem dados de fila para os filtros selecionados.</div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
          <Clock className="w-3 h-3" />
          Sincronizado: {new Date(data?.last_check || Date.now()).toLocaleTimeString()}
        </div>
        <Button variant="ghost" size="sm" onClick={() => { fetchData(); fetchQueue(); }} className="h-7 text-[10px] gap-2">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          RE-SINCRONIZAR
        </Button>
      </div>

      <div className="border-t border-border/40 pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold uppercase text-muted-foreground flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> Políticas de Remediação & Alertas
          </h3>
          <Button variant="ghost" size="sm" onClick={() => setShowConfig(!showConfig)}>
            {showConfig ? 'Ocultar Configuração' : 'Ajustar Parâmetros'}
          </Button>
        </div>

        {showConfig && settings && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2">
            <div className="glass-card p-4 space-y-4">
              <h4 className="text-[10px] font-bold uppercase text-primary mb-2">Prazos e Persistência</h4>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Tempo de Persistência do Alerta (minutos)</Label>
                  <Input 
                    type="number" 
                    value={settings.alert_persistence_minutes} 
                    onChange={e => setSettings({...settings, alert_persistence_minutes: parseInt(e.target.value)})}
                    className="h-8 text-xs"
                  />
                  <p className="text-[9px] text-muted-foreground italic">Quanto tempo o problema deve persistir antes de disparar alerta crítico.</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Intervalo de Remediação Automática (minutos)</Label>
                  <Input 
                    type="number" 
                    value={settings.remediation_interval_minutes} 
                    onChange={e => setSettings({...settings, remediation_interval_minutes: parseInt(e.target.value)})}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="glass-card p-4 space-y-4">
              <h4 className="text-[10px] font-bold uppercase text-primary mb-2">Políticas por Canal</h4>
              <div className="space-y-3">
                {Object.entries(settings.remediation_policy_per_channel || {}).map(([channel, policy]) => (
                  <div key={channel} className="flex items-center justify-between gap-4">
                    <Label className="text-xs capitalize">{channel}</Label>
                    <select 
                      value={policy as string}
                      onChange={e => setSettings({
                        ...settings, 
                        remediation_policy_per_channel: {
                          ...settings.remediation_policy_per_channel,
                          [channel]: e.target.value
                        }
                      })}
                      className="bg-background border border-border/40 rounded px-2 py-1 text-xs outline-none"
                    >
                      <option value="alert_only">Apenas Alerta</option>
                      <option value="retry_queue">Reenfileirar Mensagens</option>
                      <option value="restart_worker">Reiniciar Worker</option>
                      <option value="all">Todas as Ações</option>
                    </select>
                  </div>
                ))}
              </div>
              <div className="pt-2">
                <Button className="w-full h-8 text-xs" onClick={saveSettings} disabled={savingSettings}>
                  {savingSettings ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <CheckCircle2 className="w-3 h-3 mr-2" />}
                  Salvar Configurações
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
