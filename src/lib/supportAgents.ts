import { supabase } from '@/integrations/supabase/client';

export type SupportAgent = { user_id: string; display_name: string | null; email: string | null };

/**
 * Responsáveis possíveis por um ticket master: os administradores da plataforma
 * mais os membros vinculados à conta do dono (ex.: Gestor, Vendedor).
 */
export async function loadSupportAgents(currentUserId?: string | null): Promise<SupportAgent[]> {
  const [{ data: admins }, { data: members }] = await Promise.all([
    supabase.from('user_roles').select('user_id').eq('role', 'admin' as any),
    currentUserId
      ? supabase.from('user_account_access').select('user_id').eq('owner_id', currentUserId)
      : Promise.resolve({ data: [] as any[] } as any),
  ]);

  const ids = Array.from(new Set([
    ...(admins || []).map((r: any) => r.user_id),
    ...((members as any[]) || []).map((r: any) => r.user_id),
    ...(currentUserId ? [currentUserId] : []),
  ].filter(Boolean)));

  if (!ids.length) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, display_name, email')
    .in('user_id', ids);

  const byId = new Map((profiles || []).map((p: any) => [p.user_id, p]));
  return ids.map((id) => ({
    user_id: id,
    display_name: byId.get(id)?.display_name ?? null,
    email: byId.get(id)?.email ?? null,
  })).sort((a, b) => (a.display_name || a.email || '').localeCompare(b.display_name || b.email || ''));
}
