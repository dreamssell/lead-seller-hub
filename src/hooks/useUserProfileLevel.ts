import { useIsSupervisor } from './useIsSupervisor';
import { usePlatformOwner } from './usePlatformOwner';
import { useAuth } from '@/contexts/AuthContext';

export type ProfileLevel = 'agent' | 'manager' | 'executive';

/**
 * Determines the dashboard experience for the current user:
 * - executive: platform owner, admin, diretor, or account admin
 * - manager: supervisor/coordenador
 * - agent: everyone else
 */
export function useUserProfileLevel(): { level: ProfileLevel; loading: boolean } {
  const { level: sigLevel } = useIsSupervisor();
  const { isOwner, loading: ownerLoading } = usePlatformOwner();
  const { access, accessLoading } = useAuth();

  const loading = ownerLoading || accessLoading;

  if (isOwner || sigLevel === 'admin' || sigLevel === 'diretor' || access?.is_account_admin) {
    return { level: 'executive', loading };
  }
  if (sigLevel === 'supervisor' || sigLevel === 'coordenador') {
    return { level: 'manager', loading };
  }
  return { level: 'agent', loading };
}
