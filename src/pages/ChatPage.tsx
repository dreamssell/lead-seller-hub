import { AppLayout } from '@/components/layout/AppLayout';
import { GlobalSearchDialog } from '@/components/chat/GlobalSearchDialog';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Paperclip, Phone, Video, MoreVertical, Search, Circle,
  Camera, ThumbsUp, Briefcase, MessageCircle, Globe, Bot, UserCog, ArrowLeft, RefreshCw, CheckCircle2, AlertCircle, Settings,
  Database, Activity, ShieldAlert, Wifi, WifiOff, Terminal, ChevronDown, ChevronUp, History as HistoryIcon, Bug, Play, Share2,
  FileDown, Filter, Calendar, Clock, Loader2, X, AlertTriangle, Check, SmilePlus, Reply, Pencil, Trash2, Forward as ForwardIcon,
  Pin, PinOff, Star, StarOff, SearchCode, ExternalLink
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";




import { useState, useMemo, useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import {
  getCachedConvs, setCachedConvs,
  getCachedMessages, setCachedMessages,
} from '@/lib/chatCache';
import { Link } from 'react-router-dom';
import { getProviderAdapter } from '@/components/whatsapp/adapters';
import { WhatsAppConnection } from '@/components/whatsapp/types';
import { useVoip } from '@/contexts/VoipContext';
import { useWavoipWebphone } from '@/contexts/WavoipWebphoneContext';
import { ChatRightPanel } from '@/components/chat/ChatRightPanel';
import { MediaMessageContent } from '@/components/chat/MediaMessageContent';
import { MediaViewerDialog, type MediaItem } from '@/components/chat/MediaViewerDialog';
import { SignatureDocumentModal } from '@/components/signature/SignatureDocumentModal';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { StickyNote, Zap, PhoneCall, Headphones, PenLine, Keyboard } from 'lucide-react';
import { ChatComposer, ComposerAttachment } from '@/components/chat/ChatComposer';
import { RichSendMenu, RichPayload } from '@/components/chat/RichSendMenu';
import { MediaDropzone } from '@/components/chat/MediaDropzone';
import { KeyboardShortcutsHelp } from '@/components/chat/KeyboardShortcutsHelp';
import { useChatShortcuts } from '@/hooks/useChatShortcuts';
import { renderWhatsAppText } from '@/lib/whatsappFormat';
import { InChatSearchBar } from '@/components/chat/InChatSearchBar';
import { PinnedMessagesBar, type PinnedItem } from '@/components/chat/PinnedMessagesBar';
import { ScheduleMessageDialog } from '@/components/chat/ScheduleMessageDialog';
import { CollaborationBar } from '@/components/chat/CollaborationBar';
import { WhisperFeed } from '@/components/chat/WhisperFeed';
import { SupervisorBanner } from '@/components/chat/SupervisorBanner';
import { WhisperComposer } from '@/components/chat/WhisperComposer';
import { TransferConversationDialog } from '@/components/chat/TransferConversationDialog';
import { useIsSupervisor } from '@/hooks/useIsSupervisor';
import { normalizeChatSendError, NormalizedChatError } from '@/lib/chatErrorMapper';
import { NewConversationDialog } from '@/components/chat/NewConversationDialog';
import { ContactsDialog } from '@/components/chat/ContactsDialog';
import { Plus, Archive, BellOff, Bell, Tag } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatformOwner } from '@/hooks/usePlatformOwner';
import { applyConversationMessagesAfterSwitch, canUseTenantRecord, getActiveOwnerId } from '@/lib/chatTenantScope';



import { ScrollArea } from '@/components/ui/scroll-area';

type ChannelKey = 'instagram' | 'facebook' | 'linkedin' | 'whatsapp' | 'widget' | 'youtube' | 'tiktok' | 'telegram';

