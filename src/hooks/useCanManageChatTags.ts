import { useUserProfileLevel } from './useUserProfileLevel';

/**
 * Permite criar/editar/excluir Tags do WhatsApp somente para:
 *  - Donos da plataforma / admin / diretor / account admin (executive)
 *  - Supervisor / coordenador (manager)
 * Usuários "agent" apenas visualizam e aplicam as tags nos atendimentos.
 */
export function useCanManageChatTags(): { canManage: boolean; loading: boolean } {
  const { level, loading } = useUserProfileLevel();
  return { canManage: level === 'executive' || level === 'manager', loading };
}
