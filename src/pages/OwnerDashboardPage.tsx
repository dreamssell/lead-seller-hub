import { Link, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, Building, Users, MessagesSquare, TrendingUp, DollarSign, ShieldCheck, Ban, Crown, HeartPulse, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlatformOwner } from '@/hooks/usePlatformOwner';
import { useOwnerPlatformMetrics } from '@/hooks/useOwnerPlatformMetrics';
import { OwnerMetricCard } from '@/components/owner-dashboard/OwnerMetricCard';
import { PlatformCharts } from '@/components/owner-dashboard/PlatformCharts';
import { CompaniesTable } from '@/components/owner-dashboard/CompaniesTable';
import { SubCompaniesTable } from '@/components/owner-dashboard/SubCompaniesTable';

const fmt = (n: number) => new Intl.NumberFormat('pt-BR').format(n);
const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function OwnerDashboardPage() {
  const { isOwner, loading: ownerLoading } = usePlatformOwner();
  const m = useOwnerPlatformMetrics();

  if (ownerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!isOwner) return <Navigate to="/" replace />;

  return (
    <AppLayout
      title="Central do Dono"
      subtitle="Visão exclusiva de desempenho da plataforma, empresas e sub-empresas"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Crown className="w-3.5 h-3.5 text-warning" />
            Área restrita — apenas o dono da plataforma tem acesso a estas informações.
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link to="/owner/access-health"><HeartPulse className="w-4 h-4" /> Saúde de acessos</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link to="/owner/audit-trail"><ScrollText className="w-4 h-4" /> Histórico de auditoria</Link>
            </Button>
          </div>
        </div>

        {m.loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-muted/40 animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <OwnerMetricCard icon={Building2} label="Empresas cadastradas" value={fmt(m.totals.companies)} hint={`${fmt(m.totals.activeCompanies)} ativas · ${fmt(m.totals.blockedCompanies)} bloqueadas`} accent="primary" />
            <OwnerMetricCard icon={Building} label="Sub-empresas" value={fmt(m.totals.subCompanies)} accent="accent" delay={0.05} />
            <OwnerMetricCard icon={Users} label="Usuários totais" value={fmt(m.totals.users)} accent="success" delay={0.1} />
            <OwnerMetricCard icon={MessagesSquare} label="Mensagens (30d)" value={fmt(m.totals.messages30d)} accent="primary" delay={0.15} />
            <OwnerMetricCard icon={TrendingUp} label="Leads gerados" value={fmt(m.totals.leads)} hint={`${fmt(m.totals.wonLeads)} convertidos`} accent="warning" delay={0.2} />
            <OwnerMetricCard icon={ShieldCheck} label="Taxa de conversão" value={pct(m.totals.conversionRate)} accent="success" delay={0.25} />
            <OwnerMetricCard icon={DollarSign} label="Receita atribuída" value={brl(m.totals.revenue)} hint="Somatório de leads ganhos" accent="success" delay={0.3} />
            <OwnerMetricCard icon={Ban} label="Empresas bloqueadas" value={fmt(m.totals.blockedCompanies)} accent="destructive" delay={0.35} />
          </div>
        )}

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Visão geral</TabsTrigger>
            <TabsTrigger value="companies">Empresas</TabsTrigger>
            <TabsTrigger value="subs">Sub-empresas</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <PlatformCharts
              messagesByDay={m.messagesByDay}
              companiesByPlan={m.companiesByPlan}
              leadsByCompany={m.leadsByCompany}
            />
          </TabsContent>

          <TabsContent value="companies" className="mt-4">
            <CompaniesTable companies={m.companies} subCompanies={m.subCompanies} onRefresh={m.refresh} />
          </TabsContent>

          <TabsContent value="subs" className="mt-4">
            <SubCompaniesTable subCompanies={m.subCompanies} companies={m.companies} onRefresh={m.refresh} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
