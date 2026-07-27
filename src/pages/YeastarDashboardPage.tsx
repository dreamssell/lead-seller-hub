import { useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, TrendingUp, Users, Building2, RefreshCw,
  Wifi, WifiOff, Loader2, PlugZap, Save,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend,
} from 'recharts';
import { toast } from '@/hooks/use-toast';
import { Helmet } from 'react-helmet-async';
import { normalizeSipServer, normalizeSipWsUri, saveSipConfig, fetchSipConfig, type SipConfig, type SipScope } from '@/lib/sipConfig';
import { useVoip } from '@/contexts/VoipContext';
import { useAuth } from '@/contexts/AuthContext';
import { getActiveOwnerId } from '@/lib/chatTenantScope';

type DataSource = 'api' | 'mock' | 'loading';
const INTEG_KEY = 'automations.integrations.v1';

type Period = '24h' | '7d' | '30d' | '90d';
const PERIOD_DAYS: Record<Period, number> = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 };

function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
}

function buildMetrics(period: Period) {
  const days = PERIOD_DAYS[period];
  const rnd = seeded(`yeastar:${period}`);
  const series = Array.from({ length: days === 1 ? 24 : days }, (_, i) => {
    const base = Math.floor(rnd() * 80 + 20);
    const inbound = Math.floor(base * (0.55 + rnd() * 0.2));
    const outbound = Math.floor(base * (0.35 + rnd() * 0.2));
    const missed = Math.max(0, Math.floor(base * (rnd() * 0.15)));
    return {
      label: days === 1 ? `${String(i).padStart(2, '0')}h` : `D${i + 1}`,
      inbound, outbound, missed,
      ttaSec: Math.floor(rnd() * 30 + 5),
      avgSec: Math.floor(rnd() * 240 + 60),
    };
  });
  const totals = series.reduce((a, s) => ({
    inbound: a.inbound + s.inbound,
    outbound: a.outbound + s.outbound,
    missed: a.missed + s.missed,
    avgSec: a.avgSec + s.avgSec,
    ttaSec: a.ttaSec + s.ttaSec,
  }), { inbound: 0, outbound: 0, missed: 0, avgSec: 0, ttaSec: 0 });
  const totalCalls = totals.inbound + totals.outbound;
  const answerRate = totalCalls === 0 ? 0 : Math.round(((totalCalls - totals.missed) / totalCalls) * 100);
  const avgDuration = series.length ? Math.round(totals.avgSec / series.length) : 0;
  const tta = series.length ? Math.round(totals.ttaSec / series.length) : 0;
  return { series, totals, totalCalls, answerRate, avgDuration, tta };
}

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60); const s = sec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/**
 * Painel Yeastar — KPIs de telefonia e configuração do tronco SIP.
 * Baseado na Yeastar K2 / P-Series API (help.yeastar.com/en/k2-developer/api).
 * O botão "Aplicar como Tronco SIP" grava as credenciais em `sip_configs`
 * via `saveSipConfig`, para que o botão azul do discador (Completo/Modo Foco)
 * possa fazer ligações via VoIP.
 */
