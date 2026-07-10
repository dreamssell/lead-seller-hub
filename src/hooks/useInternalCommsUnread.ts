import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Contador global e por conversa de mensagens não lidas na Comunicação Interna.
 * - Total exibido no card do Dashboard.
 * - Mapa peer_id → count usado na página /internal-comms.
 * - Realtime via postgres_changes na tabela internal_messages.
 */
export function useInternalCommsUnread() {
  const { user } = useAuth();
  const [countByPeer, setCountByPeer] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    if (!user) { setCountByPeer({}); return; }
    const { data, error } = await (supabase as any).rpc('internal_comms_unread_counts');
    if (error) return;
    const map: Record<string, number> = {};
    (data || []).forEach((row: any) => { map[row.peer_id] = Number(row.unread_count) || 0; });
    setCountByPeer(map);
  }, [user?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`internal_unread:${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'internal_messages',
        filter: `recipient_id=eq.${user.id}`,
      }, (payload) => {
        const msg = payload.new as any;
        setCountByPeer((prev) => ({ ...prev, [msg.sender_id]: (prev[msg.sender_id] || 0) + 1 }));
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'internal_messages',
        filter: `recipient_id=eq.${user.id}`,
      }, () => { void refresh(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, refresh]);

  const total = Object.values(countByPeer).reduce((a, b) => a + b, 0);
  const clearPeer = useCallback((peerId: string) => {
    setCountByPeer((prev) => { if (!prev[peerId]) return prev; const n = { ...prev }; delete n[peerId]; return n; });
  }, []);

  return { total, countByPeer, refresh, clearPeer };
}
