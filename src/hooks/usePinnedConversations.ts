import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function usePinnedConversations() {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('pinned_conversations').select('customer_id');
    setIds(new Set(((data as any) || []).map((r: any) => r.customer_id)));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggle = async (customerId: string) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    if (ids.has(customerId)) {
      await supabase.from('pinned_conversations').delete().eq('customer_id', customerId).eq('user_id', u.user.id);
      setIds(prev => { const next = new Set(prev); next.delete(customerId); return next; });
    } else {
      await supabase.from('pinned_conversations').insert({ user_id: u.user.id, customer_id: customerId });
      setIds(prev => new Set(prev).add(customerId));
    }
  };

  return { pinnedIds: ids, isPinned: (id: string) => ids.has(id), togglePin: toggle, loading, reload: load };
}
