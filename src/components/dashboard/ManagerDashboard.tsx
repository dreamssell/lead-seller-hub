import { StatCard } from './StatCard';
import { ServiceCard } from './ServiceCard';
import { LineTrend, BarByStage, DonutChannel } from './charts/DashboardCharts';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { CallHistoryTable } from '@/components/calls/CallHistoryTable';
import {
  MessageSquare, Phone, Users, TrendingUp,
  Headphones, Video, BarChart3, FileText, PenLine,
} from 'lucide-react';

const managerServices = [
  { icon: Headphones, title: 'Central de Atendimento', description: 'Gerencie todos os atendimentos em tempo real.', color: 'bg-primary/10 text-primary', path: '/tickets' },
  { icon: Phone, title: 'VoIP & Gravação', description: 'Chamadas VoIP com gravação e transcrição.', color: 'bg-warning/10 text-warning', path: '/calls' },
  { icon: Video, title: 'Videochamadas', description: 'Agende e realize videochamadas.', color: 'bg-primary/10 text-primary', path: '/video' },
  { icon: BarChart3, title: 'Relatórios & Analytics', description: 'Métricas de performance e exportação em PDF.', color: 'bg-accent/10 text-accent', path: '/reports' },
  { icon: FileText, title: 'Pipeline & Kanban', description: 'Funil de vendas com quadros Kanban.', color: 'bg-primary/10 text-primary', path: '/pipeline' },
  { icon: PenLine, title: 'Assinaturas Eletrônicas', description: 'Envie e acompanhe assinaturas eletrônicas.', color: 'bg-accent/10 text-accent', path: '/signatures' },
];

export function ManagerDashboard() {
  const m = useDashboardMetrics('company');
  const rate = `${Math.round(m.totals.conversionRate * 100)}%`;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={MessageSquare} label="Conversas ativas (empresa)" value={m.totals.activeConversations} />
        <StatCard icon={Phone} label="Chamadas hoje (empresa)" value={m.totals.callsToday} />
        <StatCard icon={Users} label="Leads no funil (empresa)" value={m.totals.leadsInFunnel} />
        <StatCard icon={TrendingUp} label="Conversão (30d)" value={rate} />
      </div>

      <div className="mb-8">
        <h3 className="text-sm font-semibold text-foreground mb-4">Performance da empresa</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <LineTrend title="Mensagens dos agentes" subtitle="Últimos 14 dias" data={m.messagesByDay} />
          <BarByStage title="Leads por estágio" subtitle="Distribuição do pipeline" data={m.leadsByStage} />
          <DonutChannel title="Conversas por canal" subtitle="Distribuição de atendimentos" data={m.conversationsByChannel} />
          <div className="rounded-2xl border border-border bg-card p-5">
            <h4 className="text-sm font-semibold text-foreground mb-4">Indicadores gerenciais</h4>
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
        <CallHistoryTable
          title="Chamadas recentes da equipe"
          description="Histórico consolidado — VoIP e Wavoip"
          filter={{ limit: 50 }}
        />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Serviços & Módulos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {managerServices.map((s, i) => <ServiceCard key={s.title} {...s} delay={i * 0.05} />)}
        </div>
      </div>
    </>
  );
}
