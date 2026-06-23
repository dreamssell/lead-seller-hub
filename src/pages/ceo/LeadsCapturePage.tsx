import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CeoFilterBar, CeoFilters, periodStart, PERIOD_LABELS } from '@/components/ceo/CeoFilterBar';
import { TopRanking } from '@/components/ceo/TopRanking';
import { supabase } from '@/integrations/supabase/client';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';
import { Inbox, CheckCircle2, TrendingUp, Globe, Link as LinkIcon } from 'lucide-react';

const SOURCE_GROUPS: Record<string, RegExp> = {
  Holmes: /holmes/i,
  DealerSpace: /dealer[\s_-]?space/i,
};

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

function classify(source?: string | null) {
  if (!source) return 'Outros';
  for (const [k, re] of Object.entries(SOURCE_GROUPS)) if (re.test(source)) return k;
  return source;
}

function Kpi({ icon: Icon, label, value, hint }: any) {
  return (
    <Card className="glass-card">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
            <p className="text-2xl font-bold mt-1.5">{value}</p>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </div>
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary"><Icon className="w-5 h-5" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LeadsCapturePage() {
  const [filters, setFilters] = useState<CeoFilters>({ period: '30d', subCompanyId: 'all', collaboratorId: 'all' });
  const [leads, setLeads] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [sourceTab, setSourceTab] = useState<'all' | 'Holmes' | 'DealerSpace' | 'Outros'>('all');

  useEffect(() => {
    (async () => {
      const [l, p] = await Promise.all([
        supabase.from('leads').select('*'),
        supabase.from('profiles').select('user_id,display_name'),
      ]);
      setLeads((l.data as any) || []);
      setProfiles((p.data as any) || []);
    })();
  }, []);

  const profileName = (uid?: string | null) =>
    !uid ? '—' : (profiles.find(p => p.user_id === uid)?.display_name || uid.slice(0, 8) + '…');

  const filtered = useMemo(() => {
    const start = periodStart(filters.period);
    return leads.filter(l => {
      if (start && new Date(l.created_at) < start) return false;
      if (filters.subCompanyId !== 'all' && l.sub_company_id !== filters.subCompanyId) return false;
      const owner = l.assigned_to || l.created_by;
      if (filters.collaboratorId !== 'all' && owner !== filters.collaboratorId) return false;
      if (sourceTab !== 'all' && classify(l.source) !== sourceTab) return false;
      return true;
    });
  }, [leads, filters, sourceTab]);

  const won = filtered.filter(l => l.status === 'ganho');
  const closed = filtered.filter(l => ['ganho', 'perdido'].includes(l.status));
  const conv = closed.length ? (won.length / closed.length) * 100 : 0;
  const revenue = won.reduce((s, l) => s + Number(l.estimated_value || 0), 0);

  const bySource = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.forEach(l => { const k = classify(l.source); m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const byDay = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.forEach(l => {
      const k = new Date(l.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      m[k] = (m[k] || 0) + 1;
    });
    return Object.entries(m).map(([day, qtd]) => ({ day, qtd })).slice(-30);
  }, [filtered]);

  const ranking = useMemo(() => {
    const m: Record<string, { id: string; total: number; ganhos: number; receita: number }> = {};
    filtered.forEach(l => {
      const uid = l.assigned_to || l.created_by;
      if (!uid) return;
      m[uid] = m[uid] || { id: uid, total: 0, ganhos: 0, receita: 0 };
      m[uid].total++;
      if (l.status === 'ganho') { m[uid].ganhos++; m[uid].receita += Number(l.estimated_value || 0); }
    });
    return Object.values(m).map(x => ({
      id: x.id,
      name: profileName(x.id),
      primary: x.total,
      primaryLabel: `${x.total} leads`,
      hint: `${x.ganhos} ganhos · R$ ${x.receita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    }));
  }, [filtered, profiles]);

  return (
    <AppLayout title="Captura de Leads" subtitle="Métricas e KPIs reais — Holmes, DealerSpace e demais canais">
      <div className="space-y-6">
        <CeoFilterBar value={filters} onChange={setFilters} />

        <Tabs value={sourceTab} onValueChange={(v) => setSourceTab(v as any)}>
          <TabsList>
            <TabsTrigger value="all"><Globe className="w-4 h-4 mr-2" />Todos os canais</TabsTrigger>
            <TabsTrigger value="Holmes"><LinkIcon className="w-4 h-4 mr-2" />Holmes</TabsTrigger>
            <TabsTrigger value="DealerSpace"><LinkIcon className="w-4 h-4 mr-2" />DealerSpace</TabsTrigger>
            <TabsTrigger value="Outros">Outros</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi icon={Inbox} label="Leads capturados" value={filtered.length} hint={`Período: ${PERIOD_LABELS[filters.period]}`} />
          <Kpi icon={CheckCircle2} label="Convertidos" value={won.length} hint={`${closed.length} fechados`} />
          <Kpi icon={TrendingUp} label="Taxa de conversão" value={`${conv.toFixed(1)}%`} />
          <Kpi icon={Globe} label="Receita gerada" value={`R$ ${revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="glass-card">
            <CardHeader><CardTitle className="text-base">Captura por canal</CardTitle><CardDescription>Distribuição entre Holmes, DealerSpace e demais fontes</CardDescription></CardHeader>
            <CardContent className="h-[300px]">
              {bySource.length === 0 ? <p className="text-sm text-muted-foreground text-center py-12">Sem dados.</p> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={bySource} dataKey="value" nameKey="name" outerRadius={100} label>
                      {bySource.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader><CardTitle className="text-base">Evolução diária</CardTitle><CardDescription>Leads capturados por dia</CardDescription></CardHeader>
            <CardContent className="h-[300px]">
              {byDay.length === 0 ? <p className="text-sm text-muted-foreground text-center py-12">Sem dados.</p> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                    <Bar dataKey="qtd" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <TopRanking title="Top 3 colaboradores em captura" description="Ranqueado por volume de leads no período" items={ranking} />

        <Card className="glass-card">
          <CardHeader><CardTitle className="text-base">Detalhamento qualitativo</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {bySource.map(s => (
                <div key={s.name} className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <span className="text-sm font-medium">{s.name}</span>
                  <Badge variant="secondary">{s.value}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
