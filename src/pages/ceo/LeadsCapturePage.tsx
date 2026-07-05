import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CeoFilterBar, PERIOD_LABELS } from '@/components/ceo/CeoFilterBar';
import { useCeoFilters } from '@/hooks/useCeoFilters';
import { periodStart } from '@/components/ceo/CeoFilterBar';
import { TopRanking } from '@/components/ceo/TopRanking';
import { supabase } from '@/integrations/supabase/client';
import { downloadCsv, downloadPdf } from '@/lib/ceoExport';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';
import { Inbox, CheckCircle2, TrendingUp, Globe, Link as LinkIcon, Download, FileText } from 'lucide-react';
import { LeadsDetailDialog } from '@/components/ceo/LeadsDetailDialog';

const SOURCE_GROUPS: Record<string, RegExp> = {
  Holmes: /holmes/i,
  DealerSpace: /dealer[\s_-]?space/i,
};

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

function classify(source?: string | null) {
  if (!source) return 'Sem origem';
  for (const [k, re] of Object.entries(SOURCE_GROUPS)) if (re.test(source)) return k;
  return source;
}

function Kpi({ icon: Icon, label, value, hint, onClick }: any) {
  const interactive = !!onClick;
  return (
    <Card
      className={`glass-card ${interactive ? 'cursor-pointer hover:border-primary/50 hover:shadow-lg transition' : ''}`}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
            <p className="text-2xl font-bold mt-1.5">{value}</p>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
            {interactive && <p className="text-[10px] text-primary mt-1.5 font-medium">Clique para ver detalhes →</p>}
          </div>
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary"><Icon className="w-5 h-5" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LeadsCapturePage() {
  const { filters, setFilters, setExtra } = useCeoFilters({ period: '30d' }, { src: 'all' });
  const sourceTab = filters.src as string;
  const setSourceTab = (v: string) => setExtra({ src: v });
  const [leads, setLeads] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  

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

  const exportRows = () => filtered.map(l => ({
    nome: l.name, email: l.email || '', telefone: l.phone || '', canal: l.channel || '',
    origem: l.source || '', categoria: classify(l.source), status: l.status,
    valor_estimado: Number(l.estimated_value || 0), responsavel: profileName(l.assigned_to || l.created_by),
    criado_em: new Date(l.created_at).toLocaleString('pt-BR'),
  }));
  const kpisExport = [
    { label: 'Leads', value: filtered.length },
    { label: 'Convertidos', value: won.length },
    { label: 'Taxa de conversão', value: `${conv.toFixed(1)}%` },
    { label: 'Receita', value: `R$ ${revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
  ];

  return (
    <AppLayout title="Captura de Leads" subtitle="Métricas e KPIs reais — Holmes, DealerSpace e demais canais">
      <div className="space-y-6">
        <CeoFilterBar value={filters} onChange={setFilters} extraRight={
          <>
            <Button variant="outline" size="sm" onClick={() => downloadCsv(`leads-${Date.now()}.csv`, exportRows())}><Download className="w-4 h-4 mr-1" />CSV</Button>
            <Button variant="outline" size="sm" onClick={() => downloadPdf(`leads-${Date.now()}.pdf`, 'Captura de Leads', `Período: ${PERIOD_LABELS[filters.period]}`, kpisExport, exportRows())}><FileText className="w-4 h-4 mr-1" />PDF</Button>
          </>
        } />


        {(() => {
          const builtIn = ['Holmes', 'DealerSpace'];
          const dynamic = Array.from(new Set(leads.map(l => classify(l.source)).filter(c => !builtIn.includes(c)))).sort();
          const all = [...builtIn, ...dynamic];
          return (
            <Tabs value={sourceTab} onValueChange={(v) => setSourceTab(v)}>
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="all"><Globe className="w-4 h-4 mr-2" />Todos os canais</TabsTrigger>
                {all.map(c => (
                  <TabsTrigger key={c} value={c}><LinkIcon className="w-4 h-4 mr-2" />{c}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          );
        })()}

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
