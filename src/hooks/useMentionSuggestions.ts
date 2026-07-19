import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MentionUser {
  user_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  handle: string;
}

function buildHandle(email: string | null, displayName: string | null): string {
  const emailPart = (email || '').split('@')[0];
  if (emailPart) return emailPart.toLowerCase();
  const fromName = (displayName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').toLowerCase();
  return fromName || 'usuario';
}

export function useMentionSuggestions(ownerId: string | null) {
  const [users, setUsers] = useState<MentionUser[]>([]);

  useEffect(() => {
    if (!ownerId) { setUsers([]); return; }
    let cancelled = false;

    (async () => {
      // Prefer secure RPC that bypasses per-row RLS on profiles/user_account_access
      // and returns every active teammate in the same tenant (owner + members).
      const { data, error } = await (supabase as any).rpc('list_mentionable_users', { _owner_id: ownerId });

      if (!cancelled && !error && Array.isArray(data)) {
        setUsers(
          data.map((p: any) => ({
            user_id: p.user_id,
            email: p.email || '',
            display_name: p.display_name,
            avatar_url: p.avatar_url ?? null,
            handle: buildHandle(p.email, p.display_name),
          })),
        );
        return;
      }

      // Fallback (older backends): try legacy client-side join.
      const { data: access } = await supabase
        .from('user_account_access')
        .select('user_id')
        .eq('owner_id', ownerId);
      const ids = Array.from(new Set([ownerId, ...((access || []).map((a: any) => a.user_id))]));
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, email, display_name, avatar_url, is_active')
        .in('user_id', ids);
      if (cancelled) return;
      setUsers(
        (profiles || [])
          .filter((p: any) => p.is_active !== false)
          .map((p: any) => ({
            user_id: p.user_id,
            email: p.email || '',
            display_name: p.display_name,
            avatar_url: p.avatar_url ?? null,
            handle: buildHandle(p.email, p.display_name),
          })),
      );
    })();

    return () => { cancelled = true; };
  }, [ownerId]);

  return users;
}
