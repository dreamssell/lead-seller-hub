import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatformOwner } from './usePlatformOwner';
import { useIsSupervisor } from './useIsSupervisor';

export type RoleSource = 'db_profile' | 'jwt_claim' | 'auth_context' | 'signature_role' | 'default';

export interface RoleLabelSources {
  db_profile: string | null;
  jwt_claim: string | null;
  auth_context: string | null;
  signature_role: string | null;
}

export interface UserRoleLabel {
  label: string;
  source: RoleSource;
  sources: RoleLabelSources;
  loading: boolean;
}

/**
 * Verificação unificada do papel do usuário (role_label) para uso em todas as telas.
 * Consolida as diferentes fontes possíveis e informa qual delas foi utilizada,
 * permitindo auditoria em tempo real (ver card em ProfilePage).
 *
 * Ordem de precedência: db_profile → jwt_claim → signature_role → auth_context → default
 */
export function useUserRoleLabel(): UserRoleLabel {
  const { user, access, accessLoading } = useAuth();
  const { isOwner, loading: ownerLoading } = usePlatformOwner();
  const { level: sigLevel } = useIsSupervisor();
  const [dbLabel, setDbLabel] = useState<string | null>(null);
  const [dbLoading, setDbLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setDbLabel(null);
      setDbLoading(false);
      return;
    }
    setDbLoading(true);
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('role_label')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      setDbLabel((data?.role_label ?? null) as string | null);
      setDbLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const jwtClaim =
    ((user?.app_metadata as any)?.role_label as string | null) ??
    ((user?.user_metadata as any)?.role_label as string | null) ??
    null;

  const signatureRole = sigLevel && sigLevel !== 'agente'
    ? sigLevel.charAt(0).toUpperCase() + sigLevel.slice(1)
    : null;

  const authContextLabel = isOwner
    ? 'Dono da Plataforma'
    : access?.is_account_admin
      ? 'CEO'
      : null;

  const sources: RoleLabelSources = {
    db_profile: dbLabel,
    jwt_claim: jwtClaim,
    auth_context: authContextLabel,
    signature_role: signatureRole,
  };

  let label = 'Atendente';
  let source: RoleSource = 'default';

  if (dbLabel) { label = dbLabel; source = 'db_profile'; }
  else if (jwtClaim) { label = jwtClaim; source = 'jwt_claim'; }
  else if (signatureRole) { label = signatureRole; source = 'signature_role'; }
  else if (authContextLabel) { label = authContextLabel; source = 'auth_context'; }

  return {
    label,
    source,
    sources,
    loading: dbLoading || accessLoading || ownerLoading,
  };
}
