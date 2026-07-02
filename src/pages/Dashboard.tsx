import { AppLayout } from '@/components/layout/AppLayout';
import { AgentDashboard } from '@/components/dashboard/AgentDashboard';
import { ManagerDashboard } from '@/components/dashboard/ManagerDashboard';
import { ExecutiveDashboard } from '@/components/dashboard/ExecutiveDashboard';
import { useUserProfileLevel } from '@/hooks/useUserProfileLevel';

export default function Dashboard() {
  const { level, loading } = useUserProfileLevel();

  const subtitles: Record<typeof level, string> = {
    agent: 'Sua performance pessoal em tempo real',
    manager: 'Visão gerencial da equipe e serviços',
    executive: 'Visão executiva completa da operação',
  };

  return (
    <AppLayout title="Dashboard" subtitle={subtitles[level]}>
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : level === 'agent' ? (
        <AgentDashboard />
      ) : level === 'manager' ? (
        <ManagerDashboard />
      ) : (
        <ExecutiveDashboard />
      )}
    </AppLayout>
  );
}
