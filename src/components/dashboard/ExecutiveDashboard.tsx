import { useEffect, useState } from 'react';
import { StatCard } from './StatCard';
import { ServiceCard } from './ServiceCard';
import { HighlightServiceCards } from './HighlightServiceCards';
import { LineTrend, BarByStage, DonutChannel } from './charts/DashboardCharts';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  MessageSquare, Phone, Users, TrendingUp,
  Headphones, Bot, Video, FileText, BarChart3, ShieldCheck, Zap, Globe, PenLine, Crown,
} from 'lucide-react';

const services = [
  { icon: Crown, title: 'Performance da Empresa', description: 'Painel executivo completo.', color: 'bg-warning/10 text-warning', path: '/ceo' },
  { icon: Headphones, title: 'Central de Atendimento', description: 'Todos os atendimentos em tempo real.', color: 'bg-primary/10 text-primary', path: '/tickets' },
  { icon: Bot, title: 'Agentes de I.A. (SDR)', description: 'Bots e qualificação automática.', color: 'bg-success/10 text-success', path: '/ai-agents' },
  { icon: Phone, title: 'VoIP & Gravação', description: 'Chamadas VoIP com gravação.', color: 'bg-warning/10 text-warning', path: '/calls' },
  { icon: Globe, title: 'WhatsApp Business', description: 'Integração WhatsApp completa.', color: 'bg-success/10 text-success', path: '/whatsapp' },
  // Videochamadas ("Meeting") é premium — vive no card em destaque do topo, com upsell para não-donos.
  { icon: BarChart3, title: 'Relatórios & Analytics', description: 'Métricas e exportação em PDF.', color: 'bg-accent/10 text-accent', path: '/reports' },
  { icon: Zap, title: 'Automações & Integrações', description: 'Fluxos, webhooks e integrações.', color: 'bg-warning/10 text-warning', path: '/automations' },
  { icon: ShieldCheck, title: 'Gestão de Acessos & API', description: 'Permissões e chaves API.', color: 'bg-destructive/10 text-destructive', path: '/api-keys' },
  { icon: FileText, title: 'Pipeline & Kanban', description: 'Funil de vendas Kanban.', color: 'bg-primary/10 text-primary', path: '/pipeline' },
  { icon: PenLine, title: 'Assinaturas Eletrônicas', description: 'Documentos assinados eletronicamente.', color: 'bg-accent/10 text-accent', path: '/signatures' },
];

interface SupervisorPerf {
  user_id: string;
  name: string;
  role: string;
  leadsTotal: number;
  leadsWon: number;
  conversion: number;
}

export function ExecutiveDashboard() {
  const m = useDashboardMetrics('company');
  const { access, user } = useAuth();
  const [supervisors, setSupervisors] = useState<SupervisorPerf[]>([]);

  useEffect(() => {
    (async () => {
      const ownerId = access?.owner_id || user?.id;
      if (!ownerId) return;
      // Fetch supervisors/coordenadores
      const { data: roles } = await supabase
        .from('user_signature_roles')
        .select('user_id, role')
        .in('role', ['supervisor', 'coordenador'])
        .eq('owner_id', ownerId);
      if (!roles || roles.length === 0) { setSupervisors([]); return; }
      const userIds = Array.from(new Set(roles.map((r: any) => r.user_id)));
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, email')
        .in('user_id', userIds);
      const nameMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { nameMap[p.user_id] = p.display_name || p.email || 'Usuário'; });

      const start30 = new Date(); start30.setDate(start30.getDate() - 30);
      const { data: leads } = await supabase
        .from('leads')
        .select('assigned_to, status')
        .eq('owner_id', ownerId)
        .gte('created_at', start30.toISOString())
        .in('assigned_to', userIds);

      const agg: Record<string, { total: number; won: number }> = {};
      (leads || []).forEach((l: any) => {
        if (!l.assigned_to) return;
        if (!agg[l.assigned_to]) agg[l.assigned_to] = { total: 0, won: 0 };
        agg[l.assigned_to].total += 1;
        if (l.status === 'won') agg[l.assigned_to].won += 1;
      });

      const perf: SupervisorPerf[] = roles.map((r: any) => {
        const a = agg[r.user_id] || { total: 0, won: 0 };
        return {
          user_id: r.user_id,
          name: nameMap[r.user_id] || 'Usuário',
          role: r.role,
          leadsTotal: a.total,
          leadsWon: a.won,
          conversion: a.total > 0 ? a.won / a.total : 0,
        };
      }).sort((a, b) => b.conversion - a.conversion);
      setSupervisors(perf);
    })();
  }, [access?.owner_id, user?.id]);

  const rate = `${Math.round(m.totals.conversionRate * 100)}%`;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={MessageSquare} label="Conversas ativas" value={m.totals.activeConversations} />
        <StatCard icon={Phone} label="Chamadas hoje" value={m.totals.callsToday} />
        <StatCard icon={Users} label="Leads no funil" value={m.totals.leadsInFunnel} />
        <StatCard icon={TrendingUp} label="Conversão (30d)" value={rate} />
      </div>

      <HighlightServiceCards />

      <div className="mb-8">
        <h3 className="text-sm font-semibold text-foreground mb-4">Visão executiva</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <LineTrend title="Volume de mensagens" subtitle="Últimos 14 dias" data={m.messagesByDay} />
          <BarByStage title="Pipeline por estágio" subtitle="Distribuição atual" data={m.leadsByStage} />
          <DonutChannel title="Canais de atendimento" subtitle="Distribuição de conversas" data={m.conversationsByChannel} />
          <div className="rounded-2xl border border-border bg-card p-5">
            <h4 className="text-sm font-semibold text-foreground mb-4">Indicadores estratégicos</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex justify-between"><span className="text-muted-foreground">Taxa de conversão (30d)</span><span className="font-semibold text-foreground">{rate}</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Leads ativos</span><span className="font-semibold text-foreground">{m.totals.leadsInFunnel}</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Conversas em aberto</span><span className="font-semibold text-foreground">{m.totals.activeConversations}</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Chamadas hoje</span><span className="font-semibold text-foreground">{m.totals.callsToday}</span></li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <h3 className="text-sm font-semibold text-foreground mb-4">Performance de supervisores e coordenadores</h3>
        {supervisors.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Nenhum supervisor ou coordenador cadastrado. Configure a equipe em <a href="/team" className="text-primary hover:underline">Equipe & Cargos</a>.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {supervisors.map((s) => (
              <div key={s.user_id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{s.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{s.role}</p>
                  </div>
                  <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded-lg">
                    {Math.round(s.conversion * 100)}%
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-muted/40 p-2">
                    <p className="text-muted-foreground">Leads (30d)</p>
                    <p className="text-base font-semibold text-foreground">{s.leadsTotal}</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2">
                    <p className="text-muted-foreground">Ganhos</p>
                    <p className="text-base font-semibold text-foreground">{s.leadsWon}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Serviços & Módulos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((s, i) => <ServiceCard key={s.title} {...s} delay={i * 0.04} />)}
        </div>
      </div>
    </>
  );
}
