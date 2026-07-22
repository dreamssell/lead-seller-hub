/**
 * FocusedChatPage — ambiente premium standalone do WhatsApp.
 *
 * Recursos adicionados nesta iteração:
 *  - Painel lateral direito persistido na URL (?tool=...) — sobrevive a reload.
 *  - Marcação automática de "lido" ao abrir uma conversa, com sincronização
 *    entre múltiplas abas (BroadcastChannel + storage). Contadores de não-lidas
 *    são recomputados a partir do último timestamp lido.
 *  - Paginação sob demanda + virtualização (@tanstack/react-virtual) do
 *    histórico de mensagens: apenas as últimas N mensagens são carregadas
 *    inicialmente; ao rolar para o topo, páginas anteriores são buscadas.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MessageCircle, Search, Info, Images, Pin, Star, StickyNote,
  Bot, Clock8, X, Minimize2, Wifi, WifiOff, CheckCheck, Check, Loader2, Eye, Contact2, Plus, Inbox, ArrowLeftRight, Phone,
} from 'lucide-react';
import { useVoip } from '@/contexts/VoipContext';
import { useWavoipWebphone } from '@/contexts/WavoipWebphoneContext';
import { useVirtualizer } from '@tanstack/react-virtual';
import { supabase } from '@/integrations/supabase/client';
import {
  getCachedConvs, setCachedConvs,
  getCachedMessages, setCachedMessages,
} from '@/lib/chatCache';
import {
  getAllLastReads, markRead, subscribeReadEvents, getReaders,
  type ReaderEntry,
} from '@/lib/chatReadTracker';
import { useAuth } from '@/contexts/AuthContext';
import { useIsSupervisor } from '@/hooks/useIsSupervisor';
import { Input } from '@/components/ui/input';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import { logCallUi, callTelemetryUrl } from '@/lib/callTelemetry';
import { startRealtimeTimer } from '@/lib/perfTelemetry';
import { CallEventFailedIndicator } from '@/components/chat/CallEventFailedIndicator';
import { usePlatformOwner } from '@/hooks/usePlatformOwner';
import { renderWhatsAppText } from '@/lib/whatsappFormat';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { ChatRightPanel } from '@/components/chat/ChatRightPanel';
import { MediaGallery } from '@/components/chat/MediaGallery';
import { StarredMessagesPanel } from '@/components/chat/StarredMessagesPanel';
import { AIInsightsPanel } from '@/components/chat/AIInsightsPanel';
import { Customer360Timeline } from '@/components/chat/Customer360Timeline';
import { MessageSearchDialog, type MessageSearchHit } from '@/components/chat/MessageSearchDialog';
import { MediaDropzone } from '@/components/chat/MediaDropzone';
import { CallEventBubble, isCallEventMessage } from '@/components/chat/CallEventBubble';
import { InternalNoticeBubble, isInternalNoticeMessage } from '@/components/chat/InternalNoticeBubble';
import { ContactsDialog } from '@/components/chat/ContactsDialog';
import { NewConversationDialog } from '@/components/chat/NewConversationDialog';
import { AttendanceFlowDialog } from '@/components/chat/AttendanceFlowDialog';
import { MoveToFlowMenu } from '@/components/chat/MoveToFlowMenu';
import { TransferConversationDialog } from '@/components/chat/TransferConversationDialog';

import { getProviderAdapter } from '@/components/whatsapp/adapters';
import type { WhatsAppConnection } from '@/components/whatsapp/types';

type Tool = null | 'info' | 'media' | 'pinned' | 'starred' | 'notes' | 'ai' | 'timeline';
const VALID_TOOLS: ReadonlyArray<Exclude<Tool, null>> =
  ['info', 'media', 'pinned', 'starred', 'notes', 'ai', 'timeline'];

/** Página inicial do histórico e tamanho de cada lote de mensagens antigas. */
const PAGE_SIZE = 60;

interface Conversation {
  id: string;
  name: string;
  phone: string | null;
  avatar_url: string | null;
  presence: string | null;
  last_message: string;
  last_at: string | null;
  unread: number;
}

interface Msg {
  id: string;
  customer_id: string;
  sender_type: string;
  content: string;
  metadata: any;
  created_at: string;
  uaz_msg_id?: string | null;
  client_msg_id?: string | null;
}

