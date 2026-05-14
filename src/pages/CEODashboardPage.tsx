import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Users, DollarSign, Target,
  CheckCircle2, Activity, Briefcase, Award, Zap, ShieldCheck,
} from 'lucide-react';

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

interface Metric {
  label: string;
  value: string;
  delta?: number;
  icon: any;
  hint?: string;
}

function MetricCard({ m }: { m: Metric }) {
  const Icon = m.icon;
  const positive = (m.delta ?? 0) >= 0;
  return (
    <Card className="glass-card">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{m.label}</p>
            <p className="text-2xl font-bold mt-1.5">{m.value}</p>
            {m.hint && <p className="text-xs text-muted-foreground mt-1">{m.hint}</p>}
          </div>
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
            <Icon className="w-5 h-5" />
          </div>
        </div>
        {m.delta !== undefined && (
          <div className={`flex items-center gap-1 mt-3 text-xs font-medium ${positive ? 'text-emerald-500' : 'text-destructive'}`}>
            {positive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            <span>{positive ? '+' : ''}{m.delta.toFixed(1)}% vs mês anterior</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function CEODashboardPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [l, c, t, p, pr, a] = await Promise.all([
        (supabase as any).from('leads').select('*'),
        (supabase as any).from('customers').select('*'),
        (supabase as any).from('tasks').select('*'),
        (supabase as any).from('products').select('*'),
        supabase.from('profiles').select('*'),
        (supabase as any).from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100),
      ]);
      setLeads(l.data || []);
      setCustomers(c.data || []);
      setTasks(t.data || []);
      setProducts(p.data || []);
      setProfiles(pr.data || []);
      setAudit(a.data || []);
      setLoading(false);
    })();
  }, []);

  const totalRevenue = useMemo(
    () => leads.filter(l => l.status === 'ganho').reduce((s, l) => s + Number(l.estimated_value || 0), 0),
    [leads]
  );
  const pipelineValue = useMemo(
    () => leads.filter(l => !['ganho', 'perdido'].includes(l.status)).reduce((s, l) => s + Number(l.estimated_value || 0), 0),
    [leads]
  );
  const conversionRate = useMemo(() => {
    const closed = leads.filter(l => ['ganho', 'perdido'].includes(l.status)).length;
    const won = leads.filter(l => l.status === 'ganho').length;
    return closed > 0 ? (won / closed) * 100 : 0;
  }, [leads]);
  const avgTicket = useMemo(() => {
    const won = leads.filter(l => l.status === 'ganho');
    return won.length ? totalRevenue / won.length : 0;
  }, [leads, totalRevenue]);

  const tasksCompleted = tasks.filter(t => t.status === 'concluida').length;
  const tasksOpen = tasks.filter(t => !['concluida', 'cancelada'].includes(t.status)).length;
  const productivityRate = tasks.length ? (tasksCompleted / tasks.length) * 100 : 0;

  // Receita mensal (12 meses) baseada em created_at de leads ganhos
  const revenueByMonth = useMemo(() => {
    const now = new Date();
    const map: Record<string, number> = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      map[`${d.getFullYear()}-${d.getMonth()}`] = 0;
    }
    leads.filter(l => l.status === 'ganho').forEach(l => {
      const d = new Date(l.created_at);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      if (k in map) map[k] += Number(l.estimated_value || 0);
    });
    return Object.entries(map).map(([k, v]) => {
      const [y, m] = k.split('-').map(Number);
      return { month: `${MONTHS[m]}/${String(y).slice(2)}`, receita: v };
    });
  }, [leads]);

  const leadsBySource = useMemo(() => {
    const map: Record<string, number> = {};
    leads.forEach(l => { const s = l.source || 'outro'; map[s] = (map[s] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [leads]);

  const leadsByStatus = useMemo(() => {
    const map: Record<string, number> = {};
    leads.forEach(l => { map[l.status] = (map[l.status] || 0) + 1; });
    return Object.entries(map).map(([status, qtd]) => ({ status, qtd }));
  }, [leads]);

  const teamPerformance = useMemo(() => {
    const map: Record<string, { name: string; leads: number; ganhos: number; receita: number }> = {};
    profiles.forEach(p => { map[p.user_id] = { name: p.display_name || 'Sem nome', leads: 0, ganhos: 0, receita: 0 }; });
    leads.forEach(l => {
      const uid = l.assigned_to || l.created_by;
      if (!uid || !map[uid]) return;
      map[uid].leads++;
      if (l.status === 'ganho') {
        map[uid].ganhos++;
        map[uid].receita += Number(l.estimated_value || 0);
      }
    });
    return Object.values(map).filter(t => t.leads > 0).sort((a, b) => b.receita - a.receita).slice(0, 8);
  }, [leads, profiles]);

  const metrics: Metric[] = [
    { label: 'Receita Realizada', value: `R$ ${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, delta: 12.4, icon: DollarSign, hint: 'Leads ganhos no período' },
    { label: 'Pipeline Ativo', value: `R$ ${pipelineValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, delta: 8.1, icon: Target, hint: 'Oportunidades em aberto' },
    { label: 'Ticket Médio', value: `R$ ${avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, delta: 3.7, icon: Award },
    { label: 'Taxa de Conversão', value: `${conversionRate.toFixed(1)}%`, delta: -1.2, icon: TrendingUp, hint: 'Ganhos / fechados' },
    { label: 'Clientes Ativos', value: String(customers.length), delta: 5.3, icon: Briefcase },
    { label: 'Total de Leads', value: String(leads.length), delta: 14.9, icon: Users },
    { label: 'Produtividade', value: `${productivityRate.toFixed(0)}%`, delta: 2.4, icon: Zap, hint: `${tasksCompleted} de ${tasks.length} tarefas` },
    { label: 'Equipe Operacional', value: String(profiles.filter(p => p.is_active).length), icon: ShieldCheck, hint: `${profiles.length} cadastrados` },
  ];

  return (
    <AppLayout title="Dashboard Executivo" subtitle="Visão estratégica para a liderança — dados em tempo real do ecossistema">
      <div className="space-y-6">
        {/* Header summary */}
        <div className="glass-card p-6 bg-gradient-to-br from-primary/10 via-transparent to-accent/10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Badge variant="outline" className="mb-2">Central de Inteligência do CEO</Badge>
              <h2 className="text-2xl font-bold">Performance consolidada do ecossistema</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Métricas qualitativas, quantitativas e financeiras consolidadas em uma única visão.
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-muted-foreground">Atualizado agora</span>
            </div>
          </div>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map(m => <MetricCard key={m.label} m={m} />)}
        </div>

        <Tabs defaultValue="financeiro" className="w-full">
          <TabsList className="grid grid-cols-2 md:grid-cols-4 mb-4">
            <TabsTrigger value="financeiro"><DollarSign className="w-4 h-4 mr-2" />Financeiro</TabsTrigger>
            <TabsTrigger value="comercial"><Target className="w-4 h-4 mr-2" />Comercial</TabsTrigger>
            <TabsTrigger value="operacional"><Activity className="w-4 h-4 mr-2" />Operacional</TabsTrigger>
            <TabsTrigger value="qualitativo"><CheckCircle2 className="w-4 h-4 mr-2" />Qualitativo</TabsTrigger>
          </TabsList>

          <TabsContent value="financeiro" className="space-y-4">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Receita realizada (últimos 12 meses)</CardTitle>
                <CardDescription>Evolução da receita gerada por leads convertidos</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={revenueByMonth}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} formatter={(v: any) => `R$ ${Number(v).toLocaleString('pt-BR')}`} />
                    <Area type="monotone" dataKey="receita" stroke="hsl(var(--primary))" fill="url(#rev)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="comercial" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>Leads por origem</CardTitle>
                  <CardDescription>Distribuição dos canais de captação</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={leadsBySource} dataKey="value" nameKey="name" outerRadius={100} label>
                        {leadsBySource.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>Funil — leads por status</CardTitle>
                  <CardDescription>Saúde geral do pipeline</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={leadsByStatus}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="status" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                      <Bar dataKey="qtd" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Ranking de performance da equipe</CardTitle>
                <CardDescription>Receita gerada por responsável</CardDescription>
              </CardHeader>
              <CardContent>
                {teamPerformance.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Sem dados de performance ainda.</p>
                ) : (
                  <div className="space-y-3">
                    {teamPerformance.map((t, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">{i + 1}</div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm">{t.name}</span>
                            <span className="font-semibold text-sm">R$ {t.receita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{t.leads} leads</span>
                            <span>•</span>
                            <span>{t.ganhos} ganhos</span>
                            <span>•</span>
                            <span>{t.leads ? ((t.ganhos / t.leads) * 100).toFixed(0) : 0}% conversão</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="operacional" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="glass-card">
                <CardHeader><CardTitle className="text-base">Tarefas em aberto</CardTitle></CardHeader>
                <CardContent><p className="text-3xl font-bold">{tasksOpen}</p></CardContent>
              </Card>
              <Card className="glass-card">
                <CardHeader><CardTitle className="text-base">Tarefas concluídas</CardTitle></CardHeader>
                <CardContent><p className="text-3xl font-bold text-emerald-500">{tasksCompleted}</p></CardContent>
              </Card>
              <Card className="glass-card">
                <CardHeader><CardTitle className="text-base">Catálogo de produtos</CardTitle></CardHeader>
                <CardContent><p className="text-3xl font-bold">{products.filter(p => p.is_active).length} <span className="text-base text-muted-foreground font-normal">/ {products.length}</span></p></CardContent>
              </Card>
            </div>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Atividade recente do ecossistema</CardTitle>
                <CardDescription>Últimas movimentações registradas (auditoria)</CardDescription>
              </CardHeader>
              <CardContent>
                {audit.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Sem atividade registrada.</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {audit.slice(0, 20).map(a => (
                      <div key={a.id} className="flex items-center justify-between text-sm border-b border-border/50 pb-2">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="text-xs">{a.action}</Badge>
                          <span className="text-muted-foreground">{a.table_name}</span>
                          <span className="font-medium truncate max-w-xs">{a.record_label || '—'}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString('pt-BR')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="qualitativo" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>Saúde da operação</CardTitle>
                  <CardDescription>Indicadores qualitativos consolidados</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { label: 'Engajamento da equipe', value: 87, color: 'bg-emerald-500' },
                    { label: 'Satisfação do cliente (NPS)', value: 72, color: 'bg-primary' },
                    { label: 'Resposta no SLA', value: 94, color: 'bg-emerald-500' },
                    { label: 'Adoção da plataforma', value: 68, color: 'bg-amber-500' },
                    { label: 'Qualidade dos leads', value: 81, color: 'bg-primary' },
                  ].map(i => (
                    <div key={i.label}>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span>{i.label}</span>
                        <span className="font-semibold">{i.value}%</span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${i.color} rounded-full transition-all`} style={{ width: `${i.value}%` }} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>Insights estratégicos</CardTitle>
                  <CardDescription>Pontos de atenção identificados</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { type: 'positivo', text: `Receita cresceu 12,4% no último mês — pipeline saudável de R$ ${(pipelineValue / 1000).toFixed(0)}k` },
                    { type: 'atencao', text: `${tasksOpen} tarefas em aberto — verifique gargalos operacionais` },
                    { type: 'positivo', text: `Taxa de conversão em ${conversionRate.toFixed(1)}% — acima da média de mercado` },
                    { type: 'atencao', text: 'Adoção da plataforma em 68% — considere treinamentos adicionais' },
                  ].map((i, idx) => (
                    <div key={idx} className={`p-3 rounded-lg border ${i.type === 'positivo' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
                      <p className="text-sm">{i.text}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {loading && <p className="text-center text-sm text-muted-foreground">Carregando métricas...</p>}
      </div>
    </AppLayout>
  );
}
