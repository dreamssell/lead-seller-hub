/**
 * FocusedChatPage — ambiente premium standalone do WhatsApp.
 *
 * Objetivos:
 *  - Foco total na conversa: lista à esquerda (compacta), thread central em destaque,
 *    painel lateral direito colapsável por ferramenta escolhida no header.
 *  - Header com barra de ícones clicáveis (Info, Mídia, Fixadas, Estrelas, Busca,
 *    Notas, 360, IA) — cada um alterna o conteúdo do painel direito.
 *  - Realtime: atualização em segundo plano via Postgres Changes, sem reload.
 *  - Reutiliza componentes já existentes do /chat sem alterá-los, garantindo
 *    zero regressão no fluxo principal.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MessageCircle, Search, Info, Images, Pin, Star, StickyNote,
  Bot, Clock8, X, Minimize2, Wifi, WifiOff, CheckCheck, Check,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  getCachedConvs, setCachedConvs,
  getCachedMessages, setCachedMessages,
} from '@/lib/chatCache';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { renderWhatsAppText } from '@/lib/whatsappFormat';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { ChatRightPanel } from '@/components/chat/ChatRightPanel';
import { MediaGallery } from '@/components/chat/MediaGallery';
import { StarredMessagesPanel } from '@/components/chat/StarredMessagesPanel';
import { AIInsightsPanel } from '@/components/chat/AIInsightsPanel';
import { Customer360Timeline } from '@/components/chat/Customer360Timeline';

import { getProviderAdapter } from '@/components/whatsapp/adapters';
import type { WhatsAppConnection } from '@/components/whatsapp/types';

type Tool = null | 'info' | 'media' | 'pinned' | 'starred' | 'notes' | 'ai' | 'timeline';

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

export default function FocusedChatPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const initialConv = params.get('c');

  const [convs, setConvs] = useState<Conversation[]>([]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(initialConv);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [conn, setConn] = useState<WhatsAppConnection | null>(null);
  const [connOnline, setConnOnline] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [tool, setTool] = useState<Tool>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedConv = useMemo(() => convs.find(c => c.id === selected) || null, [convs, selected]);

  // Load first active WhatsApp connection.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('whatsapp_connections')
        .select('*')
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
    // Hidratação instantânea a partir do cache local (IndexedDB).
    try {
      const cached = await getCachedConvs<Conversation>(user?.id, 'whatsapp');
      if (cached?.length) { setConvs(cached); setLoading(false); }
      else setLoading(true);
    } catch { setLoading(true); }
    const { data: customers } = await supabase
      .from('customers')
      .select('id,name,phone,avatar_url,presence,is_archived')
      .eq('channel', 'whatsapp')
      .order('updated_at', { ascending: false })
      .limit(200);
    if (!customers) { setLoading(false); return; }
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
    const list: Conversation[] = customers
      .filter((c: any) => !c.is_archived)
      .map((c: any) => ({
        id: c.id,
        name: c.name || c.phone || 'Sem nome',
        phone: c.phone,
        avatar_url: c.avatar_url,
        presence: c.presence,
        last_message: lastByCustomer.get(c.id)?.content?.slice(0, 80) || 'Sem mensagem ainda',
        last_at: lastByCustomer.get(c.id)?.created_at || null,
        unread: 0,
      }))
      .sort((a, b) => (b.last_at || '').localeCompare(a.last_at || ''));
    setConvs(list);
    setLoading(false);
    void setCachedConvs(user?.id, 'whatsapp', list);
  }, [user?.id]);

  useEffect(() => { loadConvs(); }, [loadConvs]);

  // Load messages for selected conversation.
  const loadMessages = useCallback(async (cid: string) => {
    // Hidratação instantânea via cache; delta fetch atualiza gradualmente.
    const cached = await getCachedMessages<Msg>(user?.id, cid);
    if (cached?.items?.length) {
      setMsgs(cached.items);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' });
      });
    }
    const deltaFrom = cached?.lastAt || null;
    const base = supabase
      .from('chat_messages')
      .select('*')
      .eq('customer_id', cid)
      .order('created_at', { ascending: true })
      .limit(500);
    const { data } = deltaFrom ? await base.gt('created_at', deltaFrom) : await base;
    const fetched = (data as Msg[]) || [];
    const merged: Msg[] = deltaFrom
      ? [
          ...(cached?.items || []),
          ...fetched.filter(f => !(cached?.items || []).some((c: any) => c.id === f.id)),
        ]
      : fetched;
    setMsgs(merged);
    void setCachedMessages(user?.id, cid, merged);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' });
    });
  }, [user?.id]);

  useEffect(() => {
    if (!selected) return;
    loadMessages(selected);
    if (initialConv !== selected) setParams({ c: selected }, { replace: true });
  }, [selected, loadMessages, initialConv, setParams]);

  // Realtime: new/updated messages arrive silently in background.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('focused-chat')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const m = payload.new as Msg;
          setConvs(prev => {
            const idx = prev.findIndex(c => c.id === m.customer_id);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = {
              ...next[idx],
              last_message: (m.content || '').slice(0, 80),
              last_at: m.created_at,
              unread: selected === m.customer_id ? 0 : next[idx].unread + (m.sender_type === 'client' ? 1 : 0),
            };
            next.sort((a, b) => (b.last_at || '').localeCompare(a.last_at || ''));
            return next;
          });
          if (m.customer_id === selected) {
            setMsgs(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m]));
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
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, selected]);

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
    } catch (err: any) {
      setMsgs(prev => prev.map(m => m.client_msg_id === clientId
        ? { ...m, metadata: { status: 'error', error: err?.message } } : m));
      toast({ title: 'Falha ao enviar', description: err?.message, variant: 'destructive' });
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
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Buscar conversa..."
                  className="pl-8 h-9"
                />
              </div>
            </div>
            <ScrollArea className="flex-1">
              {loading && !convs.length ? (
                <div className="p-6 text-xs text-muted-foreground text-center">Carregando...</div>
              ) : filteredConvs.length === 0 ? (
                <div className="p-6 text-xs text-muted-foreground text-center">Nenhuma conversa</div>
              ) : (
                filteredConvs.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelected(c.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/60 transition text-left border-b border-border/40',
                      selected === c.id && 'bg-primary/10 hover:bg-primary/10',
                    )}
                  >
                    <Avatar className="w-10 h-10 shrink-0">
                      <AvatarImage src={c.avatar_url || undefined} />
                      <AvatarFallback className="text-xs bg-secondary">{initials(c.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate">{c.name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(c.last_at)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground truncate">{c.last_message}</span>
                        {c.unread > 0 && (
                          <Badge className="h-4 min-w-4 px-1 text-[10px] bg-emerald-500 text-white">{c.unread}</Badge>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </ScrollArea>
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
                      <div className="text-[11px] text-muted-foreground truncate">
                        {selectedConv.phone || '—'} {selectedConv.presence ? `· ${selectedConv.presence}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
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

                {/* Messages */}
                <div
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto px-6 py-4 space-y-2 bg-gradient-to-b from-background to-secondary/20"
                >
                  {msgs.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                      Nenhuma mensagem ainda — envie a primeira.
                    </div>
                  ) : msgs.map(m => {
                    const isMe = m.sender_type !== 'client';
                    const status = m.metadata?.status;
                    return (
                      <div key={m.id} className={cn('flex', isMe ? 'justify-end' : 'justify-start')}>
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
                    );
                  })}
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
    </TooltipProvider>
  );
}