function initials(name: string) {
  return (name || '?').trim().split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

function formatTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function computeUnread(latestAt: string | null, lastRead: string | null): number {
  // Aproximação leve: exibimos "1+" quando há mensagem posterior à última leitura,
  // e 0 caso contrário. O contador exato por número absoluto é calculado no
  // fetch inicial da lista (a partir das últimas mensagens já carregadas).
  if (!latestAt) return 0;
  if (!lastRead) return 1;
  return latestAt > lastRead ? 1 : 0;
}

export default function FocusedChatPage() {
  const { user } = useAuth();
  const { isSupervisor, userId: supervisorUserId } = useIsSupervisor();
  const { isOwner } = usePlatformOwner();
  const [params, setParams] = useSearchParams();
  const initialConv = params.get('c');
  const initialToolParam = params.get('tool');
  const initialTool: Tool = (VALID_TOOLS as ReadonlyArray<string>).includes(initialToolParam || '')
    ? (initialToolParam as Tool) : null;

  const [convs, setConvs] = useState<Conversation[]>([]);
  const CONV_PAGE_SIZE = 200;
  const [convLimit, setConvLimit] = useState(CONV_PAGE_SIZE);
  const [convHasMore, setConvHasMore] = useState(false);
  const convLimitRef = useRef(CONV_PAGE_SIZE);
  useEffect(() => { convLimitRef.current = convLimit; }, [convLimit]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(initialConv);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [msgFilter, setMsgFilter] = useState<'all' | 'client' | 'notes'>('all');

  const [loading, setLoading] = useState(true);
  const [conn, setConn] = useState<WhatsAppConnection | null>(null);
  const [connOnline, setConnOnline] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [tool, setTool] = useState<Tool>(initialTool);
  const [olderLoading, setOlderLoading] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [readers, setReaders] = useState<ReaderEntry[]>([]);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const keepScrollAnchor = useRef<{ prevHeight: number; prevTop: number } | null>(null);

  const readerInfo = useMemo(() => user ? ({
    id: user.id,
    label: (user as any).user_metadata?.full_name || user.email || 'Você',
    avatarUrl: (user as any).user_metadata?.avatar_url || null,
  }) : null, [user]);

  const selectedConv = useMemo(() => convs.find(c => c.id === selected) || null, [convs, selected]);

  // VoIP (SIP) + Wavoip (WhatsApp call) integrations for header dial buttons.
  const voip = useVoip();
  const wavoip = useWavoipWebphone();

  // Realtime detection of "line busy": any user in the current tenant scope
  // currently on a Wavoip call. RLS already limits rows to the same tenant.
  const [lineBusy, setLineBusy] = useState(false);
  // "Wait & notify" — quando a linha está ocupada e o usuário clica em
  // "Aguardar", armamos um watcher que dispara um toast assim que a linha
  // volta a ficar livre. Um toast único (id fixo) evita spam.
  const waitingForLineRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const { count } = await (supabase as any)
          .from('wavoip_line_state')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'in_call');
        if (cancelled) return;
        const busy = (count ?? 0) > 0;
        setLineBusy((prev) => {
          if (prev !== busy) {
            logCallUi({
              event: 'line_busy_change',
              metadata: { from: prev, to: busy, count: count ?? 0 },
            });
            // Se estávamos aguardando e a linha ficou livre → avisa o usuário.
            if (prev && !busy && waitingForLineRef.current) {
              waitingForLineRef.current = false;
              logCallUi({ event: 'line_wait_fired' });
              sonnerToast.success('Linha Wavoip livre', {
                id: 'wavoip-line-wait',
                description: 'A linha está disponível agora. Você pode ligar.',
                duration: 6000,
              });
            }
          }
          return busy;
        });
      } catch { /* ignore — never break chat UI */ }
    };
    refresh();
    const ch = (supabase as any)
      .channel('wavoip-line-state-focused')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wavoip_line_state' }, refresh)
      .subscribe();
    const iv = setInterval(refresh, 15000);
    return () => { cancelled = true; clearInterval(iv); try { (supabase as any).removeChannel(ch); } catch {} };
  }, []);

  const dialSip = useCallback(async (phone?: string | null) => {
    const target = (phone || '').replace(/\D/g, '');
    const corr = await logCallUi({ event: 'sip_click', metadata: { hasPhone: !!target, sipStatus: voip.status } });
    if (!target) {
      logCallUi({ event: 'sip_no_phone', correlationId: corr });
      toast({ title: 'Contato sem telefone', variant: 'destructive' as any });
      return;
    }
    if (voip.status !== 'connected') {
      logCallUi({ event: 'sip_blocked_disconnected', correlationId: corr, metadata: { sipStatus: voip.status } });
      toast({ title: 'SIP não conectado', description: 'Configure o ramal SIP para realizar ligações VoIP.' });
      return;
    }
    logCallUi({ event: 'sip_dial_start', correlationId: corr, metadata: { target: target.slice(-4) } });
    voip.makeCall(target);
  }, [voip]);

  const dialWhatsApp = useCallback(async (phone?: string | null) => {
    const target = (phone || '').replace(/\D/g, '');
    const corr = await logCallUi({ event: 'wa_click', metadata: { hasPhone: !!target, lineBusy } });
    if (!target) {
      logCallUi({ event: 'wa_no_phone', correlationId: corr });
      toast({ title: 'Contato sem telefone', variant: 'destructive' as any });
      return;
    }
    if (lineBusy) {
      logCallUi({ event: 'wa_blocked_busy', correlationId: corr });
      // Toast não intrusivo (sonner) com ação "Aguardar" — arma um watcher
      // que dispara uma notificação assim que a linha for liberada.
      // Owner enxerga o correlation_id + link direto para o painel de telemetria.
      const shortCorr = corr.slice(0, 8);
      sonnerToast('Linha Wavoip ocupada', {
        id: 'wavoip-line-busy',
        description: isOwner
          ? `Outro usuário está em ligação. Aguarde a linha ficar livre. · corr ${shortCorr}`
          : 'Outro usuário está em ligação. Aguarde a linha ficar livre.',
        action: {
          label: 'Aguardar',
          onClick: () => {
            waitingForLineRef.current = true;
            logCallUi({ event: 'line_wait_armed', correlationId: corr });
            sonnerToast('Aguardando linha…', {
              id: 'wavoip-line-wait',
              description: 'Vamos avisar assim que a linha ficar disponível.',
              duration: 4000,
            });
          },
        },
        // Owners recebem um segundo botão que abre a página de telemetria já
        // filtrada por este correlation_id — direto ao ponto de auditoria.
        ...(isOwner
          ? {
              cancel: {
                label: 'Abrir telemetria',
                onClick: () => window.open(callTelemetryUrl(corr), '_blank', 'noopener'),
              },
            }
          : {}),
        duration: 6000,
      });
      return;
    }
    logCallUi({ event: 'wa_dial_start', correlationId: corr, metadata: { target: target.slice(-4) } });
    try {
      const ok = await wavoip.callWhatsApp(target, undefined, {
        customer_id: selectedConv?.id,
        customer_name: selectedConv?.name,
      } as any);
      if (!ok) {
        logCallUi({ event: 'wa_dial_fail', correlationId: corr, metadata: { reason: 'callWhatsApp_returned_false' } });
        toast({ title: 'Falha ao iniciar ligação', description: 'Verifique o pareamento Wavoip.' });
      } else {
        logCallUi({ event: 'wa_dial_ok', correlationId: corr });
      }
    } catch (e: any) {
      logCallUi({ event: 'wa_dial_fail', correlationId: corr, metadata: { reason: String(e?.message || e) } });
      toast({ title: 'Erro Wavoip', description: e?.message || 'Falha ao iniciar ligação.', variant: 'destructive' as any });
    }
  }, [wavoip, selectedConv, lineBusy, isOwner]);

  // Load first active WhatsApp connection.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // IMPORTANT: restrict to real WhatsApp providers. Wavoip is a VoIP
      // connection (used by the softphone) — if we pick it here the send
      // silently no-ops through WavoipAdapter's placeholder and the message
      // never reaches WhatsApp, which is exactly what caused CEO/Olenir's
      // sends to "disappear" while Adriele's went through.
      const WHATSAPP_PROVIDERS = ['waha', 'evolution', 'meta', 'uaz'] as const;
      const { data } = await supabase
        .from('whatsapp_connections')
        .select('*')
        .in('provider', WHATSAPP_PROVIDERS)
        .order('created_at', { ascending: false });
      if (cancelled || !data?.length) return;
      const active = (data as WhatsAppConnection[]).find(c => c.status === 'connected') || data[0] as WhatsAppConnection;
      setConn(active);
      setConnOnline(active.status === 'connected');
    })();
    return () => { cancelled = true; };
  }, []);

  // Load conversation list (customers with last message).
  const loadConvs = useCallback(async () => {
    const reads = getAllLastReads(user?.id);
    // Hidratação instantânea a partir do cache local (IndexedDB).
    try {
      const cached = await getCachedConvs<Conversation>(user?.id, 'whatsapp');
      if (cached?.length) {
        const hydrated = cached.map(c => ({ ...c, unread: computeUnread(c.last_at, reads[c.id] || null) }));
        setConvs(hydrated);
        setLoading(false);
      } else setLoading(true);
    } catch { setLoading(true); }
    const currentLimit = convLimitRef.current || CONV_PAGE_SIZE;
    const { data: customersRaw } = await supabase
      .from('customers')
      .select('id,name,phone,avatar_url,presence,is_archived')
      .eq('channel', 'whatsapp')
      .order('updated_at', { ascending: false })
      .limit(currentLimit + 1);
    if (!customersRaw) { setLoading(false); return; }
    const hasMore = customersRaw.length > currentLimit;
    setConvHasMore(hasMore);
    const customers = hasMore ? customersRaw.slice(0, currentLimit) : customersRaw;
    const ids = customers.map(c => c.id);
    const { data: lastMsgs } = await supabase
      .from('chat_messages')
      .select('customer_id,content,created_at,sender_type')
      .in('customer_id', ids)
      .order('created_at', { ascending: false })
      .limit(500);
    const lastByCustomer = new Map<string, { content: string; created_at: string }>();
    (lastMsgs || []).forEach((m: any) => {
      if (!lastByCustomer.has(m.customer_id)) {
        lastByCustomer.set(m.customer_id, { content: m.content, created_at: m.created_at });
      }
    });
    // Oculta conversas com assignment aberto atribuído a outro usuário
    // (visão do atendente). Supervisores continuam vendo tudo.
    const assignmentByCustomer = new Map<string, { assigned_to: string | null }>();
    if (ids.length) {
      const { data: assigns } = await supabase
        .from('lead_assignments')
        .select('customer_id, assigned_to, stage, assigned_at')
        .in('customer_id', ids)
        .neq('stage', 'closed')
        .order('assigned_at', { ascending: false });
      (assigns || []).forEach((a: any) => {
        if (!assignmentByCustomer.has(a.customer_id)) {
          assignmentByCustomer.set(a.customer_id, { assigned_to: a.assigned_to });
        }
      });
    }
    const meId = supervisorUserId || user?.id || null;
    const list: Conversation[] = customers
      .filter((c: any) => !c.is_archived)
      .filter((c: any) => {
        if (isSupervisor) return true;
        const asg = assignmentByCustomer.get(c.id);
        if (!asg || !asg.assigned_to) return true;
        return asg.assigned_to === meId;
      })
      .map((c: any) => ({
        id: c.id,
        name: c.name || c.phone || 'Sem nome',
        phone: c.phone,
        avatar_url: c.avatar_url,
        presence: c.presence,
        last_message: lastByCustomer.get(c.id)?.content?.slice(0, 80) || 'Sem mensagem ainda',
        last_at: lastByCustomer.get(c.id)?.created_at || null,
        unread: computeUnread(lastByCustomer.get(c.id)?.created_at || null, reads[c.id] || null),
      }))
      .sort((a, b) => (b.last_at || '').localeCompare(a.last_at || ''));
    setConvs(list);
    setLoading(false);
    void setCachedConvs(user?.id, 'whatsapp', list);
  }, [user?.id, isSupervisor, supervisorUserId]);

  useEffect(() => { loadConvs(); }, [loadConvs, convLimit]);

  // Load messages (last PAGE_SIZE) for selected conversation.
  const loadMessages = useCallback(async (cid: string) => {
    setHasMoreOlder(true);
    // Hidratação instantânea via cache; delta fetch atualiza gradualmente.
    const cached = await getCachedMessages<Msg>(user?.id, cid);
    if (cached?.items?.length) {
      const tail = cached.items.slice(-PAGE_SIZE);
      setMsgs(tail);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' });
      });
    } else {
      setMsgs([]);
    }
    // Busca as N mais recentes por padrão (order desc + reverse).
    const { data: latest } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('customer_id', cid)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    const fetched = ((latest as Msg[]) || []).slice().reverse();
    if (fetched.length < PAGE_SIZE) setHasMoreOlder(false);
    setMsgs(fetched);
    // Cache com o histórico já conhecido (mescla mantendo únicos).
    const prev = cached?.items || [];
    const byId = new Map<string, Msg>();
    [...prev, ...fetched].forEach(m => byId.set(m.id, m));
    const merged = Array.from(byId.values()).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    void setCachedMessages(user?.id, cid, merged);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' });
    });
    // Marca como lida ao abrir (com identidade do leitor atual).
    const last = fetched[fetched.length - 1];
    if (last) markRead(user?.id, cid, last.created_at, readerInfo);
  }, [user?.id, readerInfo]);

  // Carrega uma página anterior (mensagens mais antigas) sob demanda.
  const loadOlder = useCallback(async () => {
    if (!selected || olderLoading || !hasMoreOlder || !msgs.length) return;
    setOlderLoading(true);
    const oldest = msgs[0]?.created_at;
    if (!oldest) { setOlderLoading(false); return; }
    // Preserva a posição visual do usuário depois de prepend.
    const el = scrollRef.current;
    keepScrollAnchor.current = el
      ? { prevHeight: el.scrollHeight, prevTop: el.scrollTop }
      : null;
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('customer_id', selected)
      .lt('created_at', oldest)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    const older = ((data as Msg[]) || []).slice().reverse();
    if (older.length < PAGE_SIZE) setHasMoreOlder(false);
    if (older.length) {
      setMsgs(prev => {
        const ids = new Set(prev.map(p => p.id));
        return [...older.filter(o => !ids.has(o.id)), ...prev];
      });
    }
    setOlderLoading(false);
  }, [selected, olderLoading, hasMoreOlder, msgs]);

  useEffect(() => {
    if (!selected) return;
    loadMessages(selected);
    // Persiste conversa e ferramenta na URL para sobreviver a reload.
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('c', selected);
      return p;
    }, { replace: true });
    // Zera unread local ao abrir.
    setConvs(prev => prev.map(c => c.id === selected ? { ...c, unread: 0 } : c));
  }, [selected, loadMessages, setParams]);

  // Persiste a ferramenta ativa na URL.
  useEffect(() => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (tool) p.set('tool', tool);
      else p.delete('tool');
      return p;
    }, { replace: true });
  }, [tool, setParams]);

  // Realtime: new/updated messages arrive silently in background.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('focused-chat')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const m = payload.new as Msg;
          const isOpen = selected === m.customer_id;
          setConvs(prev => {
            const idx = prev.findIndex(c => c.id === m.customer_id);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = {
              ...next[idx],
              last_message: (m.content || '').slice(0, 80),
              last_at: m.created_at,
              unread: isOpen ? 0 : next[idx].unread + (m.sender_type === 'client' ? 1 : 0),
            };
            next.sort((a, b) => (b.last_at || '').localeCompare(a.last_at || ''));
            return next;
          });
          if (isOpen) {
            setMsgs(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m]));
            markRead(user.id, m.customer_id, m.created_at, readerInfo);
            requestAnimationFrame(() => {
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
            });
          }
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const m = payload.new as Msg;
          if (m.customer_id !== selected) return;
          setMsgs(prev => prev.map(x => x.id === m.id ? m : x));
        })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'lead_assignments' },
        () => { loadConvs(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, selected, readerInfo]);

  // Sincroniza contadores de não-lidas e ledger de leitores entre abas.
  useEffect(() => {
    return subscribeReadEvents((e) => {
      if (e.ownerId !== user?.id) return;
      setConvs(prev => prev.map(c =>
        c.id === e.customerId ? { ...c, unread: computeUnread(c.last_at, e.readAt) } : c,
      ));
      if (selected && e.customerId === selected) {
        setReaders(getReaders(user?.id, selected));
      }
    });
  }, [user?.id, selected]);

  // Carrega ledger de leitores ao trocar de conversa.
  useEffect(() => {
    if (!selected) { setReaders([]); return; }
    setReaders(getReaders(user?.id, selected));
  }, [selected, user?.id]);


  const handleSend = async (text: string) => {
    if (!selected || !conn) {
      toast({ title: 'Sem conexão WhatsApp ativa', variant: 'destructive' });
      throw new Error('no-conn');
    }
    const clientId = crypto.randomUUID();
    const optimistic: Msg = {
      id: clientId,
      customer_id: selected,
      sender_type: 'agent',
      content: text,
      metadata: { status: 'sending' },
      created_at: new Date().toISOString(),
      client_msg_id: clientId,
    };
    setMsgs(prev => [...prev, optimistic]);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }));
    try {
      await supabase.from('chat_messages').insert({
        customer_id: selected,
        sender_type: 'agent',
        content: text,
        channel: 'whatsapp',
        connection_id: conn.id,
        client_msg_id: clientId,
        correlation_id: clientId,
        metadata: { status: 'sending' },
      });
      const adapter = getProviderAdapter(conn.provider);
      const res = await adapter.sendMessage(conn, selected, text);
      const providerId = res?.key?.id || res?.messages?.[0]?.id || res?.id || null;
      await supabase.from('chat_messages')
        .update({ uaz_msg_id: providerId, metadata: { status: 'sent' } })
        .eq('client_msg_id', clientId);
      setMsgs(prev => prev.map(m => m.client_msg_id === clientId
        ? { ...m, uaz_msg_id: providerId, metadata: { status: 'sent' } } : m));
      // Sua própria mensagem também zera a "não-lida".
      markRead(user?.id, selected, new Date().toISOString(), readerInfo);
    } catch (err: any) {
      setMsgs(prev => prev.map(m => m.client_msg_id === clientId
        ? { ...m, metadata: { status: 'error', error: err?.message } } : m));
      toast({ title: 'Falha ao enviar', description: err?.message, variant: 'destructive' });
      throw err;
    }
  };

  const handleSendMedia = async (file: File, kind: 'image' | 'video' | 'audio' | 'document') => {
    if (!selected || !conn) {
      toast({ title: 'Sem conexão WhatsApp ativa', variant: 'destructive' });
      throw new Error('no-conn');
    }
    const adapter = getProviderAdapter(conn.provider);
    if (!adapter.sendMedia) {
      toast({ title: 'Este canal não suporta envio de mídia', variant: 'destructive' });
      throw new Error('no-media');
    }
    const clientId = crypto.randomUUID();
    const label = kind === 'audio' ? `🎤 ${file.name}` : `📎 ${file.name}`;
    const optimistic: Msg = {
      id: clientId,
      customer_id: selected,
      sender_type: 'agent',
      content: label,
      metadata: { status: 'sending', media_kind: kind, media_filename: file.name },
      created_at: new Date().toISOString(),
      client_msg_id: clientId,
    };
    setMsgs(prev => [...prev, optimistic]);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }));
    try {
      await supabase.from('chat_messages').insert({
        customer_id: selected,
        sender_type: 'agent',
        content: label,
        channel: 'whatsapp',
        connection_id: conn.id,
        client_msg_id: clientId,
        correlation_id: clientId,
        metadata: { status: 'sending', media_kind: kind, media_filename: file.name },
      });
      const res = kind === 'audio' && adapter.sendAudio
        ? await adapter.sendAudio(conn, selected, file)
        : await adapter.sendMedia(conn, selected, file, '');
      const providerId = res?.key?.id || res?.messages?.[0]?.id || res?.id || null;
      await supabase.from('chat_messages')
        .update({ uaz_msg_id: providerId, metadata: { status: 'sent', media_kind: kind, media_filename: file.name } })
        .eq('client_msg_id', clientId);
      setMsgs(prev => prev.map(m => m.client_msg_id === clientId
        ? { ...m, uaz_msg_id: providerId, metadata: { status: 'sent', media_kind: kind, media_filename: file.name } } : m));
      markRead(user?.id, selected, new Date().toISOString(), readerInfo);
    } catch (err: any) {
      setMsgs(prev => prev.map(m => m.client_msg_id === clientId
        ? { ...m, metadata: { status: 'error', error: err?.message } } : m));
      toast({ title: 'Falha ao enviar mídia', description: err?.message, variant: 'destructive' });
      throw err;
    }
  };

  const filteredConvs = useMemo(() => {
    if (!filter.trim()) return convs;
    const q = filter.toLowerCase();
    return convs.filter(c =>
      c.name.toLowerCase().includes(q)
      || (c.phone || '').toLowerCase().includes(q)
      || (c.last_message || '').toLowerCase().includes(q)
    );
  }, [convs, filter]);

  const tools: Array<{ key: Tool; icon: any; label: string }> = [
    { key: 'info', icon: Info, label: 'Informações do contato' },
    { key: 'media', icon: Images, label: 'Galeria de mídias' },
    { key: 'pinned', icon: Pin, label: 'Mensagens fixadas' },
    { key: 'starred', icon: Star, label: 'Favoritas' },
    { key: 'notes', icon: StickyNote, label: 'Notas internas e respostas rápidas' },
    { key: 'ai', icon: Bot, label: 'Insights de IA' },
    { key: 'timeline', icon: Clock8, label: 'Timeline 360°' },
  ];

  const toggleTool = (t: Tool) => setTool(prev => (prev === t ? null : t));

  // ---- Filtro (Tudo / Só cliente / Só notas internas) ---------------------
  const visibleMsgs = useMemo(() => {
    if (msgFilter === 'all') return msgs;
    return msgs.filter((m) => {
      const meta = (m as any).metadata;
      const isNote = isInternalNoticeMessage(meta);
      if (msgFilter === 'notes') return isNote;
      return !isNote && !isCallEventMessage(meta);
    });
  }, [msgs, msgFilter]);

  // ---- Virtualização do histórico ------------------------------------------
  const virtualizer = useVirtualizer({
    count: visibleMsgs.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 72,
    overscan: 8,
    getItemKey: (i) => visibleMsgs[i]?.id ?? i,
  });


  // Ao carregar mensagens antigas (prepend), preserva a posição visual do usuário.
  useEffect(() => {
    if (!keepScrollAnchor.current || !scrollRef.current) return;
    const el = scrollRef.current;
    const { prevHeight, prevTop } = keepScrollAnchor.current;
    const delta = el.scrollHeight - prevHeight;
    if (delta > 0) el.scrollTop = prevTop + delta;
    keepScrollAnchor.current = null;
  }, [msgs.length]);

  // Rolagem próxima ao topo → carrega página anterior automaticamente.
  const onMessagesScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop < 120 && hasMoreOlder && !olderLoading) {
      void loadOlder();
    }
  };

  // Atalho de teclado: Ctrl/⌘+F abre o diálogo de busca no histórico.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && selected) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  /**
   * Salta para uma mensagem específica retornada pela busca completa.
   * Carrega uma "janela" de contexto (antes + depois) sem quebrar a paginação:
   * mensagens mais antigas continuam disponíveis via botão "Carregar antigas".
   */
  const handleJumpToMessage = useCallback(async (hit: MessageSearchHit) => {
    if (!hit.customer_id) return;
    if (selected !== hit.customer_id) setSelected(hit.customer_id);
    const [{ data: before }, { data: after }] = await Promise.all([
      supabase.from('chat_messages').select('*')
        .eq('customer_id', hit.customer_id)
        .lte('created_at', hit.created_at)
        .order('created_at', { ascending: false })
        .limit(40),
      supabase.from('chat_messages').select('*')
        .eq('customer_id', hit.customer_id)
        .gt('created_at', hit.created_at)
        .order('created_at', { ascending: true })
        .limit(20),
    ]);
    const beforeAsc = ((before as Msg[]) || []).slice().reverse();
    const window = [...beforeAsc, ...((after as Msg[]) || [])];
    const byId = new Map<string, Msg>();
    window.forEach(m => byId.set(m.id, m));
    const merged = Array.from(byId.values()).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    setHasMoreOlder(true);
    setMsgs(merged);
    setPendingScrollId(hit.id);
  }, [selected]);

  // Efetiva o scroll para a mensagem alvo após o virtualizer medir.
  useEffect(() => {
    if (!pendingScrollId) return;
    const idx = msgs.findIndex(m => m.id === pendingScrollId);
    if (idx < 0) return;
    const id = window.setTimeout(() => {
      try { virtualizer.scrollToIndex(idx, { align: 'center' }); } catch {}
      setPendingScrollId(null);
    }, 40);
    return () => window.clearTimeout(id);
  }, [pendingScrollId, msgs, virtualizer]);


  return (
    <TooltipProvider delayDuration={200}>
      <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
        {/* Top bar */}
        <header className="h-14 shrink-0 border-b border-border bg-card/60 backdrop-blur-md flex items-center justify-between px-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold truncate">WhatsApp — Modo Foco</h1>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {connOnline ? <Wifi className="w-3 h-3 text-emerald-500" /> : <WifiOff className="w-3 h-3 text-destructive" />}
                <span>{conn?.display_name || 'Sem conexão'} · {connOnline ? 'online' : 'offline'}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => window.close()}
                  className="p-2 rounded-lg hover:bg-secondary text-muted-foreground"
                  aria-label="Fechar aba"
                >
                  <X className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Fechar</TooltipContent>
            </Tooltip>
          </div>
        </header>

        <div className="flex-1 flex min-h-0">
          {/* Conversation list */}
          <aside className="w-72 shrink-0 border-r border-border bg-card/40 flex flex-col">
            <div className="p-3 border-b border-border space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Buscar conversa..."
                  className="pl-8 h-9"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setNewConvOpen(true)}
                  disabled={!conn}
                  className="flex-1 h-8 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
                  title={!conn ? 'Sem conexão WhatsApp ativa' : 'Iniciar nova conversa'}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nova
                </button>
                <button
                  type="button"
                  onClick={() => setContactsOpen(true)}
                  className="flex-1 h-8 rounded-md border border-border hover:bg-secondary text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
                  title="Agenda de contatos"
                >
                  <Contact2 className="w-3.5 h-3.5" />
                  Contatos
                </button>
                <button
                  type="button"
                  onClick={() => setFlowOpen(true)}
                  className="flex-1 h-8 rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
                  title="Fluxo de atendimento (filas, distribuição, SLA)"
                >
                  <Inbox className="w-3.5 h-3.5" />
                  Fluxo
                </button>
              </div>
            </div>
            <div
              className="flex-1 overflow-y-auto chat-scroll"
              onScroll={(e) => {
                const el = e.currentTarget;
                if (!convHasMore) return;
                if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) {
                  const current = convLimitRef.current || CONV_PAGE_SIZE;
                  if ((el as any).__lastPrefetchLimit === current) return;
                  (el as any).__lastPrefetchLimit = current;
                  setConvLimit(current + CONV_PAGE_SIZE);
                }
              }}
            >
              {loading && !convs.length ? (
                <div className="p-6 text-xs text-muted-foreground text-center">Carregando...</div>
              ) : filteredConvs.length === 0 ? (
                <div className="p-6 text-xs text-muted-foreground text-center">Nenhuma conversa</div>
              ) : (
                <>
                  {filteredConvs.map(c => (
                    <div
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelected(c.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelected(c.id); }}
                      className={cn(
                        'group w-full flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/60 transition text-left border-b border-border/40 cursor-pointer',
                        selected === c.id && 'bg-primary/10 hover:bg-primary/10',
                      )}
                    >
                      <Avatar className="w-10 h-10 shrink-0">
                        <AvatarImage src={c.avatar_url || undefined} />
                        <AvatarFallback className="text-xs bg-secondary">{initials(c.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate flex items-center gap-1">
                            {c.name}
                            {(() => {
                              const msg = String((c as any).last_message || '');
                              const transferred = msg.startsWith('Conversa transferida') || msg.startsWith('Conversa movida');
                              return transferred ? (
                                <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 border-primary/40 text-primary shrink-0" title={msg}>
                                  Transferida
                                </Badge>
                              ) : null;
                            })()}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0 inline-flex items-center gap-0.5">
                            {formatTime(c.last_at)}
                            <MoveToFlowMenu customerId={c.id} />
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground truncate">{c.last_message}</span>
                          {c.unread > 0 && (
                            <Badge className="h-4 min-w-4 px-1 text-[10px] bg-emerald-500 text-white">{c.unread}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {convHasMore && (
                    <button
                      type="button"
                      onClick={() => setConvLimit((convLimitRef.current || CONV_PAGE_SIZE) + CONV_PAGE_SIZE)}
                      className="w-full py-3 text-xs text-primary hover:bg-secondary/50 border-t border-border"
                    >
                      Carregar mais conversas
                    </button>
                  )}
                </>
              )}
            </div>
          </aside>

          {/* Conversation area (main / largest) */}
          <section className="flex-1 flex flex-col min-w-0">
            {selectedConv ? (
              <>
                {/* Thread header with clickable tool icons */}
                <div className="h-14 shrink-0 border-b border-border bg-card/40 flex items-center justify-between px-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="w-9 h-9">
                      <AvatarImage src={selectedConv.avatar_url || undefined} />
                      <AvatarFallback className="text-xs bg-secondary">{initials(selectedConv.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{selectedConv.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate flex items-center gap-2">
                        <span className="truncate">
                          {selectedConv.phone || '—'} {selectedConv.presence ? `· ${selectedConv.presence}` : ''}
                        </span>
                        {readers.length > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 shrink-0 text-emerald-600 dark:text-emerald-400">
                                <Eye className="w-3 h-3" />
                                <span className="flex -space-x-1.5">
                                  {readers.slice(0, 3).map((r) => (
                                    <Avatar key={r.id} className="w-4 h-4 border border-background">
                                      <AvatarImage src={r.avatarUrl || undefined} />
                                      <AvatarFallback className="text-[8px] bg-emerald-500/20">{initials(r.label)}</AvatarFallback>
                                    </Avatar>
                                  ))}
                                </span>
                                {readers.length > 3 && <span>+{readers.length - 3}</span>}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs">
                                <div className="font-medium mb-1">Vistas por</div>
                                {readers.map(r => (
                                  <div key={r.id}>{r.label} · {new Date(r.readAt).toLocaleString('pt-BR')}</div>
                                ))}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Indicador de eventos de ligação com falha ao renderizar (badge âmbar).
                        Aparece silenciosamente somente se houver eventos problemáticos. */}
                    <CallEventFailedIndicator phone={selectedConv.phone} customerId={selectedConv.id} />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => dialSip(selectedConv.phone)}
                          onKeyDown={(e) => {
                            // A11y: garante ativação via teclado mesmo se algum
                            // ancestral chamar preventDefault no keypress padrão.
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              (e.currentTarget as HTMLButtonElement).click();
                            }
                          }}
                          disabled={voip.status !== 'connected'}
                          data-testid="dial-sip-btn"
                          data-state={
                            voip.status !== 'connected' ? 'disconnected'
                            : lineBusy ? 'busy'
                            : 'ready'
                          }
                          className={cn(
                            'p-2 min-w-11 min-h-11 md:min-w-9 md:min-h-9 rounded-lg transition inline-flex items-center justify-center border',
                            'focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                            lineBusy
                              ? 'text-red-500 border-red-500/40 hover:bg-red-500/10 focus-visible:ring-red-500'
                              : 'text-blue-500 border-blue-500/30 hover:bg-blue-500/10 focus-visible:ring-blue-500',
                            voip.status !== 'connected' && 'opacity-50 cursor-not-allowed',
                          )}
                          aria-label={
                            voip.status !== 'connected'
                              ? 'Ligar por VoIP (SIP) — indisponível: ramal SIP não conectado'
                              : lineBusy
                                ? 'Ligar por VoIP (SIP) — atenção: linha Wavoip em uso por outro usuário'
                                : 'Ligar por VoIP (SIP)'
                          }
                          aria-disabled={voip.status !== 'connected'}
                        >
                          <Phone className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[240px] text-xs" role="tooltip">
                        <div className="font-medium">Ligar por VoIP (SIP)</div>
                        <div className="text-muted-foreground mt-0.5">
                          {voip.status !== 'connected'
                            ? 'Ramal SIP desconectado — configure em Ferramentas → SIP para habilitar.'
                            : lineBusy
                              ? 'A linha Wavoip está em uso por outro usuário. Sua ligação SIP ainda pode ser realizada normalmente — o ícone fica vermelho apenas para sinalizar ocupação do canal WhatsApp.'
                              : 'Discagem via ramal SIP (tronco VoIP).'}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => dialWhatsApp(selectedConv.phone)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              (e.currentTarget as HTMLButtonElement).click();
                            }
                          }}
                          disabled={lineBusy}
                          data-testid="dial-wa-btn"
                          data-state={lineBusy ? 'busy' : 'ready'}
                          className={cn(
                            'p-2 min-w-11 min-h-11 md:min-w-9 md:min-h-9 rounded-lg transition inline-flex items-center justify-center border',
                            'focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                            lineBusy
                              ? 'text-red-500 border-red-500/40 hover:bg-red-500/10 cursor-not-allowed focus-visible:ring-red-500'
                              : 'text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10 focus-visible:ring-emerald-500',
                          )}
                          aria-label={
                            lineBusy
                              ? 'Ligar por WhatsApp — indisponível: linha Wavoip em uso por outro usuário'
                              : 'Ligar por WhatsApp (via Wavoip)'
                          }
                          aria-disabled={lineBusy}
                        >
                          <Phone className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[240px] text-xs">
                        <div className="font-medium">Ligar por WhatsApp</div>
                        <div className="text-muted-foreground mt-0.5">
                          {lineBusy
                            ? 'A linha Wavoip só permite uma chamada simultânea por conta. Aguarde outro operador finalizar — você pode clicar em "Aguardar" no aviso e receberá uma notificação assim que ficar livre.'
                            : 'Chamada de voz pelo WhatsApp usando a conexão Wavoip da conta.'}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setTransferOpen(true)}
                          className="px-2.5 h-8 rounded-lg border border-border hover:bg-secondary transition text-xs font-medium inline-flex items-center gap-1.5 text-foreground"
                          aria-label="Transferir atendimento"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                          Transferir
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Transferir para colega ou fluxo</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setSearchOpen(true)}
                          className="p-2 rounded-lg hover:bg-secondary transition text-muted-foreground"
                          aria-label="Buscar no histórico"
                        >
                          <Search className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Buscar no histórico (Ctrl/⌘+F)</TooltipContent>
                    </Tooltip>
                    {tools.map(t => (
                      <Tooltip key={t.key || 'none'}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => toggleTool(t.key)}
                            className={cn(
                              'p-2 rounded-lg hover:bg-secondary transition',
                              tool === t.key ? 'bg-primary/15 text-primary' : 'text-muted-foreground',
                            )}
                            aria-label={t.label}
                          >
                            <t.icon className="w-4 h-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t.label}</TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>


                {/* Messages (virtualizadas) */}
                <div
                  ref={scrollRef}
                  onScroll={onMessagesScroll}
                  className="flex-1 overflow-y-auto px-6 py-4 bg-gradient-to-b from-background to-secondary/20"
                >
                  {/* Topo: indicador de carregamento de mensagens antigas */}
                  <div className="h-8 flex items-center justify-center text-[11px] text-muted-foreground">
                    {olderLoading ? (
                      <span className="inline-flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Carregando anteriores…</span>
                    ) : hasMoreOlder && msgs.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => void loadOlder()}
                        className="underline decoration-dotted underline-offset-4 hover:text-foreground"
                      >
                        Carregar mensagens antigas
                      </button>
                    ) : msgs.length > 0 ? (
                      <span>Início da conversa</span>
                    ) : null}
                  </div>

                  <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border/40 px-3 py-1.5 flex items-center gap-1 text-[10px] mb-1">
                    <span className="text-muted-foreground uppercase tracking-wide">Ver:</span>
                    {(['all','client','notes'] as const).map(k => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setMsgFilter(k)}
                        className={cn(
                          'px-2 py-0.5 rounded-full border transition-colors',
                          msgFilter === k
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-border hover:bg-secondary text-muted-foreground',
                        )}
                      >
                        {k === 'all' ? 'Tudo' : k === 'client' ? 'Só cliente' : 'Só notas internas'}
                      </button>
                    ))}
                  </div>

                  {visibleMsgs.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                      {msgs.length === 0 ? 'Nenhuma mensagem ainda — envie a primeira.' : 'Nenhuma mensagem para este filtro.'}
                    </div>
                  ) : (

                    <div
                      style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}
                    >
                      {virtualizer.getVirtualItems().map((vi) => {
                        const m = visibleMsgs[vi.index];

                        if (!m) return null;
                        const _meta = (m as any).metadata;
                        const isCallEvt = isCallEventMessage(_meta);
                        const isMe = m.sender_type !== 'client';
                        const status = m.metadata?.status;
                        return (
                          <div
                            key={vi.key}
                            data-index={vi.index}
                            ref={virtualizer.measureElement}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              transform: `translateY(${vi.start}px)`,
                              paddingBottom: 8,
                            }}
                          >
                            {isInternalNoticeMessage(_meta) ? (
                              <InternalNoticeBubble metadata={_meta as any} createdAt={m.created_at} />
                            ) : isCallEvt ? (
                              <CallEventBubble metadata={_meta as any} createdAt={m.created_at} />
                            ) : (
                            <div className={cn('flex', isMe ? 'justify-end' : 'justify-start')}>
                              <div
                                className={cn(
                                  'max-w-[68%] px-3.5 py-2 rounded-2xl shadow-sm text-sm whitespace-pre-wrap break-words',
                                  isMe
                                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                                    : 'bg-card border border-border rounded-bl-sm',
                                )}
                              >
                                <div>{renderWhatsAppText(m.content || '')}</div>
                                <div className={cn(
                                  'flex items-center gap-1 mt-1 text-[10px] opacity-70',
                                  isMe ? 'justify-end' : 'justify-start',
                                )}>
                                  <span>{formatTime(m.created_at)}</span>
                                  {isMe && status === 'sent' && <CheckCheck className="w-3 h-3" />}
                                  {isMe && status === 'sending' && <Check className="w-3 h-3" />}
                                  {isMe && status === 'error' && <span className="text-destructive">falhou</span>}
                                </div>
                              </div>
                            </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Composer */}
                <div className="border-t border-border bg-card/40 p-3">
                  <ChatComposer
                    conversationId={selectedConv.id}
                    text={composerText}
                    onChangeText={setComposerText}
                    onSendText={async (t) => { await handleSend(t); setComposerText(''); }}
                    recentMessages={msgs.slice(-20).map(m => ({ sender_type: m.sender_type, content: m.content }))}
                    contactName={selectedConv.name}
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-muted-foreground">
                <MessageCircle className="w-16 h-16 opacity-30" />
                <p className="text-sm">Selecione uma conversa para começar</p>
              </div>
            )}
          </section>

          {/* Right side tool panel */}
          {selectedConv && tool && (
            <aside className="w-96 shrink-0 border-l border-border bg-card/40 flex flex-col">
              <div className="h-14 shrink-0 border-b border-border flex items-center justify-between px-4">
                <h3 className="text-sm font-semibold">
                  {tools.find(t => t.key === tool)?.label}
                </h3>
                <button
                  onClick={() => setTool(null)}
                  className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"
                  aria-label="Fechar painel"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {tool === 'info' && (
                  <div className="p-4 space-y-3 text-sm">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-14 h-14">
                        <AvatarImage src={selectedConv.avatar_url || undefined} />
                        <AvatarFallback className="bg-secondary">{initials(selectedConv.name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-semibold">{selectedConv.name}</div>
                        <div className="text-xs text-muted-foreground">{selectedConv.phone || 'Sem telefone'}</div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground pt-2">
                      Status: {selectedConv.presence || 'desconhecido'}
                    </div>
                  </div>
                )}
                {tool === 'media' && <div className="p-4"><MediaGallery customerId={selectedConv.id} /></div>}
                {tool === 'starred' && <div className="p-4"><StarredMessagesPanel customerId={selectedConv.id} /></div>}
                {tool === 'notes' && (
                  <ChatRightPanel
                    customerId={selectedConv.id}
                    customerName={selectedConv.name}
                    onClose={() => setTool(null)}
                    onUseReply={(text) => setComposerText(prev => prev ? `${prev} ${text}` : text)}
                  />
                )}
                {tool === 'ai' && <div className="p-4"><AIInsightsPanel customerId={selectedConv.id} /></div>}
                {tool === 'timeline' && <div className="p-4"><Customer360Timeline customerId={selectedConv.id} /></div>}
                {tool === 'pinned' && (
                  <div className="p-4 text-sm text-muted-foreground">
                    Fixe mensagens no /chat principal — elas aparecerão aqui em tempo real.
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>

      <MediaDropzone
        active={!!selected}
        maxFiles={30}
        maxBytes={100 * 1024 * 1024}
        perKindMaxBytes={{
          image: 16 * 1024 * 1024,      // WhatsApp: 16 MB
          video: 64 * 1024 * 1024,      // WhatsApp: 64 MB
          audio: 16 * 1024 * 1024,      // WhatsApp: 16 MB
          document: 100 * 1024 * 1024,  // WhatsApp: 100 MB
        }}
        accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
        allowedTypes={[
          /^image\//, /^video\//, /^audio\//,
          /^application\/pdf$/,
          /^application\/(msword|vnd\.openxmlformats|vnd\.ms-)/,
          /^text\/(plain|csv)/,
          /\.(pdf|docx?|xlsx?|pptx?|txt|csv|zip|rar)$/i,
        ]}
        onSendFile={async (file, kind) => { await handleSendMedia(file, kind); }}
      />

      <MessageSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        customerId={selected}
        onJump={handleJumpToMessage}
      />

      <ContactsDialog
        open={contactsOpen}
        onOpenChange={setContactsOpen}
        ownerId={conn?.owner_id ?? user?.id ?? null}
        channel="whatsapp"
        onSelect={(customerId) => {
          setSelected(customerId);
          setParams((prev) => { const p = new URLSearchParams(prev); p.set('c', customerId); return p; });
        }}
        onCreateNew={() => setNewConvOpen(true)}
      />

      <NewConversationDialog
        open={newConvOpen}
        onOpenChange={setNewConvOpen}
        connection={conn}
        onCreated={(customerId) => {
          setSelected(customerId);
          setParams((prev) => { const p = new URLSearchParams(prev); p.set('c', customerId); return p; });
        }}
      />

      <AttendanceFlowDialog
        open={flowOpen}
        onOpenChange={setFlowOpen}
        onSelectCustomer={(customerId) => {
          setSelected(customerId);
          setParams((prev) => { const p = new URLSearchParams(prev); p.set('c', customerId); return p; });
        }}
      />

      {selectedConv && (
        <TransferConversationDialog
          open={transferOpen}
          onOpenChange={setTransferOpen}
          customerId={selectedConv.id}
          ownerId={null}
        />
      )}
    </TooltipProvider>
  );
}
