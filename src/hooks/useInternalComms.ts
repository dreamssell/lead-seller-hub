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
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_mime?: string | null;
  attachment_size?: number | null;
  attachment_kind?: 'image' | 'audio' | 'file' | null;
  audio_duration_ms?: number | null;
}

export interface OutgoingAttachment {
  file: Blob;
  filename: string;
  mime: string;
  size: number;
  kind: 'image' | 'audio' | 'file';
  durationMs?: number;
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

  // Load members in the same scope via SECURITY DEFINER RPC (contorna RLS restritiva de user_account_access).
  // Vale para toda Empresa e Sub-empresa — inclui o dono da conta automaticamente.
  useEffect(() => {
    let cancelled = false;
    if (!user || !ownerId) { setMembers([]); setLoadingMembers(false); return; }
    setLoadingMembers(true);
    (async () => {
      const { data, error } = await supabase.rpc('list_internal_comms_members' as any);
      if (cancelled) return;
      if (error) {
        console.error('[internal-comms] falha ao listar colegas', error);
        setMembers([]); setLoadingMembers(false); return;
      }
      const list: InternalMember[] = ((data as any[]) || []).map((r) => ({
        user_id: r.user_id,
        display_name: r.display_name || r.email || 'Usuário',
        email: r.email,
        avatar_url: r.avatar_url,
        is_account_admin: !!r.is_account_admin,
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
        // Hardening cross-tenant: descarta qualquer payload que não pertença
        // ao owner/sub-empresa do usuário atual (defesa em profundidade contra
        // eventos forjados via canal público do Realtime).
        if (msg.owner_id !== ownerId) return;
        if ((msg.sub_company_id ?? null) !== (subCompanyId ?? null)) return;
        if (activePeerId && msg.sender_id === activePeerId) {
          setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
        }
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'internal_messages',
        filter: `sender_id=eq.${user.id}`,
      }, (payload) => {
        const msg = payload.new as InternalMessage;
        if (msg.owner_id !== ownerId) return;
        if ((msg.sub_company_id ?? null) !== (subCompanyId ?? null)) return;
        if (activePeerId && msg.recipient_id === activePeerId) {
          setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, activePeerId, ownerId, subCompanyId]);

  const sendMessage = useCallback(async (content: string, attachment?: OutgoingAttachment | null) => {
    const text = (content || '').trim();
    if (!user || !activePeerId || !ownerId) return { error: 'missing_context' };
    if (!text && !attachment) return { error: 'empty_message' };

    let attachment_url: string | null = null;
    let attachment_name: string | null = null;
    let attachment_mime: string | null = null;
    let attachment_size: number | null = null;
    let attachment_kind: 'image' | 'audio' | 'file' | null = null;
    let audio_duration_ms: number | null = null;

    if (attachment) {
      const now = new Date();
      const ext = (attachment.filename.match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase();
      const safeExt = ext || (attachment.mime.startsWith('audio/') ? '.webm' : '');
      const subSeg = subCompanyId || 'root';
      const uid = (crypto as any)?.randomUUID?.() || Math.random().toString(36).slice(2);
      const key = `${ownerId}/${subSeg}/${user.id}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${uid}${safeExt}`;
      const { error: upErr } = await supabase.storage
        .from('internal-comms')
        .upload(key, attachment.file, { contentType: attachment.mime, upsert: false });
      if (upErr) return { error: `upload_failed: ${upErr.message}` };
      attachment_url = key;
      attachment_name = attachment.filename;
      attachment_mime = attachment.mime;
      attachment_size = attachment.size;
      attachment_kind = attachment.kind;
      audio_duration_ms = attachment.durationMs ?? null;
    }

    const { data, error } = await supabase
      .from('internal_messages')
      .insert({
        owner_id: ownerId,
        sub_company_id: subCompanyId,
        sender_id: user.id,
        recipient_id: activePeerId,
        content: text || '',
        attachment_url,
        attachment_name,
        attachment_mime,
        attachment_size,
        attachment_kind,
        audio_duration_ms,
      } as any)
      .select()
      .single();
    if (error) {
      // Rollback do arquivo se o INSERT falhar (evita órfãos no bucket).
      if (attachment_url) {
        try { await supabase.storage.from('internal-comms').remove([attachment_url]); } catch {}
      }
      return { error: error.message };
    }
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