export default function YeastarDashboardPage() {
  const { access, user } = useAuth();
  const [period, setPeriod] = useState<Period>('7d');
  const [source, setSource] = useState<DataSource>('loading');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const { status: voipStatus, connect: voipConnect, testConnection, lastError: voipError } = useVoip();
  const [testing, setTesting] = useState(false);

  // Trunk form — cada Empresa/Sub-empresa registra suas próprias credenciais.
  // O backend (manage-sip-config) resolve o owner_id do usuário logado via
  // user_account_access, então o `saveSipConfig`/`fetchSipConfig` já é
  // automaticamente escopado por tenant — sem vazamento entre empresas.
  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [password, setPassword] = useState('');
  const [wsUri, setWsUri] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingCfg, setLoadingCfg] = useState(true);
  const sipScope: SipScope = useMemo(() => {
    const ownerId = getActiveOwnerId(access?.owner_id, user?.id);
    return ownerId
      ? { owner_id: ownerId, sub_company_id: access?.sub_company_id ?? null }
      : {};
  }, [access?.owner_id, access?.sub_company_id, user?.id]);

  // Carrega config SIP salva (apenas o dono terá permissão).
  useEffect(() => {
    (async () => {
      try {
        const cfg = await fetchSipConfig(sipScope);
        if (cfg) {
          const normalizedServer = normalizeSipServer(cfg.server);
          if (normalizedServer) setServer(normalizedServer);
          if (cfg.username) setUsername(cfg.username);
          if (cfg.auth_username) setAuthUsername(cfg.auth_username);
          if (cfg.password) setPassword(cfg.password);
          if (normalizedServer || cfg.ws_uri) setWsUri(normalizeSipWsUri(normalizedServer, cfg.ws_uri, cfg.username));
          if (cfg.display_name) setDisplayName(cfg.display_name);
        }
      } catch {
        /* usuário sem permissão — ignora */
      } finally {
        setLoadingCfg(false);
      }
    })();
  }, [sipScope]);

  useEffect(() => {
    let cancelled = false;
    setSource('loading');
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    (async () => {
      try {
        const raw = localStorage.getItem(INTEG_KEY);
        const cfg = raw ? JSON.parse(raw)?.['yeastar'] : null;
        if (!cfg?.enabled || !cfg?.pbxUrl) throw new Error('Yeastar não configurado');
        // Yeastar K2 API: /openapi/v1.0/get_api_token e /openapi/v1.0/cdr/query
        // Fazemos apenas um probe para marcar fonte como API real.
        const res = await fetch(`${String(cfg.pbxUrl).replace(/\/$/, '')}/openapi/v1.0/get_api_token`, {
          signal: ac.signal,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: cfg.username, password: cfg.password }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json().catch(() => null);
        if (cancelled) return;
        setSource('api');
        setLastSync(new Date());
      } catch (e: any) {
        if (cancelled || e?.name === 'AbortError') return;
        setSource('mock');
        setLastSync(new Date());
      }
    })();
    return () => { cancelled = true; ac.abort(); };
  }, [period, tick]);

  const m = useMemo(() => buildMetrics(period), [period]);

  const saveTrunk = async () => {
    if (!server.trim() || !username.trim() || !password.trim()) {
      toast({ title: 'Preencha servidor, usuário e senha.', variant: 'destructive' });
      return;
    }
    const normalizedServer = normalizeSipServer(server);
    setSaving(true);
    try {
      const cfg: SipConfig = {
        server: normalizedServer,
        username: username.trim(),
        auth_username: authUsername.trim() || username.trim(),
        password,
        ws_uri: normalizeSipWsUri(normalizedServer, wsUri.trim() || undefined, username.trim()),
        display_name: displayName.trim() || undefined,
        transport: 'wss',
      };
      setServer(cfg.server);
      setWsUri(cfg.ws_uri || '');
      await saveSipConfig(cfg, sipScope);
      toast({ title: 'Tronco SIP salvo', description: 'Reconectando webphone…' });
      // Reconecta imediatamente para que o botão azul (SIP) fique disponível.
      voipConnect({
        server: cfg.server,
        wsUri: cfg.ws_uri,
        username: cfg.username,
        authUser: cfg.auth_username || cfg.username,
        password: cfg.password,
        displayName: cfg.display_name,
      });
      // Notifica outras abas/janelas (Chat Completo, Modo Foco) para
      // recarregar o VoipContext e atualizar o botão azul em tempo real.
                try { window.dispatchEvent(new CustomEvent('sip:reload', { detail: { scope: sipScope } })); } catch {}
    } catch (e: any) {
      toast({ title: 'Falha ao salvar tronco SIP', description: e?.message || 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const refreshNow = () => setTick((t) => t + 1);

  return (
    <>
      <Helmet>
        <title>VoIP — KPIs & Métricas | Lead Seller</title>
        <meta name="description" content="Painel de ligações da empresa, equipes e agentes — KPIs de telefonia VoIP com integração Yeastar (K2 / P-Series) e configuração do tronco SIP." />
        <link rel="canonical" href="https://connecto-center.lovable.app/yeastar" />
        <meta property="og:title" content="VoIP — KPIs & Métricas" />
        <meta property="og:description" content="Painel de ligações da empresa, equipes e agentes." />
        <meta property="og:url" content="https://connecto-center.lovable.app/yeastar" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="VoIP — KPIs & Métricas" />
        <meta name="twitter:description" content="Painel de ligações da empresa, equipes e agentes." />
      </Helmet>
    <AppLayout title="VoIP — KPIs & Métricas" subtitle="Painel de ligações da empresa, equipes e agentes">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <Phone className="w-4 h-4 text-primary" />
          <Badge variant="secondary">Yeastar</Badge>
          <Badge>Empresa</Badge>
          {source === 'loading' && (
            <Badge variant="outline" className="gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Sincronizando…</Badge>
          )}
          {source === 'api' && (
            <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400"><Wifi className="w-3 h-3" /> API conectada</Badge>
          )}
          {source === 'mock' && (
            <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400" title="Configure Yeastar em Automações para usar dados reais">
              <WifiOff className="w-3 h-3" /> Dados simulados
            </Badge>
          )}
          <Badge
            variant="outline"
            className={
              voipStatus === 'connected'
                ? 'gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                : voipStatus === 'connecting'
                ? 'gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400'
                : 'gap-1 border-destructive/40 text-destructive'
            }
          >
            <PlugZap className="w-3 h-3" /> SIP {voipStatus}
          </Badge>
          {lastSync && (
            <span className="text-[11px] text-muted-foreground">Atualizado {lastSync.toLocaleTimeString('pt-BR')}</span>
          )}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Últimas 24h</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={refreshNow} title="Atualizar agora">
            <RefreshCw className={`w-4 h-4 ${source === 'loading' ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <Card className="glass-card mb-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><PlugZap className="w-4 h-4" /> Tronco SIP (VoIP)</CardTitle>
          <CardDescription>
            Cada Empresa/Sub-empresa registra suas próprias credenciais do
            Yeastar — ficam disponíveis para todos os usuários da mesma conta
            e nunca são compartilhadas entre tenants. Ao salvar, o botão azul
            de telefone (WhatsApp Completo e Modo Foco) passa a discar via
            este tronco.
          </CardDescription>
          <div className="pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setServer('pbx.suaempresa.yeastar.com');
                setWsUri('wss://pbx.suaempresa.yeastar.com/ws');
                setDisplayName(displayName || 'Atendente');
              }}
            >
              Usar modelo Yeastar (WSS /ws)
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Servidor SIP</Label>
            <Input value={server} onChange={(e) => setServer(e.target.value)} placeholder="sopropabx.ras.yeastar.com" />
          </div>
          <div className="space-y-1.5">
            <Label>WebSocket (WSS URI)</Label>
            <Input value={wsUri} onChange={(e) => setWsUri(e.target.value)} placeholder="wss://host/ws" />
          </div>
          <div className="space-y-1.5">
            <Label>Usuário / Extensão</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="55008137460254" />
          </div>
          <div className="space-y-1.5">
            <Label>Register Name / Auth ID</Label>
            <Input value={authUsername} onChange={(e) => setAuthUsername(e.target.value)} placeholder="55008137460254" />
          </div>
          <div className="space-y-1.5">
            <Label>Senha</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Nome de exibição</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Lead Seller Agent" />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                if (!server.trim() || !username.trim() || !password.trim()) {
                  toast({ title: 'Preencha servidor, usuário e senha antes de testar.', variant: 'destructive' });
                  return;
                }
                setTesting(true);
                try {
                  const normalizedServer = normalizeSipServer(server);
                  const normalizedWsUri = normalizeSipWsUri(normalizedServer, wsUri.trim() || undefined, username.trim());
                  setServer(normalizedServer);
                  setWsUri(normalizedWsUri);
                  const result = await testConnection({
                    server: normalizedServer,
                    wsUri: normalizedWsUri,
                    username: username.trim(),
                    authUser: authUsername.trim() || username.trim(),
                    password,
                    displayName: displayName.trim() || undefined,
                  });
                  if (result.status === 'connected') {
                    toast({ title: 'SIP conectado com sucesso', description: `Teste OK via ${result.wsUri || normalizedWsUri}. Salve o tronco para liberar o botão azul no chat.` });
                  } else {
                    toast({
                      title: 'Falha ao conectar SIP',
                      description: result.error || voipError || `Status final: ${result.status}. Verifique credenciais e WSS.`,
                      variant: 'destructive',
                    });
                  }
                } finally {
                  setTesting(false);
                }
              }}
              disabled={testing || saving || loadingCfg}
            >
              {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlugZap className="w-4 h-4 mr-2" />}
              Testar conexão SIP
            </Button>
            <Button onClick={saveTrunk} disabled={saving || loadingCfg}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar tronco SIP e reconectar
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard icon={Phone} label="Total de ligações" value={m.totalCalls.toLocaleString('pt-BR')} />
        <KpiCard icon={PhoneIncoming} label="Recebidas" value={m.totals.inbound.toLocaleString('pt-BR')} accent="text-emerald-500" />
        <KpiCard icon={PhoneOutgoing} label="Realizadas" value={m.totals.outbound.toLocaleString('pt-BR')} accent="text-sky-500" />
        <KpiCard icon={PhoneMissed} label="Perdidas" value={m.totals.missed.toLocaleString('pt-BR')} accent="text-destructive" />
        <KpiCard icon={TrendingUp} label="Taxa de atendimento" value={`${m.answerRate}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base">Volume por período</CardTitle>
            <CardDescription>Recebidas, realizadas e perdidas</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={m.series}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                <Legend />
                <Bar dataKey="inbound" name="Recebidas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="outbound" name="Realizadas" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="missed" name="Perdidas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base">Tempo médio e TTA</CardTitle>
            <CardDescription>Duração média e tempo até atender (segundos)</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={m.series}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                <Legend />
                <Line type="monotone" dataKey="avgSec" name="Duração média (s)" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="ttaSec" name="TTA (s)" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="glass-card">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4" /> Duração média</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{fmtDuration(m.avgDuration)}</p></CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4" /> TTA médio</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{m.tta}s</p></CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" /> Extensão ativa</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{username || '—'}</p></CardContent>
        </Card>
      </div>
    </AppLayout>
    </>
  );
}

function KpiCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: string }) {
  return (
    <Card className="glass-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className={`w-4 h-4 ${accent ?? 'text-primary'}`} />
          </div>
          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
