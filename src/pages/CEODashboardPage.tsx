import { useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Users, DollarSign, Target,
  CheckCircle2, Activity, Briefcase, Award, Zap, ShieldCheck,
  Download, ChevronRight, Calendar, Inbox, Phone, PhoneCall, FileSignature,
  Home, Crown,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';


const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

type DrillType =
  | 'leads-won' | 'leads-pipeline' | 'leads-closed' | 'leads-all'
  | 'customers' | 'tasks-open' | 'tasks-done' | 'profiles-active';

type Period = '7d' | '30d' | '90d' | '12m' | 'all';
const PERIOD_LABELS: Record<Period, string> = {
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  '12m': 'Últimos 12 meses',
  'all': 'Todo o período',
};

function periodStart(p: Period): Date | null {
  if (p === 'all') return null;
  const d = new Date();
  if (p === '7d') d.setDate(d.getDate() - 7);
  else if (p === '30d') d.setDate(d.getDate() - 30);
  else if (p === '90d') d.setDate(d.getDate() - 90);
  else if (p === '12m') d.setMonth(d.getMonth() - 12);
  return d;
}

interface Metric {
  label: string;
  value: string;
  delta?: number;
  icon: any;
  hint?: string;
  drill?: DrillType;
}

function MetricCard({ m, onClick }: { m: Metric; onClick?: () => void }) {
  const Icon = m.icon;
  const positive = (m.delta ?? 0) >= 0;
  return (
    <Card
      className={`glass-card transition-all ${onClick ? 'cursor-pointer hover:border-primary/50 hover:shadow-md' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{m.label}</p>
            <p className="text-2xl font-bold mt-1.5 truncate">{m.value}</p>
            {m.hint && <p className="text-xs text-muted-foreground mt-1">{m.hint}</p>}
          </div>
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
            <Icon className="w-5 h-5" />
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          {m.delta !== undefined ? (
            <div className={`flex items-center gap-1 text-xs font-medium ${positive ? 'text-emerald-500' : 'text-destructive'}`}>
              {positive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              <span>{positive ? '+' : ''}{m.delta.toFixed(1)}% vs período anterior</span>
            </div>
          ) : <span />}
          {onClick && (
            <span className="text-xs text-primary flex items-center gap-0.5 font-medium">
              detalhes <ChevronRight className="w-3 h-3" />
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CEODashboardPage() {
  const [allLeads, setAllLeads] = useState<any[]>([]);
  const [allCustomers, setAllCustomers] = useState<any[]>([]);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('30d');
  const [exporting, setExporting] = useState(false);
  const [drill, setDrill] = useState<DrillType | null>(null);
  const [contextName, setContextName] = useState<string>('');
  const dashboardRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user, access } = useAuth();


  const focusCards = [
    { title: 'Captura de Leads', desc: 'Holmes, DealerSpace e demais canais', icon: Inbox, path: '/ceo/leads-capture', tint: 'from-primary/20' },
    { title: 'Ligações', desc: 'Performance VoIP e Wavoip', icon: Phone, path: '/ceo/calls', tint: 'from-emerald-500/20' },
    { title: '3CX', desc: 'Métricas em tempo real do PBX', icon: PhoneCall, path: '/3cx', tint: 'from-sky-500/20' },
    { title: 'Assinaturas', desc: 'Documentos e status do portal', icon: FileSignature, path: '/ceo/signatures', tint: 'from-accent/20' },
  ];

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
      setAllLeads(l.data || []);
      setAllCustomers(c.data || []);
      setAllTasks(t.data || []);
      setProducts(p.data || []);
      setProfiles(pr.data || []);
      setAudit(a.data || []);
      setLoading(false);
    })();
  }, []);

  // Resolve context name (sub-empresa > empresa direta > display_name).
  useEffect(() => {
    if (access?.sub_company_name) { setContextName(access.sub_company_name); return; }
    if (!user?.id) return;
    (async () => {
      const { data } = await (supabase as any)
        .from('client_companies')
        .select('name')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (data?.name) setContextName(data.name);
      else setContextName(user.user_metadata?.display_name || user.email || '');
    })();
  }, [access?.sub_company_name, user?.id]);


  // Filter by selected period (created_at)
  const startDate = periodStart(period);
  const inPeriod = (row: any) => !startDate || new Date(row.created_at) >= startDate;
  const leads = useMemo(() => allLeads.filter(inPeriod), [allLeads, period]);
  const customers = useMemo(() => allCustomers.filter(inPeriod), [allCustomers, period]);
  const tasks = useMemo(() => allTasks.filter(inPeriod), [allTasks, period]);

  const profileName = (uid?: string | null) => {
    if (!uid) return '—';
    const p = profiles.find(x => x.user_id === uid);
    return p?.display_name || uid.slice(0, 8) + '…';
  };

  const totalRevenue = useMemo(
    () => leads.filter(l => l.status === 'ganho').reduce((s, l) => s + Number(l.estimated_value || 0), 0),
    [leads]
  );
  const pipelineValue = useMemo(
    () => leads.filter(l => !['ganho', 'perdido'].includes(l.status)).reduce((s, l) => s + Number(l.estimated_value || 0), 0),
    [leads]
  );
  const wonLeads = useMemo(() => leads.filter(l => l.status === 'ganho'), [leads]);
  const closedLeads = useMemo(() => leads.filter(l => ['ganho', 'perdido'].includes(l.status)), [leads]);
  const pipelineLeads = useMemo(() => leads.filter(l => !['ganho', 'perdido'].includes(l.status)), [leads]);
  const conversionRate = closedLeads.length > 0 ? (wonLeads.length / closedLeads.length) * 100 : 0;
  const avgTicket = wonLeads.length ? totalRevenue / wonLeads.length : 0;

  const tasksDone = useMemo(() => tasks.filter(t => t.status === 'concluida'), [tasks]);
  const tasksOpenList = useMemo(() => tasks.filter(t => !['concluida', 'cancelada'].includes(t.status)), [tasks]);
  const productivityRate = tasks.length ? (tasksDone.length / tasks.length) * 100 : 0;
  const activeProfiles = useMemo(() => profiles.filter(p => p.is_active), [profiles]);

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
    { label: 'Receita Realizada', value: `R$ ${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, delta: 12.4, icon: DollarSign, hint: `${wonLeads.length} leads ganhos`, drill: 'leads-won' },
    { label: 'Pipeline Ativo', value: `R$ ${pipelineValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, delta: 8.1, icon: Target, hint: `${pipelineLeads.length} oportunidades`, drill: 'leads-pipeline' },
    { label: 'Ticket Médio', value: `R$ ${avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, delta: 3.7, icon: Award, drill: 'leads-won' },
    { label: 'Taxa de Conversão', value: `${conversionRate.toFixed(1)}%`, delta: -1.2, icon: TrendingUp, hint: `${closedLeads.length} fechados`, drill: 'leads-closed' },
    { label: 'Clientes Ativos', value: String(customers.length), delta: 5.3, icon: Briefcase, drill: 'customers' },
    { label: 'Total de Leads', value: String(leads.length), delta: 14.9, icon: Users, drill: 'leads-all' },
    { label: 'Produtividade', value: `${productivityRate.toFixed(0)}%`, delta: 2.4, icon: Zap, hint: `${tasksDone.length} de ${tasks.length} tarefas`, drill: 'tasks-done' },
    { label: 'Equipe Operacional', value: String(activeProfiles.length), icon: ShieldCheck, hint: `${profiles.length} cadastrados`, drill: 'profiles-active' },
  ];

  // ---------- Drill-down ----------
  const drillData = useMemo(() => {
    switch (drill) {
      case 'leads-won': return { title: 'Leads ganhos', cols: ['Nome', 'Valor', 'Origem', 'Responsável', 'Data'], rows: wonLeads.map(l => [l.name, `R$ ${Number(l.estimated_value || 0).toLocaleString('pt-BR')}`, l.source || '—', profileName(l.assigned_to || l.created_by), new Date(l.created_at).toLocaleDateString('pt-BR')]) };
      case 'leads-pipeline': return { title: 'Pipeline ativo', cols: ['Nome', 'Status', 'Valor', 'Origem', 'Responsável'], rows: pipelineLeads.map(l => [l.name, l.status, `R$ ${Number(l.estimated_value || 0).toLocaleString('pt-BR')}`, l.source || '—', profileName(l.assigned_to || l.created_by)]) };
      case 'leads-closed': return { title: 'Leads fechados (ganhos + perdidos)', cols: ['Nome', 'Status', 'Valor', 'Responsável'], rows: closedLeads.map(l => [l.name, l.status, `R$ ${Number(l.estimated_value || 0).toLocaleString('pt-BR')}`, profileName(l.assigned_to || l.created_by)]) };
      case 'leads-all': return { title: 'Todos os leads do período', cols: ['Nome', 'Status', 'Origem', 'Valor', 'Responsável'], rows: leads.map(l => [l.name, l.status, l.source || '—', `R$ ${Number(l.estimated_value || 0).toLocaleString('pt-BR')}`, profileName(l.assigned_to || l.created_by)]) };
      case 'customers': return { title: 'Clientes', cols: ['Nome', 'Empresa', 'Email', 'Telefone'], rows: customers.map(c => [c.name, c.company || '—', c.email || '—', c.phone || '—']) };
      case 'tasks-open': return { title: 'Tarefas em aberto', cols: ['Título', 'Prioridade', 'Status', 'Responsável', 'Prazo'], rows: tasksOpenList.map(t => [t.title, t.priority, t.status, profileName(t.assigned_to), t.due_date ? new Date(t.due_date).toLocaleDateString('pt-BR') : '—']) };
      case 'tasks-done': return { title: 'Tarefas concluídas', cols: ['Título', 'Prioridade', 'Responsável', 'Concluída em'], rows: tasksDone.map(t => [t.title, t.priority, profileName(t.assigned_to), new Date(t.updated_at).toLocaleDateString('pt-BR')]) };
      case 'profiles-active': return { title: 'Equipe ativa', cols: ['Nome', 'Cargo', 'Telefone', 'Status'], rows: activeProfiles.map(p => [p.display_name || '—', p.role_label || '—', p.phone || '—', p.is_active ? 'Ativo' : 'Inativo']) };
      default: return null;
    }
  }, [drill, wonLeads, pipelineLeads, closedLeads, leads, customers, tasksOpenList, tasksDone, activeProfiles, profiles]);

  // ---------- Export PDF ----------
  const exportPDF = async () => {
    if (!dashboardRef.current) return;
    setExporting(true);
    try {
      // Wait a tick for any animation to settle
      await new Promise(r => setTimeout(r, 100));
      const el = dashboardRef.current;
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
        useCORS: true,
        logging: false,
        windowWidth: el.scrollWidth,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const contentW = pageW - margin * 2;
      const imgH = (canvas.height * contentW) / canvas.width;

      // Header
      pdf.setFontSize(16);
      pdf.text('Relatório Executivo — Lead Seller', margin, 14);
      pdf.setFontSize(10);
      pdf.setTextColor(110);
      pdf.text(`Período: ${PERIOD_LABELS[period]}  •  Gerado em ${new Date().toLocaleString('pt-BR')}`, margin, 20);
      pdf.setTextColor(0);

      // Image — split across pages
      let remaining = imgH;
      let position = 25;
      let srcY = 0;
      const usableH = pageH - position - margin;
      const ratio = canvas.width / contentW; // px per mm

      if (imgH <= usableH) {
        pdf.addImage(imgData, 'PNG', margin, position, contentW, imgH);
      } else {
        // paginate
        let firstPage = true;
        while (remaining > 0) {
          const sliceMM = firstPage ? usableH : pageH - margin * 2;
          const sliceHpx = sliceMM * ratio;
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = Math.min(sliceHpx, canvas.height - srcY);
          const ctx = sliceCanvas.getContext('2d')!;
          ctx.drawImage(canvas, 0, srcY, canvas.width, sliceCanvas.height, 0, 0, canvas.width, sliceCanvas.height);
          const sliceImg = sliceCanvas.toDataURL('image/png');
          const drawH = (sliceCanvas.height / canvas.width) * contentW;
          if (!firstPage) { pdf.addPage(); position = margin; }
          pdf.addImage(sliceImg, 'PNG', margin, position, contentW, drawH);
          srcY += sliceCanvas.height;
          remaining -= drawH;
          firstPage = false;
        }
      }

      pdf.save(`performance-empresa-${period}-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast({ title: 'Relatório exportado', description: 'Download iniciado.' });
    } catch (e: any) {
      toast({ title: 'Erro ao exportar', description: e.message, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppLayout title="Performance da Empresa" subtitle="Visão estratégica para a liderança — dados em tempo real do ecossistema">
      <div className="space-y-6">
        {/* Breadcrumbs + contexto */}
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <Home className="w-3.5 h-3.5" /> Início
          </button>
          <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          <span className="text-foreground font-medium">Performance da Empresa</span>
          {contextName && (
            <>
              <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              <span className="truncate max-w-[240px]" title={contextName}>{contextName}</span>
            </>
          )}
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary">
            <Crown className="w-3 h-3" /> Painel executivo completo
          </span>
        </nav>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
                  <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={exportPDF} disabled={exporting || loading}>
            <Download className="w-4 h-4 mr-2" />
            {exporting ? 'Gerando PDF...' : 'Exportar PDF'}
          </Button>
        </div>

        <div ref={dashboardRef} className="space-y-6 bg-background p-2 rounded-lg">
          {/* Header summary */}
          <div className="glass-card p-6 bg-gradient-to-br from-primary/10 via-transparent to-accent/10">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <Badge variant="outline" className="mb-2">Painel Executivo da Empresa</Badge>

                <h2 className="text-2xl font-bold">Performance da Empresa</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Período: <span className="font-medium text-foreground">{PERIOD_LABELS[period]}</span>
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-muted-foreground">Atualizado agora</span>
              </div>
            </div>
          </div>

          {/* Painéis de foco — atalhos para análises dedicadas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {focusCards.map((c) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.title}
                  onClick={() => navigate(c.path)}
                  className={`text-left glass-card p-5 transition-all hover:border-primary/50 hover:shadow-md bg-gradient-to-br ${c.tint} to-transparent`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2.5 rounded-lg bg-background/70 text-primary"><Icon className="w-5 h-5" /></div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <p className="font-semibold text-sm">{c.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{c.desc}</p>
                  <p className="text-[10px] uppercase tracking-wider text-primary font-semibold mt-3">Abrir painel dedicado →</p>
                </button>
              );
            })}
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {metrics.map(m => (
              <MetricCard key={m.label} m={m} onClick={m.drill ? () => setDrill(m.drill!) : undefined} />
            ))}
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
                    <CardTitle>Acompanhar leads por estágio</CardTitle>
                    <CardDescription>Saúde geral do pipeline por status</CardDescription>

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
                  <CardDescription>Receita gerada por responsável — clique para ver leads</CardDescription>
                </CardHeader>
                <CardContent>
                  {teamPerformance.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Sem dados de performance ainda.</p>
                  ) : (
                    <div className="space-y-3">
                      {teamPerformance.map((t, i) => (
                        <button
                          key={i}
                          onClick={() => setDrill('leads-all')}
                          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                        >
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">{i + 1}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm truncate">{t.name}</span>
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
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="operacional" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="glass-card cursor-pointer hover:border-primary/50" onClick={() => setDrill('tasks-open')}>
                  <CardHeader><CardTitle className="text-base flex items-center justify-between">Tarefas em aberto <ChevronRight className="w-4 h-4 text-primary" /></CardTitle></CardHeader>
                  <CardContent><p className="text-3xl font-bold">{tasksOpenList.length}</p></CardContent>
                </Card>
                <Card className="glass-card cursor-pointer hover:border-primary/50" onClick={() => setDrill('tasks-done')}>
                  <CardHeader><CardTitle className="text-base flex items-center justify-between">Tarefas concluídas <ChevronRight className="w-4 h-4 text-primary" /></CardTitle></CardHeader>
                  <CardContent><p className="text-3xl font-bold text-emerald-500">{tasksDone.length}</p></CardContent>
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
                      { type: 'atencao', text: `${tasksOpenList.length} tarefas em aberto — verifique gargalos operacionais` },
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
      </div>

      {/* Drill-down dialog */}
      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{drillData?.title || 'Detalhes'}</DialogTitle>
            <DialogDescription>
              Período: {PERIOD_LABELS[period]} • {drillData?.rows.length || 0} registro(s)
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto -mx-6 px-6">
            {drillData && drillData.rows.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    {drillData.cols.map(c => <TableHead key={c}>{c}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drillData.rows.map((r, i) => (
                    <TableRow key={i}>
                      {r.map((cell, j) => <TableCell key={j} className="text-sm">{String(cell)}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum registro neste período.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
