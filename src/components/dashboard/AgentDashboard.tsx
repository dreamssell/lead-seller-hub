import { StatCard } from './StatCard';
import { LineTrend, BarByStage, DonutChannel } from './charts/DashboardCharts';
import { HighlightServiceCards } from './HighlightServiceCards';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { MessageSquare, Phone, Users, TrendingUp } from 'lucide-react';

export function AgentDashboard() {
  const m = useDashboardMetrics('self');
  const rate = `${Math.round(m.totals.conversionRate * 100)}%`;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={MessageSquare} label="Minhas conversas ativas" value={m.totals.activeConversations} />
        <StatCard icon={Phone} label="Chamadas hoje" value={m.totals.callsToday} />
        <StatCard icon={Users} label="Meus leads no funil" value={m.totals.leadsInFunnel} />
        <StatCard icon={TrendingUp} label="Minha conversão (30d)" value={rate} />
      </div>

      <HighlightServiceCards />

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Minha performance</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <LineTrend title="Mensagens enviadas" subtitle="Últimos 14 dias" data={m.messagesByDay} />
          <BarByStage title="Meus leads por estágio" subtitle="Pipeline atual" data={m.leadsByStage} />
          <DonutChannel title="Conversas por canal" subtitle="Onde estou atuando" data={m.conversationsByChannel} />
          <div className="rounded-2xl border border-border bg-card p-5 h-full">
            <h4 className="text-sm font-semibold text-foreground mb-4">Resumo pessoal</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex justify-between"><span className="text-muted-foreground">Conversão (30d)</span><span className="font-semibold text-foreground">{rate}</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Leads ativos</span><span className="font-semibold text-foreground">{m.totals.leadsInFunnel}</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Conversas em aberto</span><span className="font-semibold text-foreground">{m.totals.activeConversations}</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Chamadas hoje</span><span className="font-semibold text-foreground">{m.totals.callsToday}</span></li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
