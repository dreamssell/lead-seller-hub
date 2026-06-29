import { AppLayout } from '@/components/layout/AppLayout';
import { GlobalSearchDialog } from '@/components/chat/GlobalSearchDialog';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Paperclip, Phone, Video, MoreVertical, Search, Circle,
  Camera, ThumbsUp, Briefcase, MessageCircle, Globe, Bot, UserCog, ArrowLeft, RefreshCw, CheckCircle2, AlertCircle, Settings,
  Database, Activity, ShieldAlert, Wifi, WifiOff, Terminal, ChevronDown, ChevronUp, History as HistoryIcon, Bug, Play, Share2,
  FileDown, Filter, Calendar, Clock, Loader2, X, AlertTriangle, Check
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";




import { useState, useMemo, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { getProviderAdapter } from '@/components/whatsapp/adapters';
import { WhatsAppConnection } from '@/components/whatsapp/types';
import { useVoip } from '@/contexts/VoipContext';
import { useWavoipWebphone } from '@/contexts/WavoipWebphoneContext';
import { ChatRightPanel } from '@/components/chat/ChatRightPanel';
import { SignatureDocumentModal } from '@/components/signature/SignatureDocumentModal';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { StickyNote, Zap, PhoneCall, Headphones, PenLine, Keyboard } from 'lucide-react';
import { ChatComposer, ComposerAttachment } from '@/components/chat/ChatComposer';
import { RichSendMenu, RichPayload } from '@/components/chat/RichSendMenu';
import { MediaDropzone } from '@/components/chat/MediaDropzone';
import { KeyboardShortcutsHelp } from '@/components/chat/KeyboardShortcutsHelp';
import { useChatShortcuts } from '@/hooks/useChatShortcuts';
import { renderWhatsAppText } from '@/lib/whatsappFormat';
import { CollaborationBar } from '@/components/chat/CollaborationBar';
import { WhisperFeed } from '@/components/chat/WhisperFeed';
import { SupervisorBanner } from '@/components/chat/SupervisorBanner';
import { WhisperComposer } from '@/components/chat/WhisperComposer';
import { TransferConversationDialog } from '@/components/chat/TransferConversationDialog';
import { useIsSupervisor } from '@/hooks/useIsSupervisor';



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





const conversationsByChannel: Record<ChannelKey, Array<{ id: string; name: string; msg: string; time: string; online: boolean; botEnabled: boolean; assignedTo: string; phone?: string; avatar_url?: string | null; email?: string | null }>> = {
  whatsapp: [],
  instagram: [],
  facebook: [],
  telegram: [],
  linkedin: [],
  youtube: [],
  tiktok: [],
  widget: [],
};


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
  if (!conn?.metadata) return undefined;
  return conn.metadata.phone || conn.metadata.phone_number || conn.metadata.number || conn.metadata.owner;
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

export default function ChatPage() {
  const [activeChannel, setActiveChannel] = useState<ChannelKey | null>(null);
  const [convs, setConvs] = useState(conversationsByChannel);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [collabTransferOpen, setCollabTransferOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const { isSupervisor, userId: currentUserId } = useIsSupervisor();

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
  const [authValidation, setAuthValidation] = useState<{ valid: boolean; reason?: string; loading: boolean }>({ valid: false, loading: true });
  const [activeWhatsAppConn, setActiveWhatsAppConn] = useState<WhatsAppConnection | null>(null);
  const [connectedProviders, setConnectedProviders] = useState<string[]>([]);
  const [whatsappStatus, setWhatsappStatus] = useState<{ connected: boolean; loading: boolean; dbStatus: WhatsAppDbStatus; phone?: string; error?: string }>({
    connected: false,
    loading: true,
    dbStatus: 'disconnected',
  });

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
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const voip = useVoip();
  const wavoip = useWavoipWebphone();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [externalAttachment, setExternalAttachment] = useState<File | null>(null);

  useChatShortcuts(!!selectedConvId, {
    onHelp: () => setShortcutsOpen(true),
    onSend: () => { /* ChatComposer handles its own Ctrl+Enter via key event */ },
  });



  const addDebugLog = (type: 'info' | 'error' | 'request', message: string, data?: any) => {
    // Evita re-render contínuo: só coleta quando o painel de Diagnóstico está aberto,
    // e quando aberto mantém apenas os 50 eventos mais recentes em memória (sem persistência).
    if (!showDebugPanel && type !== 'error') return;
    setDebugLogs(prev => [{
      id: crypto.randomUUID(),
      time: new Date().toLocaleTimeString(),
      type,
      message,
      data
    }, ...prev].slice(0, 50));
  };

  useEffect(() => {
    async function checkProviderStatus(channel: ChannelKey, isManual = false) {
      if (isManual) setIsRefreshing(true);
      
      const providerName = channel === 'whatsapp' ? 'WhatsApp via status persistido' : channel.toUpperCase();
      addDebugLog('request', `Lendo status: ${providerName}`);
      
      try {
        if (channel === 'whatsapp') {
          const { data: connections, error: connError } = await supabase
            .from('whatsapp_connections')
            .select('*')
            .in('provider', ['uaz', 'meta', 'wavoip', 'evolution'])
            .order('updated_at', { ascending: false });

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

          if (isConnected) {
            addDebugLog('info', `Status: ATIVO (${summary.labels.join(' + ')}). Iniciando carga de contatos.`);
            loadConversations(channel);
          }
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
      
      const { data: customers, error } = await supabase
        .from('customers')
        .select('*')
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
        
        const { data: lastMessages } = await supabase
          .from('chat_messages')
          .select('customer_id, content, created_at')
          .order('created_at', { ascending: false });

        const formatted = channelCustomers.map(c => {
          const lastMsg = lastMessages?.find(m => m.customer_id === c.id);
          return {
            id: c.id,
            name: c.name || c.phone || 'Cliente sem nome',
            msg: lastMsg?.content || 'Sem mensagens ainda',
            time: lastMsg
              ? new Date(lastMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : new Date(c.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            online: false,
            botEnabled: false,
            assignedTo: '',
            phone: c.phone,
            avatar_url: (c as any).avatar_url || null,
            email: c.email || null,
          };
        });

        
        setConvs(prev => ({ ...prev, [channel]: formatted }));
        addDebugLog('info', `Conversas ${channel} formatadas e carregadas na UI`);
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        addDebugLog('info', 'Nova mensagem recebida via Realtime', payload.new);
        if (payload.new.customer_id === selectedConvId) {
          setMessages(prev => [...prev, payload.new]);
        }
        if (activeChannel) loadConversations(activeChannel);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_connections' }, () => {
        addDebugLog('info', 'Conexão WhatsApp atualizada no banco; relendo status persistido.');
        checkProviderStatus('whatsapp');
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
  }, [selectedConvId, whatsappStatus.connected, activeChannel]);

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
    if (selectedConvId) {
      async function loadMessages() {
        const { data } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('customer_id', selectedConvId)
          .order('created_at', { ascending: true });
        if (data) setMessages(data);
      }
      loadMessages();
    }
  }, [selectedConvId]);

  const list = activeChannel ? convs[activeChannel] : [];
  const selectedConv = list.find((c) => c.id === selectedConvId) || (selectedConvId ? null : list[0]);

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
      customer_id: selectedConvId,
      sender_type: 'agent',
      content: messageText,
      created_at: new Date().toISOString(),
      status: 'sending'
    };
    
    setMessages(prev => [...prev, newMessage]);
    const currentText = messageText;
    setMessageText('');

    // 2. Chamar Adapter para envio
    try {
      if (activeChannel === 'whatsapp') {
        if (!activeWhatsAppConn) throw new Error('Conexão ativa não encontrada');
        const adapter = getProviderAdapter(activeWhatsAppConn.provider);
        const data = await adapter.sendMessage(activeWhatsAppConn, selectedConvId, currentText);
        setMessages(prev => prev.map(m => 
          m.id === clientMsgId ? { ...m, status: 'sent', id: data?.data?.key?.id || m.id } : m
        ));
      } else if (activeChannel === 'telegram') {
        // Mock Telegram Send with delivery status simulation
        addDebugLog('request', 'Enviando mensagem via Telegram API...');
        await new Promise(r => setTimeout(r, 500));
        
        setMessages(prev => prev.map(m => 
          m.id === clientMsgId ? { ...m, status: 'sent' } : m
        ));

        // Simulate delivery
        setTimeout(() => {
          setMessages(prev => prev.map(m => 
            m.id === clientMsgId ? { ...m, status: 'delivered' } : m
          ));
        }, 1500);

        // Simulate read
        setTimeout(() => {
          setMessages(prev => prev.map(m => 
            m.id === clientMsgId ? { ...m, status: 'read' } : m
          ));
        }, 3000);
        
        addDebugLog('info', 'Telegram: Fluxo de status concluído (Sent -> Delivered -> Read).');
      } else {
        // Fallback for other channels
        await new Promise(r => setTimeout(r, 400));
        setMessages(prev => prev.map(m => 
          m.id === clientMsgId ? { ...m, status: 'sent' } : m
        ));
      }

    } catch (err: any) {
      toast({ title: 'Erro ao enviar', description: err.message, variant: 'destructive' });
      setMessages(prev => prev.map(m => 
        m.id === clientMsgId ? { ...m, status: 'error' } : m
      ));
    }

  };

  // New rich-composer handlers
  const sendOptimistic = (content: string) => {
    const id = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id, customer_id: selectedConvId, sender_type: 'agent',
      content, created_at: new Date().toISOString(), status: 'sending',
    }]);
    return id;
  };

  const markStatus = (id: string, status: 'sent' | 'error', overrideId?: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, status, id: overrideId || m.id } : m));
  };

  const handleSendText = async (text: string) => {
    if (!selectedConvId || !text.trim()) return;
    const id = sendOptimistic(text);
    try {
      if (activeChannel === 'whatsapp' && activeWhatsAppConn) {
        const adapter = getProviderAdapter(activeWhatsAppConn.provider);
        const data = await adapter.sendMessage(activeWhatsAppConn, selectedConvId, text);
        markStatus(id, 'sent', data?.data?.key?.id);
      } else {
        await new Promise(r => setTimeout(r, 400));
        markStatus(id, 'sent');
      }
    } catch (err: any) {
      toast({ title: 'Erro ao enviar', description: err.message, variant: 'destructive' });
      markStatus(id, 'error');
      throw err;
    }
  };

  const handleSendMedia = async (a: ComposerAttachment, caption: string) => {
    if (!selectedConvId) return;
    const id = sendOptimistic(`📎 ${a.file.name}${caption ? ` — ${caption}` : ''}`);
    try {
      if (activeChannel === 'whatsapp' && activeWhatsAppConn) {
        const adapter = getProviderAdapter(activeWhatsAppConn.provider);
        if (!adapter.sendMedia) throw new Error('Este canal não suporta envio de mídia ainda.');
        const data = await adapter.sendMedia(activeWhatsAppConn, selectedConvId, a.file, caption);
        markStatus(id, 'sent', data?.data?.key?.id);
      } else {
        await new Promise(r => setTimeout(r, 400));
        markStatus(id, 'sent');
      }
    } catch (err: any) {
      toast({ title: 'Erro ao enviar mídia', description: err.message, variant: 'destructive' });
      markStatus(id, 'error');
      throw err;
    }
  };

  const handleSendAudio = async (blob: Blob, durationSec: number) => {
    if (!selectedConvId) return;
    const id = sendOptimistic(`🎤 Áudio (${durationSec}s)`);
    try {
      if (activeChannel === 'whatsapp' && activeWhatsAppConn) {
        const adapter = getProviderAdapter(activeWhatsAppConn.provider);
        if (!adapter.sendAudio) throw new Error('Este canal não suporta áudio ainda.');
        const data = await adapter.sendAudio(activeWhatsAppConn, selectedConvId, blob);
        markStatus(id, 'sent', data?.data?.key?.id);
      } else {
        await new Promise(r => setTimeout(r, 400));
        markStatus(id, 'sent');
      }
    } catch (err: any) {
      toast({ title: 'Erro ao enviar áudio', description: err.message, variant: 'destructive' });
      markStatus(id, 'error');
      throw err;
    }
  };

  const handleSendRich = async (payload: RichPayload) => {
    if (!selectedConvId) return;
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
    const id = sendOptimistic(summary);
    try {
      if (activeChannel === 'whatsapp' && activeWhatsAppConn) {
        const adapter = getProviderAdapter(activeWhatsAppConn.provider);
        if (!adapter.sendRich) throw new Error('Este canal ainda não suporta este tipo de mensagem.');
        const data = await adapter.sendRich(activeWhatsAppConn, selectedConvId, payload);
        markStatus(id, 'sent', data?.data?.key?.id);
        toast({ title: 'Enviado', description: summary });
      } else {
        await new Promise(r => setTimeout(r, 300));
        markStatus(id, 'sent');
      }
    } catch (err: any) {
      toast({ title: 'Erro ao enviar', description: err.message, variant: 'destructive' });
      markStatus(id, 'error');
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
                      <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
                    ) : whatsappStatus.dbStatus === 'disconnected' ? (
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
        {(channelInfo.key === 'whatsapp' || channelInfo.key === 'telegram') && (
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

        {!whatsappStatus.loading && !whatsappStatus.connected && activeChannel === 'whatsapp' && (
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


        {/* Lista */}
        <div className="w-80 border-r border-border flex flex-col">
          <div className="p-3 border-b border-border">
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
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {list.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())).map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedConvId(c.id)}
                className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left ${
                  selectedConv?.id === c.id ? 'bg-secondary' : ''
                }`}
              >
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">{c.name.split(/[\s.@]/).filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join('')}</span>
                  </div>
                  {c.online && <Circle className="w-3 h-3 text-success fill-success absolute -bottom-0.5 -right-0.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                    <span className="text-[10px] text-muted-foreground">{c.time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{c.msg}</p>
                  <div className="flex items-center gap-1 mt-1">
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
                  <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center ring-1 ring-border">
                    <span className="text-xs font-bold text-primary">{selectedConv.name.split(/[\s.@]/).filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join('')}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{selectedConv.name}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                      <Circle className={`w-1.5 h-1.5 ${selectedConv.online ? 'fill-success text-success' : 'fill-muted-foreground text-muted-foreground'}`} />
                      {selectedConv.online ? 'Online agora' : 'Offline'}
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


                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-2 rounded-lg hover:bg-secondary" title="Iniciar chamada">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Ligar para {selectedConv.name}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
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
                          wavoip.callWhatsApp(selectedConv.phone);
                        }}
                        className="gap-2"
                      >
                        <PhoneCall className="w-4 h-4 text-emerald-500" />
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold">WhatsApp (Wavoip)</span>
                          <span className="text-[10px] text-muted-foreground">
                            {wavoip.config.enabled && wavoip.config.devices.length > 0
                              ? `Tronco pronto · ${wavoip.config.devices.length} device(s)`
                              : 'Tronco não configurado'}
                          </span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
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
                        className="gap-2"
                      >
                        <Headphones className="w-4 h-4 text-primary" />
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold">VoIP (SIP)</span>
                          <span className="text-[10px] text-muted-foreground">
                            Trunk SIP · {voip.status === 'connected' ? 'pronto' : 'desconectado'}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Link to="/video-calls" className="p-2 rounded-lg hover:bg-secondary inline-flex" title="Vídeo chamada"><Video className="w-4 h-4 text-muted-foreground" /></Link>
                  <button
                    onClick={() => setSignatureModalOpen(true)}
                    className="p-2 rounded-lg hover:bg-secondary text-muted-foreground"
                    title="Enviar documento para assinatura"
                  >
                    <PenLine className="w-4 h-4" />
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
                          if (!selectedConvId) return;
                          const { data } = await supabase
                            .from('chat_messages')
                            .select('*')
                            .eq('customer_id', selectedConvId)
                            .order('created_at', { ascending: true });
                          if (data) setMessages(data);
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
                
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${m.sender_type !== 'client' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm relative group ${
                      m.sender_type !== 'client' ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-secondary text-foreground rounded-bl-md'
                    }`}>
                      <p className="whitespace-pre-wrap break-words">{renderWhatsAppText(m.content)}</p>
                      <div className="flex items-center justify-end gap-1 mt-1 opacity-70">
                        <p className="text-[10px]">
                          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {m.sender_type !== 'client' && (
                          <div className="ml-1">
                            {m.status === 'sending' ? (
                              <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                            ) : m.status === 'error' ? (
                              <AlertCircle className="w-2.5 h-2.5 text-destructive-foreground" />
                            ) : m.status === 'sent' ? (
                              <Check className="w-2.5 h-2.5" />
                            ) : m.status === 'delivered' ? (
                              <div className="flex -space-x-1.5"><Check className="w-2.5 h-2.5" /><Check className="w-2.5 h-2.5" /></div>
                            ) : m.status === 'read' ? (
                              <div className="flex -space-x-1.5 text-sky-300"><Check className="w-2.5 h-2.5" /><Check className="w-2.5 h-2.5" /></div>
                            ) : (
                              <CheckCircle2 className="w-2.5 h-2.5" />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <ChatComposer
                conversationId={selectedConvId!}
                text={messageText}
                onChangeText={setMessageText}
                onSendText={handleSendText}
                onSendMedia={handleSendMedia}
                onSendAudio={handleSendAudio}
                recentMessages={messages.map((m: any) => ({ sender_type: m.sender_type, content: m.content }))}
                contactName={selectedConv?.name}
                externalAttachment={externalAttachment}
                onConsumeExternalAttachment={() => setExternalAttachment(null)}
                extras={
                  <RichSendMenu
                    customerId={selectedConvId!}
                    ownerId={(selectedConv as any)?.owner_id || null}
                    onSend={handleSendRich}
                  />
                }
              />
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

      <MediaDropzone active={!!selectedConvId} onDrop={(files) => setExternalAttachment(files[0] || null)} />
      <KeyboardShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <GlobalSearchDialog open={globalSearchOpen} onOpenChange={setGlobalSearchOpen} />
    </AppLayout>
  );
}
