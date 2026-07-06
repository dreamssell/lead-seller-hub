import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { AgentDashboard } from '@/components/dashboard/AgentDashboard';
import { ManagerDashboard } from '@/components/dashboard/ManagerDashboard';
import { ExecutiveDashboard } from '@/components/dashboard/ExecutiveDashboard';
import { useUserProfileLevel } from '@/hooks/useUserProfileLevel';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export default function Dashboard() {
  const { level, loading } = useUserProfileLevel();
  const { user, canAccessPage } = useAuth();
  const [isOwner, setIsOwner] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) { setIsOwner(false); return; }
    (async () => {
      const { data } = await (supabase as any)
        .from('user_account_access')
        .select('is_owner')
        .eq('user_id', user.id)
        .eq('is_owner', true)
        .maybeSingle();
      if (!cancelled) setIsOwner(!!data);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const subtitles: Record<typeof level, string> = {
    agent: 'Sua performance pessoal em tempo real',
    manager: 'Visão gerencial da equipe e serviços',
    executive: 'Visão executiva completa da operação',
  };

  // Donos de Empresa/Sub-empresa abrem direto no Dashboard CEO
  if (isOwner && canAccessPage('ceo')) {
    return <Navigate to="/ceo" replace />;
  }

  return (
    <AppLayout title="Dashboard" subtitle={subtitles[level]}>
      {loading || isOwner === null ? (
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
