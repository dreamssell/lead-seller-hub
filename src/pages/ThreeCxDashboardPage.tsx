import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, TrendingUp, Users, Building2, RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend,
} from 'recharts';

type Period = '24h' | '7d' | '30d' | '90d';
type Scope = { kind: 'company' } | { kind: 'team'; id: string } | { kind: 'agent'; id: string };

const TEAMS = [
  { id: 't1', name: 'Comercial' },
  { id: 't2', name: 'Suporte' },
  { id: 't3', name: 'Pós-venda' },
];

const AGENTS = [
  { id: 'a1', name: 'Ana Souza', teamId: 't1' },
  { id: 'a2', name: 'Bruno Lima', teamId: 't1' },
  { id: 'a3', name: 'Carla Dias', teamId: 't2' },
  { id: 'a4', name: 'Diego Rocha', teamId: 't2' },
  { id: 'a5', name: 'Eduarda Melo', teamId: 't3' },
];

const PERIOD_DAYS: Record<Period, number> = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 };

// Deterministic pseudo-random based on string seed
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
}

function buildMetrics(period: Period, scope: Scope) {
  const days = PERIOD_DAYS[period];
  const seedKey = `${period}:${scope.kind}:${'id' in scope ? scope.id : 'all'}`;
  const rnd = seeded(seedKey);
  const mult = scope.kind === 'company' ? 1 : scope.kind === 'team' ? 0.35 : 0.12;

  const series = Array.from({ length: days === 1 ? 24 : days }, (_, i) => {
    const base = Math.floor((rnd() * 80 + 20) * mult);
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

  const totals = series.reduce((acc, s) => ({
    inbound: acc.inbound + s.inbound,
    outbound: acc.outbound + s.outbound,
    missed: acc.missed + s.missed,
    avgSec: acc.avgSec + s.avgSec,
    ttaSec: acc.ttaSec + s.ttaSec,
  }), { inbound: 0, outbound: 0, missed: 0, avgSec: 0, ttaSec: 0 });

  const totalCalls = totals.inbound + totals.outbound;
  const answerRate = totalCalls === 0 ? 0 : Math.round(((totalCalls - totals.missed) / totalCalls) * 100);
  const avgDuration = series.length ? Math.round(totals.avgSec / series.length) : 0;
  const tta = series.length ? Math.round(totals.ttaSec / series.length) : 0;

  const leaderboard = AGENTS.map((a) => {
    const r = seeded(`${seedKey}:${a.id}`);
    const calls = Math.floor(r() * 90 + 10);
    const ans = Math.min(100, Math.floor(70 + r() * 30));
    return { id: a.id, name: a.name, team: TEAMS.find(t => t.id === a.teamId)!.name, calls, ans };
  }).sort((x, y) => y.calls - x.calls);

  return { series, totals, totalCalls, answerRate, avgDuration, tta, leaderboard };
}

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60); const s = sec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export default function ThreeCxDashboardPage() {
  const [period, setPeriod] = useState<Period>('7d');
  const [scopeKey, setScopeKey] = useState<string>('company');

  const scope: Scope = useMemo(() => {
    if (scopeKey === 'company') return { kind: 'company' };
    if (scopeKey.startsWith('team:')) return { kind: 'team', id: scopeKey.slice(5) };
    return { kind: 'agent', id: scopeKey.slice(6) };
  }, [scopeKey]);

  const m = useMemo(() => buildMetrics(period, scope), [period, scope]);

  const scopeLabel = scope.kind === 'company'
    ? 'Empresa'
    : scope.kind === 'team'
      ? TEAMS.find(t => t.id === scope.id)?.name ?? 'Equipe'
      : AGENTS.find(a => a.id === scope.id)?.name ?? 'Agente';

  return (
    <AppLayout title="3CX — KPIs & Métricas" subtitle="Painel de ligações da empresa, equipes e agentes">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-primary" />
          <Badge variant="secondary">3CX</Badge>
          <Badge>{scopeLabel}</Badge>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Select value={scopeKey} onValueChange={setScopeKey}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="company"><span className="inline-flex items-center gap-2"><Building2 className="w-4 h-4" /> Empresa (todos)</span></SelectItem>
              {TEAMS.map(t => (
                <SelectItem key={t.id} value={`team:${t.id}`}>Equipe — {t.name}</SelectItem>
              ))}
              {AGENTS.map(a => (
                <SelectItem key={a.id} value={`agent:${a.id}`}>Agente — {a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Últimas 24h</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => setScopeKey((k) => k)} title="Atualizar">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

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
            <CardDescription>Duração média da chamada e tempo até atender (segundos)</CardDescription>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4" /> Duração média</CardTitle>
          </CardHeader>
          <CardContent><p className="text-3xl font-bold">{fmtDuration(m.avgDuration)}</p></CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Tempo até atender (TTA)</CardTitle>
          </CardHeader>
          <CardContent><p className="text-3xl font-bold">{m.tta}s</p></CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" /> Agentes ativos</CardTitle>
          </CardHeader>
          <CardContent><p className="text-3xl font-bold">{AGENTS.length}</p></CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">Ranking de agentes</CardTitle>
          <CardDescription>Ligações no período selecionado</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {m.leaderboard.map((row, idx) => (
              <div key={row.id} className="flex items-center gap-3 py-2">
                <div className="w-6 text-xs font-mono text-muted-foreground">{idx + 1}</div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">{row.team}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{row.calls}</p>
                  <p className="text-xs text-muted-foreground">{row.ans}% atend.</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </AppLayout>
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
        </div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