const channels: Array<{
  key: ChannelKey; name: string; icon: any; color: string; bg: string; leads: number; open: number;
}> = [
  { key: 'whatsapp', name: 'WhatsApp', icon: MessageCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/10', leads: 142, open: 18 },
  { key: 'instagram', name: 'Instagram', icon: Camera, color: 'text-pink-500', bg: 'bg-pink-500/10', leads: 87, open: 12 },
  { key: 'facebook', name: 'Facebook', icon: ThumbsUp, color: 'text-blue-500', bg: 'bg-blue-500/10', leads: 64, open: 9 },
  { key: 'telegram', name: 'Telegram', icon: Send, color: 'text-sky-500', bg: 'bg-sky-500/10', leads: 38, open: 5 },
  { key: 'linkedin', name: 'LinkedIn', icon: Briefcase, color: 'text-sky-600', bg: 'bg-sky-500/10', leads: 31, open: 4 },
  { key: 'youtube', name: 'YouTube', icon: Play, color: 'text-red-500', bg: 'bg-red-500/10', leads: 22, open: 3 },
  { key: 'tiktok', name: 'TikTok', icon: Share2, color: 'text-zinc-900', bg: 'bg-zinc-500/10', leads: 45, open: 6 },
  { key: 'widget', name: 'Widget de Site', icon: Globe, color: 'text-violet-500', bg: 'bg-violet-500/10', leads: 53, open: 7 },
];





type ConvItem = { id: string; name: string; msg: string; time: string; online: boolean; botEnabled: boolean; assignedTo: string; phone?: string; avatar_url?: string | null; email?: string | null; presence?: string | null; presenceLabel?: string; lastSeenAt?: string | null; owner_id?: string | null; sub_company_id?: string | null; is_archived?: boolean; is_muted?: boolean; muted_until?: string | null; label_ids?: string[] };
const conversationsByChannel: Record<ChannelKey, Array<ConvItem>> = {
  whatsapp: [],
  instagram: [],
  facebook: [],
  telegram: [],
  linkedin: [],
  youtube: [],
  tiktok: [],
  widget: [],
};

function computePresence(presence?: string | null, presenceAt?: string | null, lastSeenAt?: string | null): { online: boolean; label: string } {
  const now = Date.now();
  const presAt = presenceAt ? new Date(presenceAt).getTime() : 0;
  const seenAt = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
  const fresh = now - presAt < 2 * 60 * 1000; // 2 min
  if (fresh && presence === 'composing') return { online: true, label: 'digitando…' };
  if (fresh && presence === 'recording') return { online: true, label: 'gravando áudio…' };
  if (fresh && (presence === 'available' || presence === 'online')) return { online: true, label: 'Online agora' };
  if (seenAt) {
    const diff = now - seenAt;
    if (diff < 60_000) return { online: false, label: 'visto agora' };
    if (diff < 3600_000) return { online: false, label: `visto há ${Math.floor(diff / 60_000)} min` };
    if (diff < 86_400_000) return { online: false, label: `visto há ${Math.floor(diff / 3600_000)} h` };
    return { online: false, label: `visto em ${new Date(seenAt).toLocaleDateString('pt-BR')}` };
  }
  return { online: false, label: 'Sem status' };
}


const aiAgents = [
  { id: 'bot:vendas', name: 'Agente de Vendas IA' },
  { id: 'bot:atendimento', name: 'Agente de Atendimento IA' },
  { id: 'bot:qualificador', name: 'Qualificador de Leads IA' },
  { id: 'bot:tecnico', name: 'Suporte Técnico IA' },
];

const humanAgents = [
  { id: 'human:joao', name: 'João Silva', status: 'online' },
  { id: 'human:maria', name: 'Maria Costa', status: 'online' },
  { id: 'human:pedro', name: 'Pedro Alves', status: 'busy' },
  { id: 'human:ana', name: 'Ana Ribeiro', status: 'offline' },
];

const mockMessages = [
  { id: 1, from: 'client', text: 'Olá! Preciso de ajuda com a integração da API.', time: '14:32' },
  { id: 2, from: 'agent', text: 'Claro! Posso te ajudar com isso. Qual endpoint você está tentando acessar?', time: '14:33' },
  { id: 3, from: 'client', text: 'Estou tentando usar o webhook de notificações, mas retorna 401.', time: '14:35' },
  { id: 4, from: 'agent', text: 'Verifique se a chave API está ativa em Configurações > Chaves API.', time: '14:36' },
];

type WhatsAppDbStatus = 'active' | 'offline' | 'disconnected';

const providerLabel = (provider?: string) => (provider ? provider.toUpperCase() : 'WHATSAPP');

const getUniqueProviderLabels = (connections: WhatsAppConnection[]) => (
  Array.from(new Set(connections.map((conn) => providerLabel(conn.provider)).filter(Boolean)))
);

const getConnectionPhoneFromDb = (conn?: WhatsAppConnection | null) => {
  if (!conn) return undefined;
  return conn.phone_number || conn.metadata?.phone || conn.metadata?.phone_number || conn.metadata?.number || conn.metadata?.owner || conn.metadata?.wuid || conn.metadata?.me?.id || conn.metadata?.me?.jid;
};

const getWhatsAppDbSummary = (connections: WhatsAppConnection[]) => {
  const connected = connections.filter((conn) => String(conn.status).toLowerCase() === 'connected');
  const visible = connected.length > 0 ? connected : connections;

  return {
    status: connections.length === 0 ? 'disconnected' as WhatsAppDbStatus : connected.length > 0 ? 'active' as WhatsAppDbStatus : 'offline' as WhatsAppDbStatus,
    labels: getUniqueProviderLabels(visible),
    primary: connected[0] || connections[0] || null,
    connectedCount: connected.length,
  };
};

const getWhatsAppStatusLabel = (status: WhatsAppDbStatus) => {
  if (status === 'active') return 'Ativo';
  if (status === 'offline') return 'Offline';
  return 'Desconectado';
};

const getWhatsAppStatusClasses = (status: WhatsAppDbStatus) => {
  if (status === 'active') return 'bg-success/10 border-success/20 text-success';
  if (status === 'offline') return 'bg-warning/10 border-warning/20 text-warning';
  return 'bg-destructive/10 border-destructive/20 text-destructive';
};

const getMessageMetadata = (message: any): Record<string, any> => {
  const meta = message?.metadata;
  return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
};

const hydrateChatMessage = (row: any) => {
  const meta = getMessageMetadata(row);
  const status = row?.status || meta.status || (row?.sender_type === 'client' ? 'read' : row?.uaz_msg_id ? 'sent' : 'sent');
  return {
    ...row,
    status,
    _error: row?._error || meta.error || meta.error_detail || null,
    _errorCode: row?._errorCode || meta.error_code || null,
    _blockedBy: row?._blockedBy || meta.blocked_by || meta.blockedBy || null,
    _latency: row?._latency || meta.latency_ms || null,
    _confirmedAt: row?._confirmedAt || meta.confirmed_at || meta.accepted_at || null,
    _deliveryStatus: row?._deliveryStatus || meta.delivery_status || meta.status || null,
    _mediaUrl: row?._mediaUrl || meta.media_url || null,
    _mediaType: row?._mediaType || meta.media_type || null,
    _mediaMime: row?._mediaMime || meta.media_mime || null,
    _mediaFilename: row?._mediaFilename || meta.media_filename || null,
    _mediaDuration: row?._mediaDuration || meta.media_duration || null,
    _reactions: (meta.reactions && typeof meta.reactions === 'object') ? meta.reactions : {},
    _quoted: (meta.quoted && typeof meta.quoted === 'object') ? meta.quoted : null,
    _edited: meta.edited === true || Array.isArray(meta.edits) && meta.edits.length > 0,
    _editedAt: meta.edited_at || null,
    _revoked: meta.revoked === true,
  };
};

const getMessageErrorInfo = (message: any): NormalizedChatError | null => {
  const meta = getMessageMetadata(message);
  const detail = message?._error || meta.error_detail || meta.error || meta.last_error;
  if (!detail && message?.status !== 'error' && meta.status !== 'error') return null;
  const normalized = normalizeChatSendError(detail || 'Falha ao enviar mensagem.');
  return {
    ...normalized,
    blockedBy: message?._blockedBy || meta.blocked_by || normalized.blockedBy,
  };
};

type InboundPipelineDebug = {
  webhookSeen: number;
  persistedMessages: number;
  realtimeSeen: number;
  renderedMessages: number;
  lastProviderMessageId?: string | null;
  lastChatMessageId?: string | null;
  lastSenderLid?: string | null;
  lastOwnerId?: string | null;
  lastEventAt?: string | null;
  lastBackfill?: any;
};

const emptyInboundPipelineDebug: InboundPipelineDebug = {
  webhookSeen: 0,
  persistedMessages: 0,
  realtimeSeen: 0,
  renderedMessages: 0,
};

function getStoredChatState(ownerId: string | null) {
  if (!ownerId) return null;
  try {
    const raw = localStorage.getItem(`lead-seller:chat-state:${ownerId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      channel: channels.some((c) => c.key === parsed?.channel) ? parsed.channel as ChannelKey : null,
      selectedConvId: typeof parsed?.selectedConvId === 'string' ? parsed.selectedConvId : null,
    };
  } catch {
    return null;
  }
}

const extractProviderMessageId = (data: any) => (
  data?.message_id ||
  data?.raw?.id?._serialized ||
  data?.raw?.id ||
  data?.raw?.data?.key?.id ||
  data?.raw?.key?.id ||
  data?.data?.key?.id ||
  data?.key?.id ||
  data?.message?.key?.id ||
  data?.id ||
  data?.messageId ||
  undefined
);

// Extract media descriptor returned by the outbound provider adapter (WAHA
// currently) so we can persist it on chat_messages.metadata alongside the
// provider message id — powering the inline audio/image/video/document player
// for the sender's side of the conversation.
const extractOutboundMediaMeta = (data: any) => {
  if (!data || typeof data !== 'object') return null;
  const url = data.media_url || data.mediaUrl || null;
  const type = data.media_type || data.mediaType || null;
  if (!url && !type) return null;
  return {
    media_url: url,
    media_path: data.media_path || null,
    media_type: type,
    media_mime: data.media_mime || data.mediaMime || null,
    media_filename: data.media_filename || data.filename || null,
    media_size: data.media_size || null,
  };
};

export default function ChatPage() {
  const [activeChannel, setActiveChannel] = useState<ChannelKey | null>(null);
  const [convs, setConvs] = useState(conversationsByChannel);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [collabTransferOpen, setCollabTransferOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const { isSupervisor, userId: currentUserId } = useIsSupervisor();
  const { access, accessLoading, reloadAccess } = useAuth();
  const { isOwner } = usePlatformOwner();
  const activeOwnerId = getActiveOwnerId(access?.owner_id, null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const convsRef = useRef(convs);
  const selectedConvIdRef = useRef<string | null>(selectedConvId);
  const activeOwnerIdRef = useRef<string | null>(activeOwnerId);
  const activeChannelRef = useRef<ChannelKey | null>(activeChannel);

  useEffect(() => {
    convsRef.current = convs;
  }, [convs]);

  useEffect(() => {
    selectedConvIdRef.current = selectedConvId;
  }, [selectedConvId]);

  // Auto-scroll para a última mensagem sempre que a conversa abre ou mensagens chegam.
  useEffect(() => {
    const el = messagesEndRef.current;
    if (!el) return;
    // Rola imediatamente ao trocar de conversa; suave quando chegam novas mensagens.
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'auto', block: 'end' });
    });
  }, [selectedConvId, messages.length]);

  useEffect(() => {
    activeOwnerIdRef.current = activeOwnerId;
  }, [activeOwnerId]);

  useEffect(() => {
    activeChannelRef.current = activeChannel;
  }, [activeChannel]);

  // Ctrl/Cmd+K → busca global
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setGlobalSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Global listeners: whispers + mentions for the current user
  useEffect(() => {
    if (!currentUserId) return;
    const whisperCh = supabase
      .channel(`my-whispers-${currentUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'supervisor_whispers', filter: `to_agent_id=eq.${currentUserId}` },
        (payload: any) => {
          toast({
            title: '🔒 Sussurro do supervisor',
            description: payload.new?.content || 'Você recebeu uma mensagem privada do supervisor.',
          });
        },
      )
      .subscribe();
    const mentionCh = supabase
      .channel(`my-mentions-${currentUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'note_mentions', filter: `mentioned_user_id=eq.${currentUserId}` },
        () => {
          toast({ title: '💬 Você foi mencionado em uma nota interna' });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(whisperCh);
      supabase.removeChannel(mentionCh);
    };
  }, [currentUserId]);



  const [messageText, setMessageText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [debugLogs, setDebugLogs] = useState<Array<{ id: string; time: string; type: 'info' | 'error' | 'request'; message: string; data?: any }>>([]);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const showDebugPanelRef = useRef(showDebugPanel);
  const restoredChatStateRef = useRef<string | null>(null);
  const wahaBackfillRef = useRef<Record<string, number>>({});
  const [authValidation, setAuthValidation] = useState<{ valid: boolean; reason?: string; loading: boolean }>({ valid: false, loading: true });
  const [activeWhatsAppConn, setActiveWhatsAppConn] = useState<WhatsAppConnection | null>(null);
  const [connectedProviders, setConnectedProviders] = useState<string[]>([]);
  const [inboundDebug, setInboundDebug] = useState<InboundPipelineDebug>(emptyInboundPipelineDebug);
  const [wavoipLineBusy, setWavoipLineBusy] = useState<{
    busy: boolean;
    phone?: string | null;
    since?: string | null;
    userId?: string | null;
    tooltip: string;
  }>({ busy: false, tooltip: 'Linha Wavoip livre' });
  const [whatsappStatus, setWhatsappStatus] = useState<{ connected: boolean; loading: boolean; dbStatus: WhatsAppDbStatus; phone?: string; error?: string }>({
    connected: false,
    loading: true,
    dbStatus: 'disconnected',
  });
  const whatsappStatusRef = useRef(whatsappStatus);

  // Telegram States
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(new Date());
  const [scheduledTime, setScheduledTime] = useState("12:00");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [telegramStats, setTelegramStats] = useState({
    webhookStatus: 'active',
    lastSync: new Date().toISOString(),
    failureCount: 0,
    pollingStatus: 'idle'
  });
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [historyPage, setHistoryPage] = useState(1);
  const [scheduledMessages, setScheduledMessages] = useState<any[]>([]);
  const [historyFilters, setHistoryFilters] = useState({
    status: 'all',
    startDate: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
    sort: 'desc'
  });
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  // Filtros da lista de conversas (labels/arquivadas/silenciadas)
  const [chatListFilters, setChatListFilters] = useState<{ labels: string[]; archived: 'exclude' | 'only' | 'all'; muted: 'exclude' | 'only' | 'all' }>({
    labels: [], archived: 'exclude', muted: 'all'
  });
  const [availableTags, setAvailableTags] = useState<Array<{ id: string; name: string; color: string | null }>>([]);
  useEffect(() => {
    if (!activeOwnerId) return;
    supabase.from('chat_tags').select('id, name, color').eq('owner_id', activeOwnerId).order('name')
      .then(({ data }) => setAvailableTags((data || []) as any));
  }, [activeOwnerId]);

  // Auto-unmute: a cada 60s varre conversas e desmuta as com muted_until expirado.
  useEffect(() => {
    const t = setInterval(async () => {
      const now = Date.now();
      const expired = Object.values(convsRef.current).flat().filter((c: any) => c?.is_muted && c?.muted_until && new Date(c.muted_until).getTime() <= now);
      for (const c of expired) {
        await supabase.from('customers').update({ is_muted: false, muted_until: null } as any).eq('id', (c as any).id);
      }
    }, 60_000);
    return () => clearInterval(t);
  }, []);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const voip = useVoip();
  const wavoip = useWavoipWebphone();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [externalAttachment, setExternalAttachment] = useState<File | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // Etapa 3 — mensagem sendo respondida (quote/reply). null = envio normal.
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [forwardTarget, setForwardTarget] = useState<any | null>(null);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editText, setEditText] = useState('');
  useEffect(() => { setReplyingTo(null); setForwardTarget(null); setEditTarget(null); }, [selectedConvId]);

  // Etapa 9 — assinatura pessoal + agendamento
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [signatureText, setSignatureText] = useState<string>('');
  const [signatureEnabled, setSignatureEnabled] = useState<boolean>(false);
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('signature, signature_enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      setSignatureText((data as any)?.signature || '');
      setSignatureEnabled(!!(data as any)?.signature_enabled);
    })();
  }, []);
  const handleToggleSignature = async (v: boolean) => {
    setSignatureEnabled(v);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('profiles').update({ signature_enabled: v }).eq('user_id', user.id);
  };

  // Etapa 8 — busca dentro da conversa (Ctrl/Cmd+F)
  const [inChatSearchOpen, setInChatSearchOpen] = useState(false);
  const [inChatSearchQuery, setInChatSearchQuery] = useState('');
  const [inChatSearchIndex, setInChatSearchIndex] = useState(0);
  const inChatMatches = useMemo(() => {
    const q = inChatSearchQuery.trim().toLowerCase();
    if (!q) return [] as string[];
    return messages
      .filter((m: any) => (m.content || '').toLowerCase().includes(q))
      .map((m: any) => m.uaz_msg_id || m.id);
  }, [inChatSearchQuery, messages]);
  useEffect(() => { setInChatSearchIndex(0); }, [inChatSearchQuery]);
  useEffect(() => { setInChatSearchOpen(false); setInChatSearchQuery(''); }, [selectedConvId]);
  useEffect(() => {
    const id = inChatMatches[inChatSearchIndex];
    if (!id) return;
    const el = document.querySelector(`[data-msg-id="${id}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [inChatSearchIndex, inChatMatches]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && selectedConvId) {
        e.preventDefault();
        setInChatSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedConvId]);

  // Etapa 8 — mensagens fixadas na conversa atual (visíveis para toda a equipe)
  const [pinnedItems, setPinnedItems] = useState<PinnedItem[]>([]);
  const pinnedIds = useMemo(() => new Set(pinnedItems.map((p) => p.message_id)), [pinnedItems]);
  useEffect(() => {
    if (!selectedConvId) { setPinnedItems([]); return; }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('chat_pinned_messages')
        .select('id, message_id, created_at, chat_messages(content, sender_type, created_at)')
        .eq('customer_id', selectedConvId)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      setPinnedItems(
        ((data as any[]) || []).map((r) => ({
          pin_id: r.id,
          message_id: r.message_id,
          content: r.chat_messages?.content ?? null,
          sender_type: r.chat_messages?.sender_type ?? 'client',
          created_at: r.chat_messages?.created_at ?? r.created_at,
          pinned_at: r.created_at,
        })),
      );
    };
    load();
    const ch = supabase
      .channel(`pinned-${selectedConvId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_pinned_messages', filter: `customer_id=eq.${selectedConvId}` }, () => load())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [selectedConvId]);

  // Etapa 8 — favoritas do próprio atendente na conversa atual
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!selectedConvId || !currentUserId) { setStarredIds(new Set()); return; }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('chat_starred_messages')
        .select('message_id')
        .eq('customer_id', selectedConvId)
        .eq('user_id', currentUserId);
      if (cancelled) return;
      setStarredIds(new Set(((data as any[]) || []).map((r) => r.message_id)));
    };
    load();
    const ch = supabase
      .channel(`starred-${selectedConvId}-${currentUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_starred_messages', filter: `customer_id=eq.${selectedConvId}` }, () => load())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [selectedConvId, currentUserId]);

  const handleTogglePin = async (m: any) => {
    if (!selectedConvId || !activeOwnerId) return;
    const existing = pinnedItems.find((p) => p.message_id === m.id);
    if (existing) {
      const { error } = await supabase.from('chat_pinned_messages').delete().eq('id', existing.pin_id);
      if (error) return toast({ title: 'Não foi possível desafixar', description: error.message, variant: 'destructive' });
    } else {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return;
      const { error } = await supabase.from('chat_pinned_messages').insert({
        message_id: m.id,
        customer_id: selectedConvId,
        owner_id: activeOwnerId,
        sub_company_id: (selectedConv as any)?.sub_company_id ?? null,
        pinned_by: uid,
      } as any);
      if (error) return toast({ title: 'Não foi possível fixar', description: error.message, variant: 'destructive' });
    }
  };

  const handleToggleStar = async (m: any) => {
    if (!selectedConvId || !activeOwnerId || !currentUserId) return;
    if (starredIds.has(m.id)) {
      await supabase.from('chat_starred_messages').delete().eq('message_id', m.id).eq('user_id', currentUserId);
    } else {
      const { error } = await supabase.from('chat_starred_messages').insert({
        message_id: m.id,
        customer_id: selectedConvId,
        user_id: currentUserId,
        owner_id: activeOwnerId,
      } as any);
      if (error) return toast({ title: 'Não foi possível favoritar', description: error.message, variant: 'destructive' });
    }
  };

  useChatShortcuts(!!selectedConvId, {
    onHelp: () => setShortcutsOpen(true),
    onSend: () => { /* ChatComposer handles its own Ctrl+Enter via key event */ },
  });

  useEffect(() => {
    showDebugPanelRef.current = showDebugPanel;
  }, [showDebugPanel]);

  useEffect(() => {
    whatsappStatusRef.current = whatsappStatus;
  }, [whatsappStatus]);

  useEffect(() => {
    if (!activeOwnerId || restoredChatStateRef.current === activeOwnerId) return;
    const saved = getStoredChatState(activeOwnerId);
    restoredChatStateRef.current = activeOwnerId;
    if (saved?.channel) setActiveChannel(saved.channel);
    if (saved?.selectedConvId) setSelectedConvId(saved.selectedConvId);
  }, [activeOwnerId]);

  useEffect(() => {
    if (!activeOwnerId || restoredChatStateRef.current !== activeOwnerId) return;
    try {
      localStorage.setItem(
        `lead-seller:chat-state:${activeOwnerId}`,
        JSON.stringify({ channel: activeChannel, selectedConvId, savedAt: new Date().toISOString() }),
      );
    } catch {}
  }, [activeOwnerId, activeChannel, selectedConvId]);



  const addDebugLog = (type: 'info' | 'error' | 'request', message: string, data?: any) => {
    // Evita re-render contínuo: só coleta quando o painel de Diagnóstico está aberto,
    // e quando aberto mantém apenas os 50 eventos mais recentes em memória (sem persistência).
    if (!showDebugPanelRef.current && type !== 'error' && !message.startsWith('[Inbound]')) return;
    setDebugLogs(prev => [{
      id: crypto.randomUUID(),
      time: new Date().toLocaleTimeString(),
      type,
      message,
      data
    }, ...prev].slice(0, 50));
  };

  const loadInboundPipelineDebug = async (conn: WhatsAppConnection | null, ownerId: string | null) => {
    if (!conn?.id || !ownerId) return;
    try {
      const [{ data: events }, { data: persisted }] = await Promise.all([
        (supabase as any)
          .from('connection_events')
          .select('id,event_type,status,created_at,metadata_json,payload,status_detail,error_message')
          .eq('connection_id', conn.id)
          .order('created_at', { ascending: false })
          .limit(30),
        (supabase as any)
          .from('chat_messages')
          .select('id,uaz_msg_id,customer_id,created_at,metadata,customers!inner(owner_id,phone,name)')
          .eq('connection_id', conn.id)
          .order('created_at', { ascending: false })
          .limit(30),
      ]);
      const ownMessages = (persisted || []).filter((m: any) => m?.customers?.owner_id === ownerId);
      const lastEvent = (events || [])[0] as any;
      const lastMsg = ownMessages[0] as any;
      setInboundDebug((prev) => ({
        ...prev,
        webhookSeen: (events || []).filter((e: any) => String(e.event_type || '').startsWith('waha.')).length,
        persistedMessages: ownMessages.length,
        lastProviderMessageId: lastMsg?.uaz_msg_id || lastEvent?.metadata_json?.provider_msg_id || null,
        lastChatMessageId: lastMsg?.id || lastEvent?.metadata_json?.chat_message_id || null,
        lastSenderLid: lastMsg?.metadata?.sender_lid || lastEvent?.metadata_json?.sender_lid || null,
        lastOwnerId: ownerId,
        lastEventAt: lastMsg?.created_at || lastEvent?.created_at || null,
      }));
      addDebugLog('info', '[Inbound] Backend trace atualizado', {
        owner_id: ownerId,
        connection_id: conn.id,
        webhook_events: events?.length || 0,
        persisted_messages: ownMessages.length,
        last_event: lastEvent,
        last_message: lastMsg,
      });
    } catch (e) {
      addDebugLog('error', '[Inbound] Falha ao carregar trace backend', e);
    }
  };

  const triggerWahaInboundBackfill = async (conn: WhatsAppConnection | null, ownerId: string | null, reason: string) => {
    if (!conn?.id || conn.provider !== 'waha' || !ownerId) return;
    const now = Date.now();
    if (now - (wahaBackfillRef.current[conn.id] || 0) < 90_000) return;
    wahaBackfillRef.current[conn.id] = now;
    try {
      addDebugLog('request', '[Inbound] Solicitando backfill automático WAHA', { connection_id: conn.id, owner_id: ownerId, reason });
      const { data, error } = await supabase.functions.invoke('waha-session', {
        body: { action: 'backfill_inbound', connection_id: conn.id, limit: 100 },
      });
      if (error) throw error;
      setInboundDebug((prev) => ({ ...prev, lastBackfill: data }));
      addDebugLog('info', '[Inbound] Backfill WAHA concluído', data);
      await loadInboundPipelineDebug(conn, ownerId);
      if (selectedConvIdRef.current) await loadMessagesForConversation(selectedConvIdRef.current, 'backfill');
    } catch (e) {
      addDebugLog('error', '[Inbound] Backfill WAHA falhou', e);
    }
  };

  const loadMessagesForConversation = async (conversationId: string, source: 'select' | 'manual' | 'realtime' | 'backfill' = 'manual') => {
    const scopedConv = (activeChannelRef.current ? convsRef.current[activeChannelRef.current] : Object.values(convsRef.current).flat()).find((c) => c.id === conversationId) as any;
    if (!scopedConv) {
      addDebugLog('info', '[Inbound] Conversa ainda não está carregada; aguardando lista de contatos', {
        customer_id: conversationId,
        owner_id: activeOwnerIdRef.current,
      });
      return false;
    }
    if (!canUseTenantRecord(activeOwnerIdRef.current, scopedConv?.owner_id ?? null)) {
      addDebugLog('error', 'Consulta de mensagens bloqueada por owner divergente', {
        owner_ativo: activeOwnerIdRef.current,
        owner_conversa: scopedConv?.owner_id ?? null,
        customer_id: conversationId,
      });
      toast({
        title: 'Owner incorreto para esta conversa',
        description: 'Atualize o access antes de consultar ou enviar mensagens neste contato.',
        variant: 'destructive',
      });
      return false;
    }
    // Hidratação instantânea a partir do cache local (IndexedDB): pinta a
    // conversa imediatamente enquanto o fetch de rede roda em background.
    const cached = await getCachedMessages<any>(activeOwnerIdRef.current, conversationId);
    if (cached?.items?.length && conversationId === selectedConvIdRef.current) {
      const hydratedCache = cached.items.map(hydrateChatMessage);
      setMessages((prev) => applyConversationMessagesAfterSwitch({
        currentConversationId: selectedConvIdRef.current,
        requestedConversationId: conversationId,
        previousMessages: prev,
        loadedMessages: hydratedCache,
      }));
    }

    // Delta fetch quando temos ponto de sincronização em cache; senão, full fetch.
    const deltaFrom = cached?.lastAt || null;
    const baseQuery = supabase
      .from('chat_messages')
      .select('*')
      .eq('customer_id', conversationId)
      .order('created_at', { ascending: true });
    const { data, error } = deltaFrom
      ? await baseQuery.gt('created_at', deltaFrom)
      : await baseQuery;
    if (conversationId !== selectedConvIdRef.current) return false;
    if (error) {
      console.warn('loadMessages error', error);
      toast({
        title: 'Não foi possível carregar as mensagens',
        description: error.message || 'Verifique suas permissões e recarregue o chat.',
        variant: 'destructive',
      });
      addDebugLog('error', '[Inbound] Falha na gravação/leitura de mensagens', error);
      return false;
    }
    const fetched = (data || []).map(hydrateChatMessage);
    // Merge com cache quando fizemos delta; senão, é full replace.
    const cachedItems = (cached?.items || []).map(hydrateChatMessage);
    const byId = new Map<string, any>();
    (deltaFrom ? cachedItems : []).concat(fetched).forEach((m: any) => {
      const k = String(m.id || m.client_msg_id || `${m.created_at}:${m.content || ''}`);
      byId.set(k, m);
    });
    const hydrated = Array.from(byId.values()).sort((a, b) =>
      Date.parse(String(a.created_at || 0)) - Date.parse(String(b.created_at || 0))
    );
    setMessages((prev) => applyConversationMessagesAfterSwitch({
      currentConversationId: selectedConvIdRef.current,
      requestedConversationId: conversationId,
      previousMessages: prev,
      loadedMessages: hydrated,
    }));
    // Grava snapshot atualizado no cache local (fire-and-forget).
    void setCachedMessages(activeOwnerIdRef.current, conversationId, hydrated);
    const last = hydrated[hydrated.length - 1];
    setInboundDebug((prev) => ({
      ...prev,
      renderedMessages: hydrated.length,
      lastChatMessageId: last?.id || prev.lastChatMessageId,
      lastProviderMessageId: last?.uaz_msg_id || prev.lastProviderMessageId,
      lastSenderLid: last?.metadata?.sender_lid || prev.lastSenderLid,
      lastEventAt: last?.created_at || prev.lastEventAt,
    }));
    addDebugLog('info', `[Inbound] Render atualizado por ${source}`, {
      customer_id: conversationId,
      owner_id: activeOwnerIdRef.current,
      message_count: hydrated.length,
      last_message_id: last?.id,
      provider_message_id: last?.uaz_msg_id,
      sender_lid: last?.metadata?.sender_lid,
    });
    return true;
  };

  const showSendErrorToast = (err: unknown) => {
    const normalized = normalizeChatSendError(err);
    toast({
      title: normalized.title,
      description: normalized.message,
      variant: 'destructive',
    });
    addDebugLog('error', `[WhatsApp] ${normalized.code}: ${normalized.detail}`, normalized);
    return normalized;
  };

  useEffect(() => {
    async function checkProviderStatus(channel: ChannelKey, isManual = false) {
      if (isManual) setIsRefreshing(true);

      if (channel === 'whatsapp' && !activeOwnerId) {
        setActiveWhatsAppConn(null);
        setConnectedProviders([]);
        setWhatsappStatus(prev => ({
          ...prev,
          connected: false,
          loading: accessLoading,
          dbStatus: 'disconnected',
          error: accessLoading ? undefined : 'Owner ativo não resolvido.',
        }));
        setAuthValidation({
          valid: false,
          reason: accessLoading ? 'Resolvendo owner ativo…' : 'Owner ativo não resolvido. Atualize o access antes de consultar mensagens.',
          loading: accessLoading,
        });
        if (isManual) setIsRefreshing(false);
        return;
      }
      
      const providerName = channel === 'whatsapp' ? 'WhatsApp via status persistido' : channel.toUpperCase();
      addDebugLog('request', `Lendo status: ${providerName}`);
      
      try {
        if (channel === 'whatsapp') {
          let connQuery = supabase
            .from('whatsapp_connections')
            .select('*')
            .in('provider', ['meta', 'evolution', 'waha']);

          if (activeOwnerId) connQuery = connQuery.eq('owner_id', activeOwnerId);

          const { data: connections, error: connError } = await connQuery.order('updated_at', { ascending: false });

          if (connError) {
            addDebugLog('error', 'Erro ao ler conexões WhatsApp no banco', connError);
            setActiveWhatsAppConn(null);
            setConnectedProviders([]);
            setWhatsappStatus({ connected: false, loading: false, dbStatus: 'offline', error: 'Falha ao ler conexões no banco' });
            setAuthValidation({ valid: false, reason: 'Falha ao ler conexões no banco.', loading: false });
            return;
          }

          const allConnections = (connections || []) as WhatsAppConnection[];
          const summary = getWhatsAppDbSummary(allConnections);
          const isConnected = summary.status === 'active';

          setActiveWhatsAppConn(summary.primary);
          setConnectedProviders(summary.labels);
          setWhatsappStatus({
            connected: isConnected,
            loading: false,
            dbStatus: summary.status,
            phone: getConnectionPhoneFromDb(summary.primary),
            error: isConnected ? undefined : summary.status === 'offline' ? 'Conexões configuradas, mas nenhuma marcada como connected no banco.' : 'Nenhuma conexão WhatsApp configurada.',
          });

          setAuthValidation({
            valid: isConnected,
            reason: isConnected ? undefined : summary.status === 'offline'
              ? `${summary.labels.join(' + ') || 'WhatsApp'} está Offline no banco de dados.`
              : 'Nenhuma conexão WhatsApp configurada.',
            loading: false,
          });

          addDebugLog('info', `Status persistido: ${summary.labels.join(' + ') || 'WHATSAPP'} = ${summary.status}`, {
            total: allConnections.length,
            connected: summary.connectedCount,
            providers: summary.labels,
          });

          // Sempre carrega o histórico de conversas — independente do status
          // da conexão. A conexão em `connecting`/`offline` só impede envio de
          // novas mensagens, mas o usuário precisa continuar vendo o
          // ambiente do WhatsApp (contatos + histórico) normalmente.
          if (isConnected) {
            addDebugLog('info', `Status: ATIVO (${summary.labels.join(' + ')}). Iniciando carga de contatos.`);
            loadInboundPipelineDebug(summary.primary, activeOwnerId);
            triggerWahaInboundBackfill(summary.primary, activeOwnerId, 'provider_status_connected');
          } else {
            addDebugLog('info', `Status: ${summary.status}. Carregando histórico sem envio ativo.`);
          }
          loadConversations(channel);
        } else if (channel === 'telegram') {
          // Mock Telegram connection validation
          addDebugLog('info', 'Validando conexão Telegram via API...');
          setTimeout(() => {
            addDebugLog('info', 'Telegram Conectado com sucesso.');
            loadConversations(channel);
          }, 800);
        } else {
          // Other channels fallback
          loadConversations(channel);
        }
      } catch (err: any) {
        addDebugLog('error', `Exceção durante verificação ${channel}`, err);
        if (channel === 'whatsapp') {
          setWhatsappStatus({ connected: false, loading: false, dbStatus: 'offline', error: 'Falha ao verificar status' });
          setAuthValidation({ valid: false, reason: 'Erro ao validar acesso.', loading: false });
        }
      } finally {
        if (isManual) setIsRefreshing(false);
      }
    }

    // Export functions to window
    // @ts-ignore
    window.manualRefreshChannel = (channel: ChannelKey) => checkProviderStatus(channel, true);
    // @ts-ignore
    window.manualRefreshWhatsApp = () => checkProviderStatus('whatsapp', true);


    async function loadConversations(channel: ChannelKey) {
      addDebugLog('request', `Buscando contatos ${channel} no banco de dados`);

      if (!activeOwnerId) {
        setAuthValidation({ valid: false, reason: accessLoading ? 'Resolvendo owner ativo…' : 'Owner ativo não resolvido. Atualize o access antes de consultar mensagens.', loading: accessLoading });
        return;
      }

      // Hidratação instantânea: pinta a lista de conversas a partir do cache
      // local antes do fetch de rede — carregamento parece imediato ao voltar.
      try {
        const cachedConvs = await getCachedConvs<any>(activeOwnerId, channel);
        if (cachedConvs?.length) {
          setConvs(prev => {
            const next = { ...prev, [channel]: cachedConvs };
            convsRef.current = next;
            return next;
          });
        }
      } catch {}

      const { data: customers, error } = await supabase
        .from('customers')
        .select('*')
        .eq('owner_id', activeOwnerId)
        .order('updated_at', { ascending: false });

      if (error) {
        addDebugLog('error', `Erro ao carregar clientes (${channel})`, error);
        return;
      }

      if (customers) {
        // Filter customers by channel if needed (for now showing all as per current logic, 
        // but we can add channel filter if customers table has it)
        const channelCustomers = customers.filter(c => {
          if (channel === 'whatsapp') return c.channel === 'whatsapp' || (!c.channel && c.phone && !c.phone.includes('@telegram'));
          if (channel === 'telegram') return c.channel === 'telegram' || c.phone?.includes('@telegram') || c.email?.includes('@telegram');
          if (channel === 'instagram') return c.channel === 'instagram' || c.phone?.includes('@instagram');
          if (channel === 'facebook') return c.channel === 'facebook' || c.phone?.includes('@facebook');
          if (channel === 'linkedin') return c.channel === 'linkedin' || c.phone?.includes('@linkedin');
          if (channel === 'tiktok') return c.channel === 'tiktok' || c.phone?.includes('@tiktok');
          if (channel === 'youtube') return c.channel === 'youtube' || c.phone?.includes('@youtube');
          if (channel === 'widget') return c.channel === 'widget' || c.phone?.includes('@widget');
          return true;
        });

        addDebugLog('info', `${channelCustomers.length} contatos encontrados. Buscando últimas mensagens.`);
        
        const customerIds = channelCustomers.map((c) => c.id).filter(Boolean);
        const { data: lastMessages } = customerIds.length
          ? await (supabase as any).rpc('get_latest_chat_messages_for_customers', { _customer_ids: customerIds })
          : { data: [] as any[] };

        const byIdentity = new Map<string, any>();
        channelCustomers.forEach(c => {
          const lastMsg = lastMessages?.find(m => m.customer_id === c.id);
          const pres = computePresence((c as any).presence, (c as any).presence_updated_at, (c as any).last_seen_at);
          const phoneDigits = String(c.phone || '').replace(/\D/g, '');
          const identity = `${channel}:${phoneDigits || c.email || c.id}`;
          const sortAt = lastMsg?.created_at || c.updated_at;
          const row = {
            id: c.id,
            name: c.name || c.phone || 'Cliente sem nome',
            msg: lastMsg?.content || 'Sem mensagens ainda',
            time: lastMsg
              ? new Date(lastMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : new Date(c.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            online: pres.online,
            presenceLabel: pres.label,
            presence: (c as any).presence || null,
            lastSeenAt: (c as any).last_seen_at || null,
            botEnabled: false,
            assignedTo: '',
            phone: c.phone,
            owner_id: (c as any).owner_id || null,
            sub_company_id: (c as any).sub_company_id || null,
            avatar_url: (c as any).avatar_url || null,
            email: c.email || null,
            is_archived: !!(c as any).is_archived,
            is_muted: !!(c as any).is_muted,
            muted_until: (c as any).muted_until || null,
            label_ids: Array.isArray((c as any).label_ids) ? (c as any).label_ids : [],
            _sortAt: sortAt,
            _duplicateKey: identity,
          };
          const current = byIdentity.get(identity);
          if (!current || Date.parse(sortAt) > Date.parse(current._sortAt || '')) byIdentity.set(identity, row);
        });

        const formatted = Array.from(byIdentity.values())
          .sort((a, b) => Date.parse(b._sortAt || '') - Date.parse(a._sortAt || ''))
          .map(({ _sortAt, _duplicateKey, ...row }) => row);

        
        setConvs(prev => {
          const next = { ...prev, [channel]: formatted };
          convsRef.current = next;
          return next;
        });
        // Persiste snapshot da lista para próxima abertura instantânea.
        void setCachedConvs(activeOwnerId, channel, formatted);
        if (selectedConvIdRef.current && formatted.some((c: any) => c.id === selectedConvIdRef.current)) {
          loadMessagesForConversation(selectedConvIdRef.current, 'manual');
        }
        addDebugLog('info', `Conversas ${channel} formatadas e carregadas na UI`, {
          contatos_carregados: channelCustomers.length,
          conversas_unificadas: formatted.length,
        });
      }
    }

    if (activeChannel) {
      checkProviderStatus(activeChannel);
    } else {
      checkProviderStatus('whatsapp');
    }
    
    // Polling interval with basic backoff logic simulation
    const interval = setInterval(() => {
      if (activeChannel === 'whatsapp' && !whatsappStatus.connected) {
        addDebugLog('info', 'Polling: relendo status persistido do WhatsApp...');
        checkProviderStatus('whatsapp');
      } else if (activeChannel) {
        checkProviderStatus(activeChannel);
      }
    }, 60000); // 60s — equilíbrio entre frescor e consumo de API


    // Realtime subscription
    const channel = supabase
      .channel('chat_updates')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
        const row: any = payload.new;
        if (!row) return;
        const currentOwner = activeOwnerIdRef.current;
        const visibleConv = Object.values(convsRef.current).flat().find((c: any) => c.id === row.customer_id);
        if (visibleConv && visibleConv.owner_id !== currentOwner) return;
        if (!visibleConv && currentOwner) {
          const { data: customer } = await supabase
            .from('customers')
            .select('id, owner_id, channel')
            .eq('id', row.customer_id)
            .maybeSingle();
          if (!customer || (customer as any).owner_id !== currentOwner) return;
          const currentChannel = activeChannelRef.current;
          if (currentChannel && ((customer as any).channel === currentChannel || currentChannel === 'whatsapp')) {
            await loadConversations(currentChannel);
          }
        }
        setInboundDebug((prev) => ({
          ...prev,
          realtimeSeen: prev.realtimeSeen + 1,
          lastChatMessageId: row.id || prev.lastChatMessageId,
          lastProviderMessageId: row.uaz_msg_id || prev.lastProviderMessageId,
          lastSenderLid: row.metadata?.sender_lid || prev.lastSenderLid,
          lastOwnerId: currentOwner || prev.lastOwnerId,
          lastEventAt: row.created_at || new Date().toISOString(),
        }));
        addDebugLog('info', '[Inbound] Nova mensagem recebida via Realtime', {
          message_id: row.id,
          provider_message_id: row.uaz_msg_id,
          sender_lid: row.metadata?.sender_lid,
          owner_id: currentOwner,
          customer_id: row.customer_id,
          connection_id: row.connection_id,
        });
        if (row.customer_id === selectedConvIdRef.current) {
          setMessages(prev => {
            const cid = row.client_msg_id;
            if (cid && prev.some(m => m.client_msg_id === cid || m.id === cid)) {
              return prev.map(m => (m.client_msg_id === cid || m.id === cid) ? hydrateChatMessage({ ...m, ...row, status: row.metadata?.status || row.status || m.status }) : m);
            }
            if (prev.some(m => m.id === row.id)) return prev;
            const next = [...prev, hydrateChatMessage(row)];
            setInboundDebug((dbg) => ({ ...dbg, renderedMessages: next.length }));
            return next;
          });
        }
        if (activeChannelRef.current) loadConversations(activeChannelRef.current);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, (payload) => {
        const row: any = payload.new;
        if (!row?.id) return;
        if (row.customer_id === selectedConvId) {
          setMessages(prev => prev.map(m => (m.id === row.id || (row.client_msg_id && m.client_msg_id === row.client_msg_id)) ? hydrateChatMessage({ ...m, ...row }) : m));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_connections' }, (payload) => {
        const row: any = payload.new || payload.old;
        if (row?.owner_id && activeOwnerIdRef.current && row.owner_id !== activeOwnerIdRef.current) return;
        addDebugLog('info', 'Conexão WhatsApp atualizada no banco; relendo status persistido.');
        checkProviderStatus('whatsapp');
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'customers' }, (payload) => {
        const c: any = payload.new;
        if (!c?.id || !activeOwnerIdRef.current || c.owner_id !== activeOwnerIdRef.current) return;
        const currentChannel = activeChannelRef.current;
        if (!currentChannel) return;
        if (currentChannel === 'whatsapp' && (c.channel === 'whatsapp' || (!c.channel && c.phone && !String(c.phone).includes('@telegram')))) {
          loadConversations(currentChannel);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'customers' }, (payload) => {
        const c: any = payload.new;
        if (!c?.id || (activeOwnerIdRef.current && c.owner_id !== activeOwnerIdRef.current)) return;
        const pres = computePresence(c.presence, c.presence_updated_at, c.last_seen_at);
        setConvs(prev => {
          const next: any = { ...prev };
          (Object.keys(next) as ChannelKey[]).forEach(k => {
            next[k] = next[k].map((conv: any) =>
              conv.id === c.id
                ? { ...conv, name: (typeof c.name === 'string' && c.name.trim()) ? c.name : conv.name, avatar_url: c.avatar_url ?? conv.avatar_url, online: pres.online, presenceLabel: pres.label, presence: c.presence, lastSeenAt: c.last_seen_at, is_archived: !!c.is_archived, is_muted: !!c.is_muted, muted_until: c.muted_until || null, label_ids: Array.isArray(c.label_ids) ? c.label_ids : conv.label_ids }
                : conv
            );
          });
          return next;
        });
      })
      .subscribe();

    // Realtime simulation for delivery receipts
    const receiptTimer = setInterval(() => {
      if (activeChannel === 'telegram') {
        setMessages(prev => prev.map(msg => {
          if (msg.sender_type === 'agent' && msg.status === 'sent') return { ...msg, status: 'delivered' };
          if (msg.sender_type === 'agent' && msg.status === 'delivered') return { ...msg, status: 'read' };
          return msg;
        }));
      }
    }, 10000);

    return () => {
      clearInterval(interval);
      clearInterval(receiptTimer);
      supabase.removeChannel(channel);
    };
  }, [selectedConvId, whatsappStatus.connected, activeChannel, activeOwnerId, accessLoading]);

  useEffect(() => {
    const onRenamed = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id?: string; name?: string } | undefined;
      if (!detail?.id || !detail?.name) return;
      setConvs(prev => {
        const next: any = { ...prev };
        (Object.keys(next) as ChannelKey[]).forEach(k => {
          next[k] = next[k].map((conv: any) => conv.id === detail.id ? { ...conv, name: detail.name } : conv);
        });
        return next;
      });
    };
    window.addEventListener('customer:renamed', onRenamed);
    return () => window.removeEventListener('customer:renamed', onRenamed);
  }, []);

  useEffect(() => {
    // Real-time listener for connection events (Omnichannel Diagnostics)
    const channel = supabase
      .channel('connection_events_monitor')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'connection_events' 
      }, async (payload) => {
        const newEvent = payload.new;
        addDebugLog(
          newEvent.status === 'success' ? 'info' : 'error', 
          `[Omnichannel] Novo evento: ${newEvent.event_type}`, 
          newEvent
        );

        // Toast notifications for specific critical events
        if (newEvent.event_type === 'lead' && newEvent.status === 'success') {
          toast({ 
            title: 'Novo Lead Capturado!', 
            description: `Um novo lead vindo do Widget acaba de ser registrado.` 
          });
        } else if (newEvent.status === 'failure') {
          // Check for consecutive failures logic (simplified for frontend demo)
          const { data: recentFailures } = await supabase
            .from('connection_events')
            .select('id')
            .eq('connection_id', newEvent.connection_id)
            .eq('status', 'failure')
            .order('created_at', { ascending: false })
            .limit(5);

          if (recentFailures && recentFailures.length >= 3) {
            toast({ 
              variant: 'destructive',
              title: 'ALERTA CRÍTICO: Falhas Consecutivas', 
              description: `O canal detectou múltiplas falhas seguidas. Verifique o painel de conexões.` 
            });
          } else {
            toast({ 
              variant: 'destructive',
              title: 'Falha detectada', 
              description: `Erro no canal ${newEvent.event_type}: ${newEvent.error_message}` 
            });
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!selectedConvId) return;
    let cancelled = false;
    const convAtStart = selectedConvId;
    (async () => {
      await loadMessagesForConversation(convAtStart, 'select');
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [selectedConvId, activeChannel, activeOwnerId]);

  // Autofocus composer when a conversation is selected
  useEffect(() => {
    if (!selectedConvId) return;
    const t = setTimeout(() => {
      const el = document.querySelector<HTMLTextAreaElement>('textarea[data-composer="1"]');
      el?.focus();
    }, 120);
    return () => clearTimeout(t);
  }, [selectedConvId]);

  // Subscribe to recipient presence updates (Evolution) whenever a WhatsApp conversation opens.
  useEffect(() => {
    if (!selectedConvId || activeChannel !== 'whatsapp' || !activeWhatsAppConn) return;
    if (activeWhatsAppConn.provider !== 'evolution') return;
    const conv = convs.whatsapp.find(c => c.id === selectedConvId);
    if (!conv?.phone) return;
    supabase.functions
      .invoke('evolution-instance', {
        body: { action: 'subscribe_presence', connection_id: activeWhatsAppConn.id, number: conv.phone },
      })
      .catch(() => {});
  }, [selectedConvId, activeChannel, activeWhatsAppConn, convs.whatsapp]);

  // Etapa 5 (WAHA) — ao abrir uma conversa: assina presença do contato (engines
  // GOWS/NOWEB) e marca as mensagens como lidas (envia recibos ao remetente).
  useEffect(() => {
    if (!selectedConvId || activeChannel !== 'whatsapp' || !activeWhatsAppConn) return;
    if (activeWhatsAppConn.provider !== 'waha') return;
    const adapter = getProviderAdapter('waha');
    // Último message_id inbound da conversa (para o "visto" apontar exatamente a mensagem).
    const lastInbound = [...messages]
      .reverse()
      .find((m: any) => m?.sender_type === 'client' && m?.uaz_msg_id);
    adapter.subscribePresence?.(activeWhatsAppConn, selectedConvId).catch(() => {});
    adapter.markAsRead?.(activeWhatsAppConn, selectedConvId, lastInbound?.uaz_msg_id ?? null).catch(() => {});
    // Etapa 6 — sincroniza foto/nome/"sobre" do contato (throttled: 1x a cada 12h).
    (async () => {
      try {
        const { data: cust } = await supabase
          .from('customers').select('profile_synced_at').eq('id', selectedConvId).single();
        const last = (cust as any)?.profile_synced_at ? Date.parse((cust as any).profile_synced_at) : 0;
        if (Date.now() - last < 12 * 60 * 60 * 1000) return;
        await adapter.syncContactProfile?.(activeWhatsAppConn, selectedConvId);
      } catch { /* silencioso */ }
    })();
  }, [selectedConvId, activeChannel, activeWhatsAppConn, messages.length]);

  // Etapa 5 (WAHA) — envia "digitando…" com debounce estável para reduzir flicker.
  // Estratégia: quando o texto muda de vazio→preenchido, envia 'typing' imediatamente
  // e mantém um refresh a cada 5s (janela WhatsApp ~10s). Ao ficar 6s sem alteração
  // ou ao esvaziar, envia 'paused'. Usamos refs para não recriar timers a cada tecla.
  const typingStateRef = useRef<'idle' | 'typing'>('idle');
  const typingRefreshRef = useRef<number | null>(null);
  const typingPauseRef = useRef<number | null>(null);
  useEffect(() => {
    if (activeChannel !== 'whatsapp' || !activeWhatsAppConn || activeWhatsAppConn.provider !== 'waha' || !selectedConvId) return;
    const adapter = getProviderAdapter('waha');
    const hasText = messageText.trim().length > 0;

    const clearTimers = () => {
      if (typingRefreshRef.current) { clearInterval(typingRefreshRef.current); typingRefreshRef.current = null; }
      if (typingPauseRef.current) { clearTimeout(typingPauseRef.current); typingPauseRef.current = null; }
    };

    if (!hasText) {
      if (typingStateRef.current === 'typing') {
        typingStateRef.current = 'idle';
        adapter.sendTyping?.(activeWhatsAppConn, selectedConvId, 'paused').catch(() => {});
      }
      clearTimers();
      return;
    }

    if (typingStateRef.current !== 'typing') {
      typingStateRef.current = 'typing';
      adapter.sendTyping?.(activeWhatsAppConn, selectedConvId, 'typing').catch(() => {});
      typingRefreshRef.current = window.setInterval(() => {
        adapter.sendTyping?.(activeWhatsAppConn, selectedConvId, 'typing').catch(() => {});
      }, 5_000);
    }

    if (typingPauseRef.current) clearTimeout(typingPauseRef.current);
    typingPauseRef.current = window.setTimeout(() => {
      typingStateRef.current = 'idle';
      adapter.sendTyping?.(activeWhatsAppConn, selectedConvId, 'paused').catch(() => {});
      if (typingRefreshRef.current) { clearInterval(typingRefreshRef.current); typingRefreshRef.current = null; }
    }, 6_000);

    return () => { /* mantém timers ativos enquanto o efeito reroda a cada tecla */ };
  }, [messageText, selectedConvId, activeChannel, activeWhatsAppConn]);

  // Ao trocar de conversa, força reset do estado local de typing.
  useEffect(() => {
    typingStateRef.current = 'idle';
    if (typingRefreshRef.current) { clearInterval(typingRefreshRef.current); typingRefreshRef.current = null; }
    if (typingPauseRef.current) { clearTimeout(typingPauseRef.current); typingPauseRef.current = null; }
  }, [selectedConvId]);


  const list = activeChannel ? convs[activeChannel] : [];
  const selectedConv = list.find((c) => c.id === selectedConvId) || (selectedConvId ? null : list[0]);
  const selectedConvOwnerId = (selectedConv as any)?.owner_id ?? null;
  const ownerScopeOk = !selectedConv || canUseTenantRecord(activeOwnerId, selectedConvOwnerId);
  const activeOwnerShort = activeOwnerId ? `${activeOwnerId.slice(0, 8)}…${activeOwnerId.slice(-4)}` : 'não resolvido';
  const selectedOwnerShort = selectedConvOwnerId ? `${selectedConvOwnerId.slice(0, 8)}…${selectedConvOwnerId.slice(-4)}` : 'sem owner';

  const refreshOwnerAccess = async () => {
    setIsRefreshing(true);
    await reloadAccess();
    setIsRefreshing(false);
    toast({ title: 'Access atualizado', description: 'Owner ativo recarregado sem precisar apertar F5.' });
  };

  const ensureActiveOwnerScope = () => {
    if (accessLoading) {
      toast({ title: 'Access carregando', description: 'Aguarde a resolução do owner antes de enviar.', variant: 'destructive' });
      return false;
    }
    if (!activeOwnerId) {
      toast({ title: 'Owner não resolvido', description: 'Atualize o access antes de enviar ou consultar.', variant: 'destructive' });
      return false;
    }
    if (selectedConv && !canUseTenantRecord(activeOwnerId, selectedConvOwnerId)) {
      toast({ title: 'Envio bloqueado por owner incorreto', description: `Owner ativo ${activeOwnerShort}; conversa ${selectedOwnerShort}.`, variant: 'destructive' });
      return false;
    }
    if (activeWhatsAppConn?.owner_id && activeWhatsAppConn.owner_id !== activeOwnerId) {
      toast({ title: 'Conexão fora do owner ativo', description: 'Recarregue o access ou revise a conexão WhatsApp.', variant: 'destructive' });
      return false;
    }
    return true;
  };

  useEffect(() => {
    const owner = activeWhatsAppConn?.owner_id || (selectedConv as any)?.owner_id || wavoip.scope.owner_id;
    if (!owner) {
      setWavoipLineBusy({ busy: false, tooltip: 'Linha Wavoip livre' });
      return;
    }

    let cancelled = false;
    const applyRows = (rows: any[] | null | undefined) => {
      if (cancelled) return;
      const freshCutoff = Date.now() - 45_000;
      const row = (rows || []).find((r) => {
        const hb = Date.parse(r.last_heartbeat_at || r.updated_at || r.since || '');
        return r.status === 'in_call' && Number.isFinite(hb) && hb >= freshCutoff;
      });
      if (!row) {
        setWavoipLineBusy({ busy: false, tooltip: 'Linha Wavoip livre' });
        return;
      }
      setWavoipLineBusy({
        busy: true,
        phone: row.phone,
        since: row.since,
        userId: row.user_id,
        tooltip: `Linha Wavoip ocupada${row.phone ? ` com ${row.phone}` : ''}${row.since ? ` desde ${new Date(row.since).toLocaleTimeString('pt-BR')}` : ''}`,
      });
    };
    const loadLineState = async () => {
      const since = new Date(Date.now() - 45_000).toISOString();
      const { data, error } = await (supabase as any)
        .from('wavoip_line_state')
        .select('*')
        .eq('owner_id', owner)
        .eq('status', 'in_call')
        .gte('last_heartbeat_at', since)
        .order('last_heartbeat_at', { ascending: false })
        .limit(5);
      if (!error) applyRows(data);
    };

    loadLineState();
    const channel = supabase
      .channel(`wavoip_line_state_${owner}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wavoip_line_state', filter: `owner_id=eq.${owner}` }, loadLineState)
      .subscribe();
    const timer = setInterval(loadLineState, 20_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [activeWhatsAppConn?.owner_id, selectedConv?.id, wavoip.scope.owner_id]);

  const toggleBot = (id: string) => {
    if (!activeChannel) return;
    toast({ title: 'Bot atualizado', description: 'Estado do agente alterado para essa conversa.' });
  };

  const setBotAgent = (id: string, botId: string) => {
    if (!activeChannel) return;
    toast({ title: 'Agente IA atribuído', description: aiAgents.find((a) => a.id === botId)?.name });
  };

  const handleTransfer = () => {
    if (!transferTarget || !selectedConv || !activeChannel) return;
    toast({ title: 'Conversa transferida', description: humanAgents.find((h) => h.id === transferTarget)?.name });
    setTransferOpen(false);
    setTransferTarget('');
  };

  const handleExportHistory = (type: 'csv' | 'pdf') => {
    if (!selectedConv) return;
    addDebugLog('info', `Exportando histórico (${type.toUpperCase()}) para ${selectedConv.name}`);
    toast({ 
      title: 'Exportação iniciada', 
      description: `Seu arquivo ${type.toUpperCase()} está sendo gerado para o intervalo selecionado.` 
    });
    
    // Simular download
    setTimeout(() => {
      toast({ title: 'Exportação concluída', description: `O arquivo ${selectedConv.name.replace(/\s/g, '_')}_history.${type} foi baixado.` });
    }, 2000);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError(null);
    if (!file) return;

    // Validation: 10MB limit for mock purposes
    if (file.size > 10 * 1024 * 1024) {
      setFileError("Arquivo muito grande. Limite de 10MB para Telegram.");
      return;
    }

    // Format validation
    const allowed = ['image/jpeg', 'image/png', 'application/pdf', 'application/zip', 'text/plain'];
    if (!allowed.includes(file.type) && !file.name.endsWith('.docx')) {
      setFileError("Formato não suportado. Use Imagens, PDF, ZIP ou TXT.");
      return;
    }

    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setFilePreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const handleLoadMoreMessages = async () => {
    if (isHistoryLoading || !hasMoreHistory || !selectedConvId) return;
    setIsHistoryLoading(true);
    addDebugLog('info', `Carregando mais mensagens para Telegram (Página ${historyPage + 1})...`);
    
    // Mock incremental loading
    await new Promise(r => setTimeout(r, 1000));
    
    const moreMessages = [
      { id: `old-${Date.now()}-1`, customer_id: selectedConvId, sender_type: 'client', content: 'Mensagem antiga carregada do histórico.', created_at: new Date(Date.now() - 86400000).toISOString(), status: 'read' },
      { id: `old-${Date.now()}-2`, customer_id: selectedConvId, sender_type: 'agent', content: 'Sim, entendi o ponto anterior.', created_at: new Date(Date.now() - 86400000 - 3600000).toISOString(), status: 'read' },
    ];
    
    setMessages(prev => [...moreMessages, ...prev]);
    setHistoryPage(prev => prev + 1);
    setIsHistoryLoading(false);
    
    if (historyPage >= 3) setHasMoreHistory(false); // Mock limit
  };

  const handleSendMessage = async () => {
    if ((!messageText && !selectedFile) || !selectedConvId) return;
    if (!ensureActiveOwnerScope()) return;
    
    if (isScheduling) {
      const scheduleTime = `${format(scheduledDate || new Date(), 'yyyy-MM-dd')} ${scheduledTime}`;
      addDebugLog('info', `Agendando mensagem para ${scheduleTime}`);
      
      const scheduledMsg = {
        id: crypto.randomUUID(),
        content: messageText,
        scheduledFor: scheduleTime,
        status: 'pending',
        channel: activeChannel,
        customer_id: selectedConvId,
        created_at: new Date().toISOString()
      };
      
      setScheduledMessages(prev => [...prev, scheduledMsg]);
      toast({ title: 'Mensagem agendada', description: `Sua mensagem será enviada em ${scheduleTime}` });
      
      setMessageText('');
      setSelectedFile(null);
      setFilePreview(null);
      setIsScheduling(false);
      return;
    }

    const clientMsgId = crypto.randomUUID();
    
    // 1. Feedback imediato na UI (otimista)
    const newMessage = {
      id: clientMsgId,
      client_msg_id: clientMsgId,
      customer_id: selectedConvId,
      sender_type: 'agent',
      content: messageText,
      channel: activeChannel,
      created_at: new Date().toISOString(),
      status: 'sending',
      _sentAt: Date.now(),
    };
    
    setMessages(prev => [...prev, newMessage]);
    const currentText = messageText;
    setMessageText('');

    // Persist optimistic row so refresh keeps the message
    try {
      await supabase.from('chat_messages').insert({
        client_msg_id: clientMsgId,
        customer_id: selectedConvId,
        sender_type: 'agent',
        content: currentText,
        channel: activeChannel,
        connection_id: activeWhatsAppConn?.id ?? null,
        correlation_id: clientMsgId,
        metadata: { status: 'sending', correlation_id: clientMsgId },
      });
    } catch (e) { /* persistence is best-effort */ }

    // 2. Chamar Adapter para envio
    try {
      if (activeChannel === 'whatsapp') {
        if (!activeWhatsAppConn) throw new Error('Conexão ativa não encontrada');
        const adapter = getProviderAdapter(activeWhatsAppConn.provider);
        const t0 = Date.now();
        const data = await adapter.sendMessage(activeWhatsAppConn, selectedConvId, currentText);
        const latency = Date.now() - t0;
        const evoId = extractProviderMessageId(data);
        setMessages(prev => prev.map(m => 
          m.id === clientMsgId ? { ...m, status: 'sent', uaz_msg_id: evoId, _latency: latency } : m
        ));
        await supabase.from('chat_messages')
          .update({ uaz_msg_id: evoId, metadata: { status: 'sent', latency_ms: latency } })
          .eq('client_msg_id', clientMsgId);
      } else if (activeChannel === 'telegram') {
        addDebugLog('request', 'Enviando mensagem via Telegram API...');
        await new Promise(r => setTimeout(r, 500));
        setMessages(prev => prev.map(m => m.id === clientMsgId ? { ...m, status: 'sent' } : m));
        setTimeout(() => setMessages(prev => prev.map(m => m.id === clientMsgId ? { ...m, status: 'delivered' } : m)), 1500);
        setTimeout(() => setMessages(prev => prev.map(m => m.id === clientMsgId ? { ...m, status: 'read' } : m)), 3000);
      } else {
        await new Promise(r => setTimeout(r, 400));
        setMessages(prev => prev.map(m => m.id === clientMsgId ? { ...m, status: 'sent' } : m));
      }

    } catch (err: any) {
      const normalized = showSendErrorToast(err);
      setMessages(prev => prev.map(m => 
        m.id === clientMsgId ? { ...m, status: 'error', _error: normalized.message, _errorCode: normalized.code, _blockedBy: normalized.blockedBy } : m
      ));
      await supabase.from('chat_messages')
        .update({ metadata: { status: 'error', error: normalized.message, error_detail: normalized.detail, error_code: normalized.code, blocked_by: normalized.blockedBy, retryable: normalized.retryable } })
        .eq('client_msg_id', clientMsgId);
    }

  };

  // New rich-composer handlers
  const sendOptimistic = async (content: string) => {
    if (!ensureActiveOwnerScope()) throw new Error('Owner ativo inválido para esta conversa.');
    const id = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id, client_msg_id: id, customer_id: selectedConvId, sender_type: 'agent',
      content, channel: activeChannel, created_at: new Date().toISOString(), status: 'sending',
      _sentAt: Date.now(),
    }]);
    try {
      await supabase.from('chat_messages').insert({
        client_msg_id: id,
        customer_id: selectedConvId,
        sender_type: 'agent',
        content,
        channel: activeChannel,
        connection_id: activeWhatsAppConn?.id ?? null,
        correlation_id: id,
        metadata: { status: 'sending', correlation_id: id },
      });
    } catch {}
    return id;
  };

  const markStatus = async (id: string, status: 'sent' | 'error', overrideId?: string, extra?: Record<string, any>) => {
    setMessages(prev => prev.map(m => (m.id === id || m.client_msg_id === id) ? hydrateChatMessage({ ...m, status, uaz_msg_id: overrideId || m.uaz_msg_id, ...(extra || {}) }) : m));
    try {
      await supabase.from('chat_messages')
        .update({ uaz_msg_id: overrideId ?? null, metadata: { status, ...(extra || {}) } })
        .eq('client_msg_id', id);
    } catch {}
  };

  const sendTextThroughActiveChannel = async (customerId: string, text: string, replyToProviderId?: string | null) => {
    if (activeChannel === 'whatsapp') {
      if (!activeWhatsAppConn) throw new Error('Conexão ativa não encontrada');
      const adapter = getProviderAdapter(activeWhatsAppConn.provider);
      addDebugLog('request', '[WhatsApp] Enviando texto pela conexão ativa', {
        provider: activeWhatsAppConn.provider,
        connection_id: activeWhatsAppConn.id,
        customer_id: customerId,
        text_length: text.length,
        has_text: text.trim().length > 0,
        reply_to: replyToProviderId || null,
      });
      return adapter.sendMessage(activeWhatsAppConn, customerId, text, undefined, replyToProviderId ? { replyTo: replyToProviderId } : undefined);
    }
    await new Promise(r => setTimeout(r, 400));
    return { key: { id: crypto.randomUUID() } };
  };

  const handleSendText = async (text: string) => {
    if (!selectedConvId || !text.trim()) return;
    if (!ensureActiveOwnerScope()) throw new Error('Owner ativo inválido para esta conversa.');
    // Snapshot the reply target BEFORE clearing so we can restore on error.
    const replyTarget = replyingTo;
    const replyProviderId: string | null = replyTarget?.uaz_msg_id || null;
    const quotedPreview = replyTarget ? {
      message_id: replyProviderId,
      body: (replyTarget.content || '').slice(0, 240),
      from_me: replyTarget.sender_type !== 'client',
      participant: null,
    } : null;
    // Etapa 3 — persist quoted preview locally right away so the bubble shows
    // the "answering: …" strip even before the ACK returns from WAHA.
    const id = await sendOptimistic(text);
    if (quotedPreview) {
      setMessages(prev => prev.map(m => (m.id === id || m.client_msg_id === id)
        ? hydrateChatMessage({ ...m, metadata: { ...(m.metadata || {}), quoted: quotedPreview } })
        : m));
    }
    setReplyingTo(null);
    try {
      const t0 = Date.now();
      const data = await sendTextThroughActiveChannel(selectedConvId, text, replyProviderId);
      await markStatus(id, 'sent', extractProviderMessageId(data), {
        latency_ms: Date.now() - t0,
        accepted_at: new Date().toISOString(),
        provider_response_ok: true,
        ...(quotedPreview ? { quoted: quotedPreview } : {}),
      });
    } catch (err: any) {
      const normalized = showSendErrorToast(err);
      await markStatus(id, 'error', undefined, {
        error: normalized.message,
        error_detail: normalized.detail,
        error_code: normalized.code,
        blocked_by: normalized.blockedBy,
        retryable: normalized.retryable,
        ...(quotedPreview ? { quoted: quotedPreview } : {}),
      });
      // Restore the composer's reply target so the user can retry.
      if (replyTarget) setReplyingTo(replyTarget);
      throw err;
    }
  };

  const retryFailedMessage = async (message: any) => {
    if (!message?.content || !selectedConvId) return;
    const msgId = message.client_msg_id || message.id;
    const meta = getMessageMetadata(message) || {};
    const currentAttempts = Number(meta.retry_count ?? 0);

    // Poison queue: after 3 attempts stop retrying and move to deadletter.
    if (currentAttempts >= 3) {
      try {
        await supabase.from('chat_message_deadletter').insert({
          correlation_id: (message as any).correlation_id || msgId,
          customer_id: message.customer_id || selectedConvId,
          owner_id: activeWhatsAppConn?.owner_id ?? null,
          connection_id: activeWhatsAppConn?.id ?? null,
          channel: message.channel || activeChannel,
          content: message.content,
          attempts: currentAttempts,
          last_error: (message as any)._error || meta.error || 'exceeded_max_retries',
          last_error_code: (message as any)._errorCode || meta.error_code || null,
          metadata: { ...(meta || {}), poisoned_at: new Date().toISOString() },
        });
      } catch { /* best-effort */ }
      await markStatus(msgId, 'error', undefined, {
        ...meta,
        poisoned: true,
        error: 'Falha persistente — mensagem movida para a fila de erros (deadletter). Verifique o painel de Debug.',
      });
      toast({ title: 'Fila de erros', description: 'Após 3 tentativas a mensagem foi movida para a poison queue.', variant: 'destructive' });
      return;
    }

    const nextAttempt = currentAttempts + 1;
    const backoffMs = Math.min(4000, 400 * Math.pow(2, currentAttempts));

    setMessages(prev => prev.map(m => (m.id === message.id || m.client_msg_id === msgId) ? { ...m, status: 'sending', _error: null, _blockedBy: null, _retrying: true } : m));
    await supabase.from('chat_messages')
      .update({ metadata: { ...meta, status: 'sending', retrying: true, retry_count: nextAttempt, retry_started_at: new Date().toISOString() } })
      .eq('client_msg_id', msgId);

    await new Promise(r => setTimeout(r, backoffMs));

    try {
      const t0 = Date.now();
      const data = await sendTextThroughActiveChannel(message.customer_id || selectedConvId, message.content, (message._quoted?.message_id || meta?.quoted?.message_id) || null);
      await markStatus(msgId, 'sent', extractProviderMessageId(data), {
        latency_ms: Date.now() - t0,
        accepted_at: new Date().toISOString(),
        retried_at: new Date().toISOString(),
        retry_count: nextAttempt,
        provider_response_ok: true,
      });
      toast({ title: 'Mensagem reenviada', description: `A fila retomou o envio (tentativa ${nextAttempt}/3).` });
    } catch (err: any) {
      const normalized = showSendErrorToast(err);
      await markStatus(msgId, 'error', undefined, {
        ...meta,
        error: normalized.message,
        error_detail: normalized.detail,
        error_code: normalized.code,
        blocked_by: normalized.blockedBy,
        retryable: normalized.retryable,
        retry_count: nextAttempt,
        retried_at: new Date().toISOString(),
      });
    }
  };

  const handleSendMedia = async (a: ComposerAttachment, caption: string) => {
    if (!selectedConvId) return;
    if (!ensureActiveOwnerScope()) throw new Error('Owner ativo inválido para esta conversa.');
    const id = await sendOptimistic(`📎 ${a.file.name}${caption ? ` — ${caption}` : ''}`);
    try {
      if (activeChannel === 'whatsapp' && activeWhatsAppConn) {
        const adapter = getProviderAdapter(activeWhatsAppConn.provider);
        if (!adapter.sendMedia) throw new Error('Este canal não suporta envio de mídia ainda.');
        const data = await adapter.sendMedia(activeWhatsAppConn, selectedConvId, a.file, caption);
        const mediaMeta = extractOutboundMediaMeta(data) || {};
        markStatus(id, 'sent', extractProviderMessageId(data), { accepted_at: new Date().toISOString(), provider_response_ok: true, ...mediaMeta });
      } else {
        await new Promise(r => setTimeout(r, 400));
        markStatus(id, 'sent');
      }
    } catch (err: any) {
      const normalized = showSendErrorToast(err);
      markStatus(id, 'error', undefined, { error: normalized.message, error_detail: normalized.detail, error_code: normalized.code, blocked_by: normalized.blockedBy, retryable: normalized.retryable });
      throw err;
    }
  };

  const handleSendAudio = async (blob: Blob, durationSec: number) => {
    if (!selectedConvId) return;
    if (!ensureActiveOwnerScope()) throw new Error('Owner ativo inválido para esta conversa.');
    const id = await sendOptimistic(`🎤 Áudio (${durationSec}s)`);
    try {
      if (activeChannel === 'whatsapp' && activeWhatsAppConn) {
        const adapter = getProviderAdapter(activeWhatsAppConn.provider);
        if (!adapter.sendAudio) throw new Error('Este canal não suporta áudio ainda.');
        const data = await adapter.sendAudio(activeWhatsAppConn, selectedConvId, blob);
        const mediaMeta = extractOutboundMediaMeta(data) || {};
        markStatus(id, 'sent', extractProviderMessageId(data), { accepted_at: new Date().toISOString(), provider_response_ok: true, media_duration: durationSec, ...mediaMeta });
      } else {
        await new Promise(r => setTimeout(r, 400));
        markStatus(id, 'sent');
      }
    } catch (err: any) {
      const normalized = showSendErrorToast(err);
      markStatus(id, 'error', undefined, { error: normalized.message, error_detail: normalized.detail, error_code: normalized.code, blocked_by: normalized.blockedBy, retryable: normalized.retryable });
      throw err;
    }
  };

  // Etapa 2 — reações. Toggle emoji na mensagem: passa "" para remover.
  // Aplica optimistic update local e delega ao adapter WAHA.
  const handleToggleReaction = async (message: any, emoji: string) => {
    if (!message || activeChannel !== 'whatsapp' || !activeWhatsAppConn) {
      toast({ title: 'Reações disponíveis apenas no WhatsApp', variant: 'destructive' });
      return;
    }
    const providerMessageId = message.uaz_msg_id;
    if (!providerMessageId) {
      toast({ title: 'Não é possível reagir', description: 'Aguarde a mensagem ser confirmada pelo provedor.', variant: 'destructive' });
      return;
    }
    const adapter = getProviderAdapter(activeWhatsAppConn.provider);
    if (!adapter.sendReaction) {
      toast({ title: 'Este canal ainda não suporta reações', variant: 'destructive' });
      return;
    }

    const prevReactions = { ...(message._reactions || {}) };
    const currentMine = prevReactions.me?.emoji || '';
    const nextEmoji = currentMine === emoji ? '' : emoji;
    const nextReactions = { ...prevReactions };
    if (nextEmoji) {
      nextReactions.me = { emoji: nextEmoji, from_me: true, at: new Date().toISOString() };
    } else {
      delete nextReactions.me;
    }

    // Optimistic
    setMessages(prev => prev.map(m => (m.id === message.id) ? { ...m, _reactions: nextReactions } : m));
    // Persist locally so refresh mantém o estado enquanto o webhook não chega.
    try {
      const meta = getMessageMetadata(message);
      await supabase.from('chat_messages')
        .update({ metadata: { ...meta, reactions: nextReactions, last_reaction_at: new Date().toISOString() } })
        .eq('id', message.id);
    } catch { /* best-effort */ }

    try {
      await adapter.sendReaction(activeWhatsAppConn, providerMessageId, nextEmoji, message.customer_id);
    } catch (err: any) {
      // Rollback on failure
      setMessages(prev => prev.map(m => (m.id === message.id) ? { ...m, _reactions: prevReactions } : m));
      toast({ title: 'Falha ao enviar reação', description: err?.message || String(err), variant: 'destructive' });
    }
  };



  // Etapa 4 — encaminhar mensagem para outro contato do mesmo canal.
  const handleForwardTo = async (message: any, toConvId: string) => {
    if (!message?.uaz_msg_id || activeChannel !== 'whatsapp' || !activeWhatsAppConn) {
      toast({ title: 'Encaminhamento indisponível', description: 'Mensagem ainda não confirmada pelo provedor.', variant: 'destructive' });
      return;
    }
    const adapter = getProviderAdapter(activeWhatsAppConn.provider);
    if (!adapter.forwardMessage) {
      toast({ title: 'Canal não suporta encaminhamento', variant: 'destructive' });
      return;
    }
    try {
      await adapter.forwardMessage(activeWhatsAppConn, message.uaz_msg_id, toConvId);
      toast({ title: 'Mensagem encaminhada' });
      setForwardTarget(null);
    } catch (err: any) {
      toast({ title: 'Falha ao encaminhar', description: err?.message || String(err), variant: 'destructive' });
    }
  };

  // Etapa 4 — editar texto da própria mensagem (janela WhatsApp 15min).
  const handleConfirmEdit = async () => {
    const message = editTarget;
    const newText = editText.trim();
    if (!message || !newText) { setEditTarget(null); return; }
    if (activeChannel !== 'whatsapp' || !activeWhatsAppConn) {
      toast({ title: 'Edição disponível apenas no WhatsApp', variant: 'destructive' });
      return;
    }
    const adapter = getProviderAdapter(activeWhatsAppConn.provider);
    if (!adapter.editMessage) {
      toast({ title: 'Canal não suporta edição', variant: 'destructive' });
      return;
    }
    const prevContent = message.content;
    // Optimistic
    setMessages(prev => prev.map(m => (m.id === message.id) ? { ...m, content: newText, _edited: true, _editedAt: new Date().toISOString() } : m));
    try {
      const meta = getMessageMetadata(message) || {};
      const edits = Array.isArray(meta.edits) ? meta.edits : [];
      edits.push({ at: new Date().toISOString(), from: prevContent });
      await supabase.from('chat_messages').update({
        content: newText,
        metadata: { ...meta, edited: true, edited_at: new Date().toISOString(), edits },
      }).eq('id', message.id);
      await adapter.editMessage(activeWhatsAppConn, message.uaz_msg_id, message.customer_id || selectedConvId, newText);
      toast({ title: 'Mensagem editada' });
      setEditTarget(null);
    } catch (err: any) {
      setMessages(prev => prev.map(m => (m.id === message.id) ? { ...m, content: prevContent } : m));
      toast({ title: 'Falha ao editar', description: err?.message || String(err), variant: 'destructive' });
    }
  };

  // Etapa 4 — apagar mensagem para todos (default) ou apenas para mim.
  const handleDeleteMessage = async (message: any, forEveryone = true) => {
    if (!message?.uaz_msg_id || activeChannel !== 'whatsapp' || !activeWhatsAppConn) {
      toast({ title: 'Exclusão indisponível', description: 'Mensagem ainda não confirmada pelo provedor.', variant: 'destructive' });
      return;
    }
    if (!window.confirm(forEveryone ? 'Apagar esta mensagem para todos?' : 'Apagar esta mensagem apenas para você?')) return;
    const adapter = getProviderAdapter(activeWhatsAppConn.provider);
    if (!adapter.deleteMessage) {
      toast({ title: 'Canal não suporta exclusão', variant: 'destructive' });
      return;
    }
    const prev = { content: message.content, revoked: message._revoked };
    setMessages(list => list.map(m => (m.id === message.id) ? { ...m, content: '[mensagem apagada]', _revoked: true } : m));
    try {
      const meta = getMessageMetadata(message) || {};
      await supabase.from('chat_messages').update({
        content: '[mensagem apagada]',
        metadata: { ...meta, revoked: true, revoked_at: new Date().toISOString(), original_content: meta.original_content ?? prev.content },
      }).eq('id', message.id);
      await adapter.deleteMessage(activeWhatsAppConn, message.uaz_msg_id, message.customer_id || selectedConvId, forEveryone);
      toast({ title: 'Mensagem apagada' });
    } catch (err: any) {
      setMessages(list => list.map(m => (m.id === message.id) ? { ...m, content: prev.content, _revoked: prev.revoked } : m));
      toast({ title: 'Falha ao apagar', description: err?.message || String(err), variant: 'destructive' });
    }
  };

  const handleSendRich = async (payload: RichPayload) => {
    if (!selectedConvId) return;
    if (!ensureActiveOwnerScope()) throw new Error('Owner ativo inválido para esta conversa.');
    const labelMap: Record<string, string> = {
      location: '📍 Localização',
      contact: '👤 Contato',
      poll: '📊 Enquete',
      list: '📋 Lista interativa',
      buttons: '🔘 Botões',
      product: '🛍️ Produto',
      signature: '📄 Documento de assinatura',
    };
    const summary =
      payload.type === 'location' ? `📍 ${payload.name || `${payload.latitude}, ${payload.longitude}`}` :
      payload.type === 'contact' ? `👤 ${payload.fullName} · ${payload.phone}` :
      payload.type === 'poll' ? `📊 ${payload.name}` :
      payload.type === 'list' ? `📋 ${payload.title || payload.description}` :
      payload.type === 'buttons' ? `🔘 ${payload.description}` :
      payload.type === 'product' ? `🛍️ ${payload.name}` :
      payload.type === 'signature' ? `📄 ${payload.title}` :
      labelMap[(payload as any).type] || 'Mensagem rica';
    const id = await sendOptimistic(summary);
    try {
      if (activeChannel === 'whatsapp' && activeWhatsAppConn) {
        const adapter = getProviderAdapter(activeWhatsAppConn.provider);
        if (!adapter.sendRich) throw new Error('Este canal ainda não suporta este tipo de mensagem.');
        const data = await adapter.sendRich(activeWhatsAppConn, selectedConvId, payload);
        markStatus(id, 'sent', extractProviderMessageId(data), { accepted_at: new Date().toISOString(), provider_response_ok: true });
        toast({ title: 'Enviado', description: summary });
      } else {
        await new Promise(r => setTimeout(r, 300));
        markStatus(id, 'sent');
      }
    } catch (err: any) {
      const normalized = showSendErrorToast(err);
      markStatus(id, 'error', undefined, { error: normalized.message, error_detail: normalized.detail, error_code: normalized.code, blocked_by: normalized.blockedBy, retryable: normalized.retryable });
      throw err;
    }
  };




  // Painel principal: mini-cards de canais
  if (!activeChannel) {
    return (
      <AppLayout title="Chat Omnichannel" subtitle="Selecione um canal para ver leads e conversas">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {channels.map((ch, i) => {
            const Icon = ch.icon;
            const isWhatsApp = ch.key === 'whatsapp';
            const isPlaceholder = ['youtube', 'tiktok'].includes(ch.key);
            const whatsappProvidersLabel = connectedProviders.length > 0
              ? connectedProviders.join(' + ')
              : activeWhatsAppConn
                ? providerLabel(activeWhatsAppConn.provider)
                : 'WHATSAPP';
            const WhatsAppStatusIcon = whatsappStatus.dbStatus === 'active' ? CheckCircle2 : AlertCircle;
            
            return (
              <motion.button
                key={ch.key}
                onClick={() => setActiveChannel(ch.key)}
                className={`glass-card p-5 text-left hover:border-primary/40 transition-all group relative overflow-hidden ${isPlaceholder ? 'opacity-90' : ''}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -3 }}
              >
                <div className="absolute top-3 right-3">
                  {isWhatsApp ? (
                    whatsappStatus.loading ? (
                      isOwner ? <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" /> : null
                    ) : !isOwner ? null : whatsappStatus.dbStatus === 'disconnected' ? (
                      <Link to="/whatsapp" onClick={(e) => e.stopPropagation()} className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border hover:bg-destructive/20 transition-colors ${getWhatsAppStatusClasses(whatsappStatus.dbStatus)}`}>
                        <WhatsAppStatusIcon className="w-3 h-3 shrink-0" />
                        <span className="text-[10px] font-bold uppercase tracking-wider truncate">Desconectado</span>
                      </Link>
                    ) : (
                      <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border max-w-[220px] ${getWhatsAppStatusClasses(whatsappStatus.dbStatus)}`}>
                        <WhatsAppStatusIcon className="w-3 h-3 shrink-0" />
                        <span className="text-[10px] font-bold uppercase tracking-wider truncate">
                          {whatsappProvidersLabel} {getWhatsAppStatusLabel(whatsappStatus.dbStatus)}
                        </span>
                      </div>
                    )
                  ) : isPlaceholder ? (
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-bold uppercase tracking-tighter opacity-70">
                      Em Breve
                    </Badge>
                  ) : (
                    <div className="flex items-center gap-1.5 bg-success/10 px-2 py-0.5 rounded-full border border-success/20 opacity-0 group-hover:opacity-100 transition-opacity">
                      <CheckCircle2 className="w-3 h-3 text-success" />
                      <span className="text-[10px] font-bold text-success uppercase tracking-wider">Ativo</span>
                    </div>
                  )}
                </div>

                <div className={`w-12 h-12 rounded-2xl ${ch.bg} flex items-center justify-center mb-4`}>
                  <Icon className={`w-6 h-6 ${ch.color}`} />
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-1">{ch.name}</h3>
                {isWhatsApp && whatsappStatus.phone && !whatsappStatus.loading ? (
                  <p className="text-[10px] text-muted-foreground mb-2 font-medium">{whatsappStatus.phone}</p>
                ) : isPlaceholder ? (
                  <p className="text-[10px] text-muted-foreground mb-2 font-medium italic">Integração em desenvolvimento</p>
                ) : null}

                <div className="flex items-center gap-3 mt-3">
                  <div>
                    <p className="text-xl font-bold text-foreground">{ch.leads}</p>
                    <p className="text-[10px] text-muted-foreground">Leads</p>
                  </div>
                  <div className="w-px h-8 bg-border" />
                  <div>
                    <p className="text-xl font-bold text-primary">{ch.open}</p>
                    <p className="text-[10px] text-muted-foreground">Abertas</p>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        <div className="mt-6 glass-card p-5">
          <h3 className="text-sm font-semibold mb-2">Resumo geral</h3>
          <p className="text-xs text-muted-foreground">
            Total de {channels.reduce((a, c) => a + c.leads, 0)} leads e {channels.reduce((a, c) => a + c.open, 0)} conversas em aberto distribuídos pelos canais conectados.
          </p>
        </div>
        <GlobalSearchDialog open={globalSearchOpen} onOpenChange={setGlobalSearchOpen} />
      </AppLayout>
    );
  }

  const channelInfo = channels.find((c) => c.key === activeChannel)!;
  const ChannelIcon = channelInfo.icon;

  return (
    <AppLayout title="Chat Omnichannel" subtitle={`Canal ${channelInfo.name}`}>
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={() => { setActiveChannel(null); setSelectedConvId(null); }} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Canais
        </Button>
        <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full ${channelInfo.bg}`}>
          <ChannelIcon className={`w-3.5 h-3.5 ${channelInfo.color}`} />
          <span className={`text-xs font-medium ${channelInfo.color}`}>
            {channelInfo.name} 
            {channelInfo.key === 'whatsapp' && (connectedProviders.length > 0 || activeWhatsAppConn) && ` (${connectedProviders.length > 0 ? connectedProviders.join(' + ') : activeWhatsAppConn!.provider.toUpperCase()})`}
          </span>
        </div>
        {isOwner && (
          <div className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-medium ${ownerScopeOk ? 'border-success/30 text-success bg-success/10' : 'border-destructive/30 text-destructive bg-destructive/10'}`} data-testid="active-owner-scope">
            <ShieldAlert className="h-3 w-3" />
            Owner ativo: {activeOwnerShort}
          </div>
        )}
        {isOwner && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={refreshOwnerAccess}
            disabled={accessLoading || isRefreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${accessLoading || isRefreshing ? 'animate-spin' : ''}`} />
            Recarregar access
          </Button>
        )}
        {isOwner && !ownerScopeOk && selectedConv && (
          <Badge variant="outline" className="h-6 border-destructive/40 text-destructive">
            Conversa: {selectedOwnerShort}
          </Badge>
        )}
        {isOwner && (channelInfo.key === 'whatsapp' || channelInfo.key === 'telegram') && (
          <div className="flex items-center gap-2">
            {channelInfo.key === 'whatsapp' ? (
              whatsappStatus.dbStatus === 'active' ? (
                <Badge variant="outline" className="border-success/30 text-success text-[10px] h-5 gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5" /> ATIVO
                </Badge>
              ) : whatsappStatus.dbStatus === 'offline' ? (
                <Badge variant="outline" className="border-warning/30 text-warning text-[10px] h-5 gap-1">
                  <AlertCircle className="w-2.5 h-2.5" /> OFFLINE
                </Badge>
              ) : (
                <Badge variant="outline" className="border-destructive/30 text-destructive text-[10px] h-5 gap-1">
                  <AlertCircle className="w-2.5 h-2.5" /> DESCONECTADO
                </Badge>
              )
            ) : (
              <Badge variant="outline" className="border-success/30 text-success text-[10px] h-5 gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" /> ATIVO
              </Badge>
            )}
            <Button 
              variant="outline" 
              size="icon" 
              className={`h-7 w-7 ${isRefreshing ? 'animate-spin' : ''}`}
              onClick={() => {
                // @ts-ignore
                const check = window.manualRefreshChannel;
                if (typeof check === 'function') check(channelInfo.key);
                else window.location.reload();
              }}
              title={`Sincronizar ${channelInfo.name}`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => setShowDebugPanel(!showDebugPanel)}
              title={`Diagnóstico ${channelInfo.name}`}
            >
              <Bug className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>

      <div className="flex h-[calc(100vh-13rem)] glass-card overflow-hidden relative">
        {/* Painel de Diagnóstico */}
        <AnimatePresence>
          {showDebugPanel && (
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="absolute right-0 top-0 bottom-0 w-80 bg-background/95 backdrop-blur-md z-[100] border-l border-border flex flex-col shadow-2xl"
            >
              <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/30">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-bold uppercase tracking-wider">Diagnóstico {channelInfo?.name || 'Omni'}</h3>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowDebugPanel(false)}>
                  <ArrowLeft className="w-4 h-4 rotate-180" />
                </Button>
              </div>
              
              <div className="p-4 bg-muted/30 border-b border-border space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Autorização:</span>
                  {authValidation.loading ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : authValidation.valid ? (
                    <span className="text-success font-bold flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3" /> OK
                    </span>
                  ) : (
                    <span className="text-destructive font-bold flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3" /> BLOQUEADO
                    </span>
                  )}
                </div>
                {!authValidation.valid && authValidation.reason && (
                  <p className="text-[10px] text-destructive bg-destructive/5 p-2 rounded border border-destructive/10">
                    {authValidation.reason}
                  </p>
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Status Rede:</span>
                  {(activeChannel === 'whatsapp' ? whatsappStatus.connected : telegramStats.webhookStatus === 'active') ? (
                    <span className="text-success flex items-center gap-1"><Wifi className="w-3 h-3" /> Conectado</span>
                  ) : (
                    <span className="text-destructive flex items-center gap-1"><WifiOff className="w-3 h-3" /> Erro</span>
                  )}
                </div>

                {activeChannel === 'telegram' && (
                  <div className="space-y-2 pt-2 border-t border-border/50">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground uppercase">Webhook:</span>
                      <Badge variant="outline" className="h-4 px-1 text-[8px] border-success/30 text-success">ATIVO</Badge>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground uppercase">Polling:</span>
                      <span className="text-foreground">Idle</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground uppercase">Sinc:</span>
                      <span className="text-foreground">{format(new Date(telegramStats.lastSync), 'HH:mm:ss')}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground uppercase">Falhas:</span>
                      <span className={telegramStats.failureCount > 0 ? "text-destructive" : "text-success"}>
                        {telegramStats.failureCount}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <ScrollArea className="flex-1 p-3">
                <div className="space-y-3">
                  {debugLogs.length === 0 && (
                    <p className="text-[10px] text-muted-foreground text-center py-10 italic">
                      Nenhuma atividade registrada ainda.
                    </p>
                  )}
                  {debugLogs.map(log => (
                    <div key={log.id} className="text-[10px] font-mono border-b border-border/50 pb-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-muted-foreground">[{log.time}]</span>
                        <Badge 
                          variant="outline" 
                          className={`text-[8px] h-3.5 px-1 ${
                            log.type === 'error' ? 'text-destructive border-destructive/30' : 
                            log.type === 'request' ? 'text-primary border-primary/30' : 
                            'text-muted-foreground'
                          }`}
                        >
                          {log.type.toUpperCase()}
                        </Badge>
                      </div>
                      <p className={log.type === 'error' ? 'text-destructive' : 'text-foreground'}>
                        {log.message}
                      </p>
                      {log.data && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-primary/70 hover:text-primary list-none flex items-center gap-1">
                            <Database className="w-2.5 h-2.5" /> Ver Resposta Raw
                          </summary>
                          <pre className="mt-1 bg-black/20 p-2 rounded overflow-x-auto whitespace-pre-wrap max-h-40">
                            {JSON.stringify(log.data, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>

        {/*
         * Aviso de status do WhatsApp — não bloqueia a UI.
         * Antes: um overlay full-screen escondia a lista de conversas e as
         * mensagens sempre que o status ficava "offline" (ex.: durante um
         * "Reiniciar sessão" no WAHA), dando a falsa impressão de que o
         * histórico havia sumido. Agora exibimos um banner discreto no topo
         * enquanto a conexão se restabelece, mantendo o histórico visível.
         * O modal completo só aparece quando NÃO existe conexão configurada
         * (dbStatus === 'none'), caso em que a tela precisa mesmo instruir
         * o usuário a configurar uma integração.
         */}
        {isOwner && !whatsappStatus.loading && !whatsappStatus.connected && activeChannel === 'whatsapp' && whatsappStatus.dbStatus === 'offline' && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 backdrop-blur-md px-3 py-1.5 shadow-lg text-[11px] font-medium text-amber-700 dark:text-amber-300">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>Conexão {activeWhatsAppConn?.provider?.toUpperCase() || 'WhatsApp'} reconectando… histórico permanece visível.</span>
              <Link to="/whatsapp" className="underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100">
                Detalhes
              </Link>
            </div>
          </div>
        )}
        {isOwner && !whatsappStatus.loading && !whatsappStatus.connected && activeChannel === 'whatsapp' && whatsappStatus.dbStatus !== 'offline' && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] z-50 flex items-center justify-center p-6 text-center">
            <div className="glass-card p-8 max-w-md border-destructive/20 shadow-2xl animate-in fade-in zoom-in duration-300">
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-destructive" />
              </div>
              <h3 className="text-xl font-bold mb-2">WhatsApp {getWhatsAppStatusLabel(whatsappStatus.dbStatus)}</h3>
              <p className="text-muted-foreground mb-6">
                {authValidation.reason || `Sua conexão ${activeWhatsAppConn?.provider?.toUpperCase() || 'WhatsApp'} precisa estar ativa para visualizar e responder mensagens.`}
              </p>
              <div className="flex items-center gap-3 justify-center">
                <Button asChild variant="outline">
                  <Link to="/whatsapp">
                    <Settings className="w-4 h-4 mr-2" />
                    Configurar
                  </Link>
                </Button>
                <Button onClick={() => window.location.reload()}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Tentar Novamente
                </Button>
              </div>
            </div>
          </div>
        )}

        {isOwner && selectedConv && !ownerScopeOk && (
          <div className="absolute inset-0 bg-background/70 backdrop-blur-[2px] z-50 flex items-center justify-center p-6 text-center">
            <div className="glass-card p-8 max-w-lg border-destructive/20 shadow-2xl animate-in fade-in zoom-in duration-300">
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                <ShieldAlert className="w-8 h-8 text-destructive" />
              </div>
              <h3 className="text-xl font-bold mb-2">Owner ativo diferente da conversa</h3>
              <p className="text-muted-foreground mb-6">
                Consulta e envio foram bloqueados para evitar mistura de histórico entre empresas e sub-empresas.
              </p>
              <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-left">
                <div className="rounded-lg border border-border p-3"><span className="text-muted-foreground">Owner ativo</span><br /><code>{activeOwnerId || 'não resolvido'}</code></div>
                <div className="rounded-lg border border-border p-3"><span className="text-muted-foreground">Owner da conversa</span><br /><code>{selectedConvOwnerId || 'sem owner'}</code></div>
              </div>
              <Button onClick={refreshOwnerAccess} disabled={accessLoading || isRefreshing}>
                <RefreshCw className={`w-4 h-4 mr-2 ${accessLoading || isRefreshing ? 'animate-spin' : ''}`} />
                Recarregar access do owner
              </Button>
            </div>
          </div>
        )}


        {/* Lista */}
        <div className="w-80 border-r border-border flex flex-col">
          <div className="p-3 border-b border-border space-y-2">
            {activeChannel === 'whatsapp' && (
              <Button
                onClick={() => setNewConversationOpen(true)}
                className="w-full h-9 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={!activeWhatsAppConn || !activeOwnerId}
                title={!activeWhatsAppConn ? 'Selecione uma conexão WhatsApp ativa' : !activeOwnerId ? 'Recarregue o access do owner' : 'Iniciar conversa a partir de um número'}
              >
                <Plus className="w-4 h-4" />
                Nova conversa
              </Button>
            )}
            <div className="flex flex-col gap-2 bg-secondary rounded-xl p-3">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-muted-foreground" />
                <input 
                  placeholder="Buscar leads..." 
                  className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {activeChannel === 'telegram' && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button title="Filtros avançados" className="p-1 hover:bg-background/50 rounded">
                        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3 space-y-3" align="start">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Status</p>
                        <Select value={historyFilters.status} onValueChange={(v) => setHistoryFilters(prev => ({ ...prev, status: v }))}>
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="pending">Pendente</SelectItem>
                            <SelectItem value="sent">Enviado</SelectItem>
                            <SelectItem value="delivered">Entregue</SelectItem>
                            <SelectItem value="read">Lido</SelectItem>
                            <SelectItem value="error">Erro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Ordenação</p>
                        <Select value={historyFilters.sort} onValueChange={(v) => setHistoryFilters(prev => ({ ...prev, sort: v as 'asc' | 'desc' }))}>
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="desc">Mais recentes</SelectItem>
                            <SelectItem value="asc">Mais antigos</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                {activeChannel === 'whatsapp' && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button title="Filtrar conversas" className="p-1 hover:bg-background/50 rounded relative">
                        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                        {(chatListFilters.labels.length > 0 || chatListFilters.archived !== 'exclude' || chatListFilters.muted !== 'all') && (
                          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3 space-y-3" align="end">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Arquivadas</p>
                        <Select value={chatListFilters.archived} onValueChange={(v) => setChatListFilters(p => ({ ...p, archived: v as any }))}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="exclude">Ocultar arquivadas</SelectItem>
                            <SelectItem value="only">Apenas arquivadas</SelectItem>
                            <SelectItem value="all">Mostrar todas</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Silenciadas</p>
                        <Select value={chatListFilters.muted} onValueChange={(v) => setChatListFilters(p => ({ ...p, muted: v as any }))}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas</SelectItem>
                            <SelectItem value="only">Apenas silenciadas</SelectItem>
                            <SelectItem value="exclude">Ocultar silenciadas</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Etiquetas</p>
                        {availableTags.length === 0 && <p className="text-[10px] text-muted-foreground italic">Nenhuma etiqueta cadastrada.</p>}
                        <div className="max-h-40 overflow-auto space-y-0.5">
                          {availableTags.map(t => {
                            const on = chatListFilters.labels.includes(t.id);
                            return (
                              <button key={t.id} type="button"
                                onClick={() => setChatListFilters(p => ({ ...p, labels: on ? p.labels.filter(x => x !== t.id) : [...p.labels, t.id] }))}
                                className="w-full flex items-center gap-2 px-1.5 py-1 rounded hover:bg-secondary text-[11px]"
                              >
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.color || 'hsl(var(--muted-foreground))' }} />
                                <span className="flex-1 truncate text-left">{t.name}</span>
                                {on && <Check className="w-3 h-3 text-primary" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {(chatListFilters.labels.length > 0 || chatListFilters.archived !== 'exclude' || chatListFilters.muted !== 'all') && (
                        <button onClick={() => setChatListFilters({ labels: [], archived: 'exclude', muted: 'all' })} className="w-full h-7 text-[11px] rounded border border-border hover:bg-secondary">Limpar filtros</button>
                      )}
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {list.filter(c => {
              const q = searchTerm.toLowerCase();
              if (q && !(c.name.toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q) || (c.msg || '').toLowerCase().includes(q))) return false;
              const arch = (c as any).is_archived;
              if (chatListFilters.archived === 'exclude' && arch) return false;
              if (chatListFilters.archived === 'only' && !arch) return false;
              const muted = (c as any).is_muted;
              if (chatListFilters.muted === 'exclude' && muted) return false;
              if (chatListFilters.muted === 'only' && !muted) return false;
              if (chatListFilters.labels.length > 0) {
                const ids: string[] = (c as any).label_ids || [];
                if (!chatListFilters.labels.every(id => ids.includes(id))) return false;
              }
              return true;
            }).map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedConvId(c.id)}
                className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left ${
                  selectedConv?.id === c.id ? 'bg-secondary' : ''
                }`}
              >
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full bg-primary/20 overflow-hidden flex items-center justify-center">
                    {(c as any).avatar_url ? (
                      <img
                        src={(c as any).avatar_url}
                        alt={c.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.currentTarget.style.display = 'none'); }}
                      />
                    ) : (
                      <span className="text-xs font-bold text-primary">{c.name.split(/[\s.@]/).filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join('')}</span>
                    )}
                  </div>
                  {c.online && <Circle className="w-3 h-3 text-success fill-success absolute -bottom-0.5 -right-0.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-sm font-medium text-foreground truncate flex items-center gap-1">
                      {c.name}
                      {(c as any).is_muted && <BellOff className="w-3 h-3 text-amber-500 shrink-0" />}
                      {(c as any).is_archived && <Archive className="w-3 h-3 text-muted-foreground shrink-0" />}
                    </p>
                    <span className="text-[10px] text-muted-foreground shrink-0">{c.time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{c.msg}</p>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {(c as any).presenceLabel && (() => {
                      const p = String((c as any).presence || '').toLowerCase();
                      const isTyping = p === 'composing';
                      const isRecording = p === 'recording';
                      const cls = isTyping
                        ? 'text-primary border-primary/40 animate-pulse'
                        : isRecording
                          ? 'text-emerald-600 border-emerald-500/40 animate-pulse'
                          : c.online ? 'text-success border-success/40' : 'text-muted-foreground';
                      return (
                        <Badge variant="outline" className={`text-[9px] py-0 px-1.5 h-4 ${cls}`}>
                          {(c as any).presenceLabel}
                        </Badge>
                      );
                    })()}
                    {(c as any).label_ids && (c as any).label_ids.length > 0 && availableTags.length > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        {(c as any).label_ids.slice(0, 3).map((lid: string) => {
                          const t = availableTags.find(x => x.id === lid); if (!t) return null;
                          return <span key={lid} className="w-1.5 h-1.5 rounded-full" style={{ background: t.color || 'hsl(var(--muted-foreground))' }} title={t.name} />;
                        })}
                      </span>
                    )}
                    {c.botEnabled ? (
                      <Badge variant="secondary" className="text-[9px] py-0 px-1.5 h-4 gap-0.5">
                        <Bot className="w-2.5 h-2.5" />
                        IA
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 gap-0.5">
                        <UserCog className="w-2.5 h-2.5" />
                        {humanAgents.find((h) => h.id === c.assignedTo)?.name.split(' ')[0] || 'Humano'}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat */}
        <div className="flex-1 flex flex-col">
          {selectedConv && (
            <>
              <div className="border-b border-border px-4 py-3 flex items-center justify-between flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setRightPanelOpen(true)}
                  className="flex items-center gap-3 -mx-2 px-2 py-1 rounded-lg hover:bg-secondary/60 transition text-left"
                  title="Ver perfil completo do contato"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/20 ring-1 ring-border overflow-hidden flex items-center justify-center shrink-0">
                    {(selectedConv as any).avatar_url ? (
                      <img
                        src={(selectedConv as any).avatar_url}
                        alt={selectedConv.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.currentTarget.style.display = 'none'); }}
                      />
                    ) : (
                      <span className="text-xs font-bold text-primary">{selectedConv.name.split(/[\s.@]/).filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join('')}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{selectedConv.name}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                      <Circle className={`w-1.5 h-1.5 ${selectedConv.online ? 'fill-success text-success animate-pulse' : 'fill-muted-foreground text-muted-foreground'}`} />
                      {(selectedConv as any).presenceLabel || (selectedConv.online ? 'Online agora' : 'Offline')}
                      {selectedConv.phone && <span className="opacity-70">· {selectedConv.phone}</span>}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/60">
                    <Bot className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-medium">Agente Bot</span>
                    <Switch checked={selectedConv.botEnabled} onCheckedChange={() => toggleBot(selectedConv.id)} />
                  </div>

                  <Select
                    value={selectedConv.botEnabled ? selectedConv.assignedTo : ''}
                    onValueChange={(v) => setBotAgent(selectedConv.id, v)}
                    disabled={!selectedConv.botEnabled}
                  >
                    <SelectTrigger className="h-8 text-xs w-[180px]">
                      <SelectValue placeholder="Selecionar IA" />
                    </SelectTrigger>
                    <SelectContent>
                      {aiAgents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <TooltipProvider delayDuration={150}>
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-60"
                            aria-label="Ligar por VoIP SIP"
                            onClick={() => {
                              if (voip.status !== 'connected') {
                                toast({
                                  title: 'VoIP desconectado',
                                  description: 'Configure o SIP/VoIP em Configurações antes de ligar.',
                                  variant: 'destructive',
                                });
                                return;
                              }
                              const target = selectedConv.phone || selectedConv.name;
                              toast({ title: 'VoIP/SIP', description: `Discando ${target} via trunk SIP` });
                              voip.makeCall(target);
                            }}
                          >
                            <Headphones className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>VoIP (SIP) · {voip.status === 'connected' ? 'pronto' : 'desconectado'}</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className={`inline-flex h-9 items-center justify-center gap-1 rounded-lg px-3 text-xs font-semibold shadow-sm hover:opacity-90 ${wavoipLineBusy.busy ? 'bg-destructive text-destructive-foreground' : 'bg-success text-success-foreground'}`}
                            aria-label="Ligar por Wavoip"
                            onClick={() => {
                              if (wavoipLineBusy.busy) {
                                toast({ title: 'Linha Wavoip ocupada', description: wavoipLineBusy.tooltip, variant: 'destructive' });
                                return;
                              }
                              if (!ensureActiveOwnerScope()) return;
                              if (!selectedConv.phone) {
                                toast({ title: 'Sem número', description: 'Este contato não possui telefone.', variant: 'destructive' });
                                return;
                              }
                              if (!wavoip.config.enabled || wavoip.config.devices.length === 0) {
                                toast({
                                  title: 'Wavoip não configurado',
                                  description: 'Cadastre um Device Token em Configurações > Wavoip para usar o tronco WhatsApp.',
                                  variant: 'destructive',
                                });
                                return;
                              }
                              wavoip.callWhatsApp(selectedConv.phone, undefined, {
                                customerId: selectedConv.id,
                                contactName: selectedConv.name,
                                ownerId: activeOwnerId,
                                subCompanyId: (selectedConv as any)?.sub_company_id ?? activeWhatsAppConn?.sub_company_id ?? null,
                              });
                            }}
                          >
                            <PhoneCall className="h-4 w-4" />
                            Ligar
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {wavoipLineBusy.busy
                            ? wavoipLineBusy.tooltip
                            : wavoip.config.enabled && wavoip.config.devices.length > 0
                              ? `Wavoip pronto · ${wavoip.config.devices.length} device(s)`
                              : 'Tronco Wavoip não configurado'}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TooltipProvider>
                  <Link to="/video-calls" className="p-2 rounded-lg hover:bg-secondary inline-flex" title="Vídeo chamada"><Video className="w-4 h-4 text-muted-foreground" /></Link>
                  <button
                    onClick={() => setSignatureModalOpen(true)}
                    className="p-2 rounded-lg hover:bg-secondary text-muted-foreground"
                    title="Enviar documento para assinatura"
                  >
                    <PenLine className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setInChatSearchOpen((v) => !v)}
                    className={`p-2 rounded-lg hover:bg-secondary ${inChatSearchOpen ? 'bg-secondary text-primary' : 'text-muted-foreground'}`}
                    title="Buscar nesta conversa (Ctrl+F)"
                  >
                    <SearchCode className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      const url = selectedConvId ? `/chat/focus?c=${selectedConvId}` : '/chat/focus';
                      window.open(url, '_blank', 'noopener,noreferrer');
                    }}
                    className="p-2 rounded-lg hover:bg-secondary text-muted-foreground"
                    title="Abrir Modo Foco em nova aba"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setRightPanelOpen((v) => !v)}
                    className={`p-2 rounded-lg hover:bg-secondary ${rightPanelOpen ? 'bg-secondary text-primary' : 'text-muted-foreground'}`}
                    title="Notas internas, CRM e mídia"
                  >
                    <StickyNote className="w-4 h-4" />
                  </button>

                  {activeChannel === 'telegram' && (
                    <div className="flex items-center border-l border-border ml-2 pl-2 gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => handleExportHistory('csv')} title="Exportar CSV">
                        <FileDown className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => handleExportHistory('pdf')} title="Exportar PDF">
                        <HistoryIcon className="w-4 h-4" />
                      </Button>
                    </div>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-2 rounded-lg hover:bg-secondary" title="Mais opções"><MoreVertical className="w-4 h-4 text-muted-foreground" /></button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Conversa</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setRightPanelOpen(true)} className="gap-2 text-xs">
                        <UserCog className="w-3.5 h-3.5" /> Ver perfil do contato
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setGlobalSearchOpen(true)} className="gap-2 text-xs">
                        <Search className="w-3.5 h-3.5" /> Buscar nas mensagens (Ctrl+K)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={async () => {
                          if (!selectedConvId || !ensureActiveOwnerScope()) return;
                          const { data } = await supabase
                            .from('chat_messages')
                            .select('*')
                            .eq('customer_id', selectedConvId)
                            .order('created_at', { ascending: true });
                          if (data) setMessages((data || []).map(hydrateChatMessage));
                          toast({ title: 'Histórico atualizado', description: `${data?.length || 0} mensagens carregadas.` });
                        }}
                        className="gap-2 text-xs"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Recarregar mensagens
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShortcutsOpen(true)} className="gap-2 text-xs">
                        <Keyboard className="w-3.5 h-3.5" /> Atalhos de teclado
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>


              <CollaborationBar
                customerId={selectedConv.id}
                onOpenTransfer={() => setCollabTransferOpen(true)}
                isSupervisor={isSupervisor}
                currentUserId={currentUserId}
              />
              <WhisperFeed customerId={selectedConv.id} currentUserId={currentUserId} />
              {isSupervisor && selectedConv.assignedTo && selectedConv.assignedTo !== currentUserId && (
                <WhisperComposer
                  customerId={selectedConv.id}
                  ownerId={null}
                  toAgentId={selectedConv.assignedTo}
                >
                  <div>
                    <SupervisorBanner agentName={String(selectedConv.assignedTo)} onWhisper={() => {}} />
                  </div>
                </WhisperComposer>
              )}



              {/* Etapa 8 — mensagens fixadas e busca dentro da conversa */}
              <PinnedMessagesBar
                items={pinnedItems}
                onJump={(id) => {
                  const el = document.querySelector(`[data-msg-id="${id}"]`) as HTMLElement | null;
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('ring-2', 'ring-primary/60');
                    setTimeout(() => el.classList.remove('ring-2', 'ring-primary/60'), 1200);
                  } else {
                    toast({ title: 'Mensagem fora do trecho', description: 'Role o histórico para carregar a mensagem original.' });
                  }
                }}
                onUnpin={async (pinId) => {
                  await supabase.from('chat_pinned_messages').delete().eq('id', pinId);
                }}
              />
              <InChatSearchBar
                open={inChatSearchOpen}
                query={inChatSearchQuery}
                onQueryChange={setInChatSearchQuery}
                currentIndex={inChatSearchIndex}
                total={inChatMatches.length}
                onPrev={() => setInChatSearchIndex((i) => (inChatMatches.length ? (i - 1 + inChatMatches.length) % inChatMatches.length : 0))}
                onNext={() => setInChatSearchIndex((i) => (inChatMatches.length ? (i + 1) % inChatMatches.length : 0))}
                onClose={() => { setInChatSearchOpen(false); setInChatSearchQuery(''); }}
              />

              <div className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col">
                {activeChannel === 'telegram' && hasMoreHistory && (
                  <div className="flex justify-center py-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={handleLoadMoreMessages} 
                      disabled={isHistoryLoading}
                      className="text-[10px] uppercase tracking-wider text-muted-foreground gap-2"
                    >
                      {isHistoryLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <HistoryIcon className="w-3 h-3" />
                      )}
                      {isHistoryLoading ? 'Carregando...' : 'Carregar Mensagens Antigas'}
                    </Button>
                  </div>
                )}
                
                {messages.map((m) => {
                  const errorInfo = getMessageErrorInfo(m);
                  return (
                    <motion.div
                      key={m.id}
                      data-msg-id={m.uaz_msg_id || m.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${m.sender_type !== 'client' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm relative group ${
                        m.sender_type !== 'client' ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-secondary text-foreground rounded-bl-md'
                      } ${pinnedIds.has(m.id) ? 'ring-1 ring-primary/50' : ''} ${
                        inChatSearchQuery && inChatMatches[inChatSearchIndex] === (m.uaz_msg_id || m.id) ? 'ring-2 ring-yellow-400/80' : ''
                      }`}>
                        {pinnedIds.has(m.id) && (
                          <div className={`absolute -top-2 ${m.sender_type !== 'client' ? '-left-2' : '-right-2'} bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center shadow`} title="Fixada nesta conversa">
                            <Pin className="w-2.5 h-2.5" />
                          </div>
                        )}
                        {/* Quoted/reply preview — Etapa 3 */}
                        {m._quoted && (
                          <button
                            type="button"
                            onClick={() => {
                              const el = document.querySelector(`[data-msg-id="${m._quoted.message_id}"]`) as HTMLElement | null;
                              if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('ring-2','ring-primary/60'); setTimeout(() => el.classList.remove('ring-2','ring-primary/60'), 1200); }
                            }}
                            className={`block w-full text-left mb-1.5 px-2 py-1 rounded border-l-2 text-xs opacity-90 hover:opacity-100 ${
                              m.sender_type !== 'client' ? 'bg-primary-foreground/10 border-primary-foreground/60' : 'bg-background/60 border-primary'
                            }`}
                            title="Ir para a mensagem citada"
                          >
                            <div className="font-medium text-[10px] uppercase tracking-wider opacity-70">
                              {m._quoted.from_me ? 'Você' : 'Contato'}
                            </div>
                            <div className="truncate">{m._quoted.body || '[mídia]'}</div>
                          </button>
                        )}
                        {m._mediaUrl && m._mediaType && (
                          <MediaMessageContent
                            url={m._mediaUrl}
                            type={m._mediaType}
                            mime={m._mediaMime}
                            filename={m._mediaFilename}
                            duration={m._mediaDuration}
                            mine={m.sender_type !== 'client'}
                            onOpen={m._mediaType === 'image' ? (u) => setLightboxUrl(u) : undefined}
                          />
                        )}
                        {m._revoked ? (
                          <p className="italic opacity-70 text-xs flex items-center gap-1">
                            <Trash2 className="w-3 h-3" /> Mensagem apagada
                          </p>
                        ) : (m.content && m.content !== '[mídia]') && (
                          <p className="whitespace-pre-wrap break-words">
                            {renderWhatsAppText(m.content)}
                            {m._edited && <span className="ml-1 text-[10px] opacity-60 italic">(editada)</span>}
                          </p>
                        )}

                        {/* Reactions strip — WhatsApp style */}
                        {m._reactions && Object.keys(m._reactions).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {Object.entries(m._reactions as Record<string, any>).map(([who, r]: any) => (
                              <button
                                key={who}
                                type="button"
                                onClick={() => who === 'me' && handleToggleReaction(m, r.emoji)}
                                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border ${
                                  m.sender_type !== 'client'
                                    ? 'bg-primary-foreground/15 border-primary-foreground/25'
                                    : 'bg-background border-border'
                                } ${who === 'me' ? 'ring-1 ring-primary/40' : ''}`}
                                title={who === 'me' ? 'Sua reação — clique para remover' : `Reação de ${r.jid || 'contato'}`}
                              >
                                <span className="text-sm leading-none">{r.emoji}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Reaction picker — appears on hover (WhatsApp only) */}
                        {activeChannel === 'whatsapp' && m.uaz_msg_id && (
                          <div className={`absolute -top-3 ${m.sender_type !== 'client' ? '-left-2' : '-right-2'} opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1`}>
                            <button
                              type="button"
                              onClick={() => { setReplyingTo(m); const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-composer="1"]'); ta?.focus(); }}
                              className="w-7 h-7 rounded-full bg-background border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary"
                              title="Responder à mensagem"
                            >
                              <Reply className="w-3.5 h-3.5" />
                            </button>
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="w-7 h-7 rounded-full bg-background border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary"
                                  title="Reagir à mensagem"
                                >
                                  <SmilePlus className="w-3.5 h-3.5" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent align="center" side="top" className="w-auto p-1.5">
                                <div className="flex gap-1">
                                  {['👍','❤️','😂','😮','😢','🙏'].map((emoji) => {
                                    const isActive = m._reactions?.me?.emoji === emoji;
                                    return (
                                      <button
                                        key={emoji}
                                        type="button"
                                        onClick={() => handleToggleReaction(m, emoji)}
                                        className={`w-8 h-8 rounded-full text-lg hover:bg-secondary transition ${isActive ? 'bg-primary/15 ring-1 ring-primary/40' : ''}`}
                                        title={isActive ? 'Remover reação' : `Reagir com ${emoji}`}
                                      >
                                        {emoji}
                                      </button>
                                    );
                                  })}
                                </div>
                              </PopoverContent>
                            </Popover>
                            {/* Etapa 4 — encaminhar */}
                            {!m._revoked && (
                              <button
                                type="button"
                                onClick={() => setForwardTarget(m)}
                                className="w-7 h-7 rounded-full bg-background border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary"
                                title="Encaminhar mensagem"
                              >
                                <ForwardIcon className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {/* Etapa 8 — fixar/desafixar (visível para toda a equipe) */}
                            <button
                              type="button"
                              onClick={() => handleTogglePin(m)}
                              className={`w-7 h-7 rounded-full bg-background border border-border shadow-sm flex items-center justify-center hover:bg-secondary ${pinnedIds.has(m.id) ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                              title={pinnedIds.has(m.id) ? 'Desafixar mensagem' : 'Fixar na conversa'}
                            >
                              {pinnedIds.has(m.id) ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                            </button>
                            {/* Etapa 8 — favoritar (visível só para você) */}
                            <button
                              type="button"
                              onClick={() => handleToggleStar(m)}
                              className={`w-7 h-7 rounded-full bg-background border border-border shadow-sm flex items-center justify-center hover:bg-secondary ${starredIds.has(m.id) ? 'text-yellow-500' : 'text-muted-foreground hover:text-foreground'}`}
                              title={starredIds.has(m.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                            >
                              {starredIds.has(m.id) ? <Star className="w-3.5 h-3.5 fill-current" /> : <Star className="w-3.5 h-3.5" />}
                            </button>
                            {/* Etapa 4 — editar (apenas próprias, dentro de 15 min, sem mídia) */}
                            {m.sender_type !== 'client' && !m._revoked && !m._mediaUrl && (Date.now() - new Date(m.created_at).getTime() < 15 * 60 * 1000) && (
                              <button
                                type="button"
                                onClick={() => { setEditTarget(m); setEditText(m.content || ''); }}
                                className="w-7 h-7 rounded-full bg-background border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary"
                                title="Editar mensagem (até 15 min)"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {/* Etapa 4 — apagar (apenas próprias) */}
                            {m.sender_type !== 'client' && !m._revoked && (
                              <button
                                type="button"
                                onClick={() => handleDeleteMessage(m, true)}
                                className="w-7 h-7 rounded-full bg-background border border-border shadow-sm flex items-center justify-center text-destructive hover:bg-destructive/10"
                                title="Apagar para todos"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-1 mt-1 opacity-70">
                          <p className="text-[10px]">
                            {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          {m.sender_type !== 'client' && (
                            <div className="ml-1">
                              {m.status === 'sending' ? (
                                // Sem sinal de "enviando" para atendentes — apenas o dono vê carregamento.
                                isOwner ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Check className="w-2.5 h-2.5 opacity-60" />
                              ) : m.status === 'error' ? (
                                isOwner ? <AlertCircle className="w-2.5 h-2.5 text-destructive-foreground" /> : <Check className="w-2.5 h-2.5 opacity-60" />
                              ) : m.status === 'sent' ? (
                                <Check className="w-2.5 h-2.5" />
                              ) : m.status === 'delivered' ? (
                                <div className="flex -space-x-1.5"><Check className="w-2.5 h-2.5" /><Check className="w-2.5 h-2.5" /></div>
                              ) : m.status === 'read' ? (
                                <div className="flex items-center gap-1 text-sky-300">
                                  <div className="flex -space-x-1.5"><Check className="w-2.5 h-2.5" /><Check className="w-2.5 h-2.5" /></div>
                                  {m._confirmedAt && (
                                    <span className="text-[9px] ml-1 opacity-90">
                                      Visto {new Date(m._confirmedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <CheckCircle2 className="w-2.5 h-2.5" />
                              )}
                            </div>
                          )}
                        </div>

                        {isOwner && m.sender_type !== 'client' && m.status === 'sending' && (
                          <div className="mt-2 rounded-lg border border-primary-foreground/20 bg-primary-foreground/10 px-2 py-1 text-[10px] flex items-center gap-1.5">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Enviando pelo provedor…
                          </div>
                        )}

                        {isOwner && m.sender_type !== 'client' && m._latency && m.status !== 'error' && (
                          <div className="mt-1 text-[9px] opacity-70 text-right">
                            Evolution aceitou em {m._latency}ms{m._confirmedAt ? ` · confirmado ${new Date(m._confirmedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                          </div>
                        )}

                        {isOwner && m.sender_type !== 'client' && errorInfo && (
                          <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/15 px-2 py-1.5 text-[10px] text-primary-foreground space-y-1">
                            <div className="flex items-start gap-1.5">
                              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <p className="font-semibold">Bloqueio: {errorInfo.blockedBy || 'falha no envio'}</p>
                                <p className="opacity-90 break-words">{errorInfo.detail}</p>
                              </div>
                            </div>
                            {errorInfo.retryable && (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-6 text-[10px] px-2 mt-1"
                                onClick={() => retryFailedMessage(m)}
                              >
                                <RefreshCw className="w-3 h-3 mr-1" /> Retentar com correção
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
                <div ref={messagesEndRef} aria-hidden />
              </div>

              {/* Etapa 3 — barra de resposta acima do composer */}
              {replyingTo && (
                <div className="mx-3 mt-2 px-3 py-2 rounded-lg border-l-4 border-primary bg-secondary/60 flex items-start gap-2">
                  <Reply className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                      Respondendo a {replyingTo.sender_type === 'client' ? (selectedConv?.name || 'contato') : 'você'}
                    </div>
                    <div className="text-xs truncate">{(replyingTo.content || '[mídia]').slice(0, 200)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0"
                    title="Cancelar resposta"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <ChatComposer
                conversationId={selectedConvId!}
                text={messageText}
                onChangeText={setMessageText}
                onSendText={handleSendText}
                onSendMedia={handleSendMedia}
                onSendAudio={handleSendAudio}
                recentMessages={messages.map((m: any) => ({ sender_type: m.sender_type, content: m.content }))}
                contactName={selectedConv?.name}
                disabled={!ownerScopeOk || accessLoading || !activeOwnerId}
                externalAttachment={externalAttachment}
                onConsumeExternalAttachment={() => setExternalAttachment(null)}
                onScheduleClick={() => setScheduleOpen(true)}
                signature={signatureText}
                signatureEnabled={signatureEnabled}
                onToggleSignature={handleToggleSignature}
                extras={
                  <RichSendMenu
                    customerId={selectedConvId!}
                    ownerId={(selectedConv as any)?.owner_id || null}
                    onSend={handleSendRich}
                  />
                }
              />
              {selectedConvId && (selectedConv as any)?.owner_id && (
                <ScheduleMessageDialog
                  open={scheduleOpen}
                  onOpenChange={setScheduleOpen}
                  customerId={selectedConvId}
                  ownerId={(selectedConv as any).owner_id}
                  defaultText={messageText}
                />
              )}
            </>
          )}
        </div>

        {rightPanelOpen && selectedConv && (
          <ChatRightPanel
            customerId={selectedConv.id}
            customerName={selectedConv.name}
            onClose={() => setRightPanelOpen(false)}
            onUseReply={(text) => setMessageText((prev) => (prev ? `${prev} ${text}` : text))}
          />
        )}
      </div>

      {selectedConv && (
        <TransferConversationDialog
          open={collabTransferOpen}
          onOpenChange={setCollabTransferOpen}
          customerId={selectedConv.id}
          ownerId={(selectedConv as any)?.owner_id || null}
          onTransferred={() => {}}
        />
      )}



      <SignatureDocumentModal
        open={signatureModalOpen}
        onOpenChange={setSignatureModalOpen}
        leadId={(selectedConv as any)?.lead_id || null}
        subCompanyId={(selectedConv as any)?.sub_company_id || null}
        ownerId={(selectedConv as any)?.owner_id || null}
        signerNameDefault={selectedConv?.name}
        signerPhoneDefault={(selectedConv as any)?.phone || (selectedConv as any)?.whatsapp}
      />


      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir conversa</DialogTitle>
            <DialogDescription>Escolha um atendente humano disponível para assumir essa conversa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {humanAgents.map((h) => (
              <button
                key={h.id}
                onClick={() => setTransferTarget(h.id)}
                disabled={h.status === 'offline'}
                className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left ${
                  transferTarget === h.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary/50'
                } ${h.status === 'offline' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center">
                    <UserCog className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{h.name}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">{h.status}</p>
                  </div>
                </div>
                <div className={`w-2 h-2 rounded-full ${
                  h.status === 'online' ? 'bg-success' : h.status === 'busy' ? 'bg-amber-500' : 'bg-muted-foreground'
                }`} />
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancelar</Button>
            <Button onClick={handleTransfer} disabled={!transferTarget}>Transferir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Etapa 4 — Encaminhar mensagem */}
      <Dialog open={!!forwardTarget} onOpenChange={(o) => !o && setForwardTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encaminhar mensagem</DialogTitle>
            <DialogDescription>Selecione um contato do WhatsApp para receber a mensagem.</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border bg-secondary/40 p-2 text-xs max-h-24 overflow-hidden">
            <span className="opacity-70">Prévia: </span>
            <span className="line-clamp-3">{forwardTarget?.content || '[mídia]'}</span>
          </div>
          <ScrollArea className="h-64 mt-2 border border-border rounded-md">
            <div className="divide-y divide-border">
              {(convs.whatsapp || []).filter((c: any) => c.id !== selectedConvId).map((c: any) => (
                <button
                  key={c.id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-secondary/60 flex items-center gap-2"
                  onClick={() => handleForwardTo(forwardTarget, c.id)}
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                    {(c.name || '?').split(/[\s.@]/).filter(Boolean).slice(0,2).map((n: string) => n[0]?.toUpperCase()).join('')}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm truncate">{c.name}</div>
                    {c.phone && <div className="text-[10px] text-muted-foreground truncate">{c.phone}</div>}
                  </div>
                </button>
              ))}
              {(convs.whatsapp || []).length <= 1 && (
                <div className="p-4 text-center text-xs text-muted-foreground">Nenhum outro contato disponível.</div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForwardTarget(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Etapa 4 — Editar mensagem */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar mensagem</DialogTitle>
            <DialogDescription>O WhatsApp permite editar mensagens em até 15 minutos após o envio.</DialogDescription>
          </DialogHeader>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={4}
            maxLength={4096}
            className="w-full rounded-md border border-border bg-background p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={handleConfirmEdit} disabled={!editText.trim() || editText.trim() === (editTarget?.content || '')}>Salvar edição</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      <MediaDropzone
        active={!!selectedConvId}
        maxFiles={30}
        onSendFile={async (file, kind) => {
          await handleSendMedia({ file, previewUrl: null, kind }, '');
        }}
      />


      {lightboxUrl && (() => {
        const imgs: MediaItem[] = messages
          .filter((mm: any) => mm._mediaType === 'image' && mm._mediaUrl)
          .map((mm: any) => ({ url: mm._mediaUrl, mime: mm._mediaMime, name: mm._mediaFilename, caption: mm.content && mm.content !== '[mídia]' ? mm.content : undefined }));
        const idx = Math.max(0, imgs.findIndex(i => i.url === lightboxUrl));
        return (
          <MediaViewerDialog
            items={imgs.length ? imgs : [{ url: lightboxUrl }]}
            index={idx}
            onClose={() => setLightboxUrl(null)}
          />
        );
      })()}
      <KeyboardShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <GlobalSearchDialog open={globalSearchOpen} onOpenChange={setGlobalSearchOpen} />
      <NewConversationDialog
        open={newConversationOpen}
        onOpenChange={setNewConversationOpen}
        connection={activeWhatsAppConn}
        onCreated={(customerId) => {
          setSelectedConvId(customerId);
          setActiveChannel('whatsapp');
        }}
      />
    </AppLayout>
  );
}
