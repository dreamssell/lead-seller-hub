import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MentionUser {
  user_id: string;
  email: string;
  display_name: string | null;
  handle: string;
}

export function useMentionSuggestions(ownerId: string | null) {
  const [users, setUsers] = useState<MentionUser[]>([]);
  useEffect(() => {
    if (!ownerId) return;
    (async () => {
      const { data: access } = await supabase
        .from('user_account_access')
        .select('user_id')
        .eq('owner_id', ownerId);
      const ids = Array.from(new Set([ownerId, ...(access?.map((a) => a.user_id) || [])]));
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, email, display_name')
        .in('user_id', ids);
      setUsers(
        (profiles || []).map((p) => ({
          user_id: p.user_id,
          email: p.email || '',
          display_name: p.display_name,
          handle: (p.email || '').split('@')[0] || (p.display_name || '').replace(/\s+/g, '').toLowerCase(),
        })),
      );
    })();
  }, [ownerId]);
  return users;
}
