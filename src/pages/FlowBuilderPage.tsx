import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Workflow, Plus, Zap, Activity, CheckCircle2, Users, Sparkles, FilePlus2,
  Repeat, Brain, TimerReset, Globe, ChevronRight, Loader2, Play, Pause, Trash2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

type Metrics = {
  active: number;
  runsToday: number;
  successRate: number;
  leadsProcessed: number;
};

type FlowRow = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_channel: string | null;
  updated_at: string;
};

type Template = {
  id: string;
  title: string;
  subtitle: string;
  icon: any;
  color: string;
  build: (ownerId: string) => Promise<void>;
};

export default function FlowBuilderPage() {
  const { access } = useAuth();
  const navigate = useNavigate();
  const ownerId = access?.owner_id;

  const [metrics, setMetrics] = useState<Metrics>({ active: 0, runsToday: 0, successRate: 0, leadsProcessed: 0 });
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [seeding, setSeeding] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = async () => {
    if (!ownerId) return;
    setLoading(true);
    const start = new Date(); start.setHours(0, 0, 0, 0);

    const [{ data: flowsData }, { data: runsData }, { count: activeCount }, { count: rulesActive }] = await Promise.all([
      supabase.from('bot_flows').select('id,name,description,is_active,trigger_channel,updated_at').eq('owner_id', ownerId).order('updated_at', { ascending: false }),
      supabase.from('bot_flow_runs').select('status,customer_id', { count: 'exact' }).eq('owner_id', ownerId).gte('created_at', start.toISOString()),
      supabase.from('bot_flows').select('*', { count: 'exact', head: true }).eq('owner_id', ownerId).eq('is_active', true),
      supabase.from('routing_rules').select('*', { count: 'exact', head: true }).eq('owner_id', ownerId).eq('active', true),
    ]);

    setFlows((flowsData || []) as FlowRow[]);

    const runs = runsData || [];
    const ok = runs.filter((r: any) => r.status === 'completed').length;
    const uniqueLeads = new Set(runs.map((r: any) => r.customer_id).filter(Boolean));
    setMetrics({
      active: (activeCount || 0) + (rulesActive || 0),
      runsToday: runs.length,
      successRate: runs.length ? Math.round((ok / runs.length) * 100) : 0,
      leadsProcessed: uniqueLeads.size,
    });
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [ownerId]);

  const filtered = useMemo(
    () => flows.filter(f => f.name.toLowerCase().includes(search.toLowerCase())),
    [flows, search]
  );

  const createBlank = async () => {
    if (!ownerId) return;
    const { data, error } = await supabase.from('bot_flows').insert({
      owner_id: ownerId,
      name: 'Novo fluxo',
      nodes: [{ id: 'n1', kind: 'trigger', x: 80, y: 80, data: { name: 'Mensagem recebida' } }] as any,
      edges: [] as any,
    }).select('id').single();
    if (error) return toast.error(error.message);
    setCreateOpen(false);
    navigate('/bot-flows');
    toast.success('Fluxo criado — abra em Bot de Triagem para editar');
    void data;
  };

  const templates: Template[] = [
    {
      id: 'round-robin',
      title: 'Round-Robin Comercial',
      subtitle: 'Distribui novos leads em sequência entre os atendentes ativos.',
      icon: Repeat,
      color: 'from-blue-500/20 to-indigo-500/20 border-blue-500/30',
      build: async (owner) => {
        const { data: q } = await supabase.from('attendance_queues').insert({
          owner_id: owner, name: 'Comercial (Round-Robin)', routing_strategy: 'round_robin', sla_overflow_seconds: 180,
        }).select('id').single();
        await supabase.from('routing_rules').insert({
          owner_id: owner, name: 'Round-Robin Comercial', priority: 10, active: true,
          conditions: { channel: ['whatsapp', 'instagram'] }, actions: { queue_id: q?.id },
          target_queue_id: q?.id,
        });
      },
    },
    {
      id: 'skill',
      title: 'Skill-Based Suporte',
      subtitle: 'Roteia por palavras-chave (sinistro, renovação, dúvida) para o time certo.',
      icon: Brain,
      color: 'from-purple-500/20 to-pink-500/20 border-purple-500/30',
      build: async (owner) => {
        const { data: q } = await supabase.from('attendance_queues').insert({
          owner_id: owner, name: 'Suporte Skill-Based', routing_strategy: 'skill', sla_overflow_seconds: 240,
        }).select('id').single();
        await supabase.from('routing_rules').insert({
          owner_id: owner, name: 'Skill Suporte — Sinistros', priority: 20, active: true, skill: 'sinistros',
          conditions: { keywords: ['sinistro', 'acidente', 'colisao'] }, actions: { queue_id: q?.id },
          target_queue_id: q?.id,
        });
      },
    },
    {
      id: 'sla-overflow',
      title: 'SLA Overflow',
      subtitle: 'Devolve leads sem primeira resposta em 3 min para a fila geral.',
      icon: TimerReset,
      color: 'from-amber-500/20 to-orange-500/20 border-amber-500/30',
      build: async (owner) => {
        await supabase.from('attendance_queues').insert({
          owner_id: owner, name: 'Fila Geral (Overflow)', routing_strategy: 'load_balance', sla_overflow_seconds: 180,
        });
        toast.success('Fila de overflow criada. O cron sla_overflow_scan já está ativo.');
      },
    },
    {
      id: 'landing',
      title: 'Captura Landing',
      subtitle: 'Recebe leads da landing e distribui automaticamente na fila comercial.',
      icon: Globe,
      color: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30',
      build: async (owner) => {
        const { data: q } = await supabase.from('attendance_queues').insert({
          owner_id: owner, name: 'Landing → Comercial', routing_strategy: 'round_robin', sla_overflow_seconds: 300,
        }).select('id').single();
        await supabase.from('routing_rules').insert({
          owner_id: owner, name: 'Landing Capture', priority: 5, active: true,
          conditions: { origin: ['landing', 'webhook'] }, actions: { queue_id: q?.id },
          target_queue_id: q?.id,
        });
      },
    },
  ];

  const applyTemplate = async (t: Template) => {
    if (!ownerId) return;
    setSeeding(t.id);
    try {
      await t.build(ownerId);
      toast.success(`Template "${t.title}" aplicado`);
      setTemplatesOpen(false);
      setCreateOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao aplicar template');
    } finally {
      setSeeding(null);
    }
  };

  const toggleActive = async (f: FlowRow) => {
    await supabase.from('bot_flows').update({ is_active: !f.is_active }).eq('id', f.id);
    load();
  };

  const removeFlow = async (id: string) => {
    if (!confirm('Excluir este fluxo?')) return;
    await supabase.from('bot_flows').delete().eq('id', id);
    load();
  };

  const metricCards = [
    { label: 'Automações Ativas', value: metrics.active, icon: Zap, color: 'text-emerald-500' },
    { label: 'Execuções Hoje', value: metrics.runsToday, icon: Activity, color: 'text-blue-500' },
    { label: 'Taxa de Sucesso', value: `${metrics.successRate}%`, icon: CheckCircle2, color: 'text-primary' },
    { label: 'Leads Processados', value: metrics.leadsProcessed, icon: Users, color: 'text-purple-500' },
  ];

  return (
    <AppLayout title="Flow Builder" subtitle="Automações, roteamento e triagem inteligente num só lugar">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {metricCards.map((m) => {
            const Icon = m.icon;
            return (
              <Card key={m.label} className="p-4 glass-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">{m.label}</span>
                  <Icon className={`w-4 h-4 ${m.color}`} />
                </div>
                <p className="text-2xl font-bold">{loading ? '—' : m.value}</p>
              </Card>
            );
          })}
        </div>

        {/* Action bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Workflow className="w-5 h-5 text-primary" />
            <Input
              placeholder="Buscar fluxos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/bot-flows')}>
              <Sparkles className="w-4 h-4 mr-2" /> Editor Visual
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Criar Novo Fluxo
            </Button>
          </div>
        </div>

        {/* Flows list */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {loading && (
            <div className="col-span-full flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <Card className="col-span-full p-10 text-center glass-card">
              <Workflow className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                Nenhum fluxo ainda. Comece com um template pronto ou crie do zero.
              </p>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> Criar Novo Fluxo
              </Button>
            </Card>
          )}
          {!loading && filtered.map((f) => (
            <Card key={f.id} className="p-4 glass-card hover:border-primary/40 transition group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Workflow className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{f.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {f.trigger_channel || 'todos os canais'}
                    </p>
                  </div>
                </div>
                <Badge variant={f.is_active ? 'default' : 'outline'} className="text-[10px]">
                  {f.is_active ? 'Ativo' : 'Pausado'}
                </Badge>
              </div>
              {f.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{f.description}</p>
              )}
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => navigate('/bot-flows')}>
                  Editar
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => toggleActive(f)}>
                  {f.is_active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => removeFlow(f.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Create modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Criar Novo Fluxo</DialogTitle>
            <DialogDescription>Escolha como começar — do zero ou a partir de um template pronto.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
            <button
              onClick={createBlank}
              className="p-6 rounded-2xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition text-left group"
            >
              <FilePlus2 className="w-8 h-8 text-primary mb-3" />
              <p className="font-semibold mb-1">Começar do Zero</p>
              <p className="text-xs text-muted-foreground">
                Abra o editor visual com um canvas em branco e monte seu fluxo nó a nó.
              </p>
              <ChevronRight className="w-4 h-4 mt-3 opacity-0 group-hover:opacity-100 transition" />
            </button>
            <button
              onClick={() => setTemplatesOpen(true)}
              className="p-6 rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/5 to-primary/10 hover:from-primary/10 hover:to-primary/20 transition text-left group"
            >
              <Sparkles className="w-8 h-8 text-primary mb-3" />
              <p className="font-semibold mb-1">Usar Template</p>
              <p className="text-xs text-muted-foreground">
                Round-Robin, Skill-Based, SLA Overflow e Captura Landing — prontos para uso.
              </p>
              <ChevronRight className="w-4 h-4 mt-3 opacity-0 group-hover:opacity-100 transition" />
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Templates modal */}
      <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Templates prontos</DialogTitle>
            <DialogDescription>Cada template cria fila + regra de roteamento configuradas para o cenário.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
            {templates.map((t) => {
              const Icon = t.icon;
              const isLoading = seeding === t.id;
              return (
                <button
                  key={t.id}
                  disabled={isLoading}
                  onClick={() => applyTemplate(t)}
                  className={`p-5 rounded-2xl border-2 text-left transition bg-gradient-to-br ${t.color} hover:scale-[1.01] disabled:opacity-60`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="w-6 h-6 text-foreground" />
                    <p className="font-semibold">{t.title}</p>
                    {isLoading && <Loader2 className="w-4 h-4 animate-spin ml-auto" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{t.subtitle}</p>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
