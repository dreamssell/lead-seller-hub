import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface InternalMember {
  user_id: string;
  display_name: string;
  email: string | null;
  avatar_url?: string | null;
  is_account_admin?: boolean;
}

export interface InternalMessage {
  id: string;
  owner_id: string;
  sub_company_id: string | null;
  sender_id: string;
  recipient_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
}

/**
 * Hook central da Comunicação Interna.
 * Escopo: mesmo owner_id (Empresa) e mesmo sub_company_id (quando aplicável).
 * Realtime: postgres_changes na tabela internal_messages.
 */
export function useInternalComms() {
  const { user, access } = useAuth();
  const [members, setMembers] = useState<InternalMember[]>([]);
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [activePeerId, setActivePeerId] = useState<string | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const meRef = useRef<string | null>(null);
  meRef.current = user?.id || null;

  const ownerId = access?.owner_id || null;
  const subCompanyId = (access as any)?.sub_company_id ?? null;

  // Load members in the same scope
  useEffect(() => {
    let cancelled = false;
    if (!user || !ownerId) { setMembers([]); setLoadingMembers(false); return; }
    setLoadingMembers(true);
    (async () => {
      let query = supabase
        .from('user_account_access')
        .select('user_id, is_account_admin, sub_company_id')
        .eq('owner_id', ownerId);
      query = subCompanyId
        ? query.eq('sub_company_id', subCompanyId)
        : query.is('sub_company_id', null);
      const { data: rows } = await query;
      if (cancelled) return;
      const ids = Array.from(new Set((rows || []).map((r: any) => r.user_id))).filter((id) => id !== user.id);
      if (ids.length === 0) { setMembers([]); setLoadingMembers(false); return; }
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, display_name, email, avatar_url')
        .in('user_id', ids);
      if (cancelled) return;
      const adminMap = new Map<string, boolean>((rows || []).map((r: any) => [r.user_id, !!r.is_account_admin]));
      const list: InternalMember[] = (profs || []).map((p: any) => ({
        user_id: p.user_id,
        display_name: p.display_name || p.email || 'Usuário',
        email: p.email,
        avatar_url: p.avatar_url,
        is_account_admin: adminMap.get(p.user_id) || false,
      })).sort((a, b) => a.display_name.localeCompare(b.display_name, 'pt-BR'));
      setMembers(list);
      setLoadingMembers(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, ownerId, subCompanyId]);

  // Load thread with activePeer
  useEffect(() => {
    let cancelled = false;
    if (!user || !activePeerId) { setMessages([]); return; }
    setLoadingMessages(true);
    (async () => {
      const { data } = await supabase
        .from('internal_messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${activePeerId}),and(sender_id.eq.${activePeerId},recipient_id.eq.${user.id})`)
        .order('created_at', { ascending: true })
        .limit(500);
      if (cancelled) return;
      setMessages((data as any[]) || []);
      setLoadingMessages(false);
      // Mark unread received as read
      await supabase
        .from('internal_messages')
        .update({ read_at: new Date().toISOString() })
        .eq('recipient_id', user.id)
        .eq('sender_id', activePeerId)
        .is('read_at', null);
    })();
    return () => { cancelled = true; };
  }, [user?.id, activePeerId]);

  // Realtime: any new message where I'm participant
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`internal_messages:${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'internal_messages',
        filter: `recipient_id=eq.${user.id}`,
      }, (payload) => {
        const msg = payload.new as InternalMessage;
        if (activePeerId && msg.sender_id === activePeerId) {
          setMessages((prev) => [...prev, msg]);
        }
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'internal_messages',
        filter: `sender_id=eq.${user.id}`,
      }, (payload) => {
        const msg = payload.new as InternalMessage;
        if (activePeerId && msg.recipient_id === activePeerId) {
          setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, activePeerId]);

  const sendMessage = useCallback(async (content: string) => {
    const text = content.trim();
    if (!text || !user || !activePeerId || !ownerId) return { error: 'missing_context' };
    const { data, error } = await supabase
      .from('internal_messages')
      .insert({
        owner_id: ownerId,
        sub_company_id: subCompanyId,
        sender_id: user.id,
        recipient_id: activePeerId,
        content: text,
      })
      .select()
      .single();
    if (error) return { error: error.message };
    setMessages((prev) => prev.some((m) => m.id === (data as any).id) ? prev : [...prev, data as any]);
    return { data };
  }, [user?.id, activePeerId, ownerId, subCompanyId]);

  const activePeer = useMemo(() => members.find((m) => m.user_id === activePeerId) || null, [members, activePeerId]);

  return {
    members, loadingMembers,
    messages, loadingMessages,
    activePeerId, setActivePeerId, activePeer,
    sendMessage,
    me: user,
  };
}
