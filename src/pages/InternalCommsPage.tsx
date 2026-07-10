import { useEffect, useRef, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useInternalComms } from '@/hooks/useInternalComms';
import { useInternalCommsUnread } from '@/hooks/useInternalCommsUnread';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessagesSquare, Send, Search, Users } from 'lucide-react';

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || 'U';
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export default function InternalCommsPage() {
  const {
    members, loadingMembers,
    messages, loadingMessages,
    activePeerId, setActivePeerId, activePeer,
    sendMessage, me,
  } = useInternalComms();
  const { countByPeer, clearPeer } = useInternalCommsUnread();

  const openConversation = (peerId: string) => {
    setActivePeerId(peerId);
    clearPeer(peerId);
  };

  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const filtered = members.filter((m) =>
    !search.trim() ||
    m.display_name.toLowerCase().includes(search.toLowerCase()) ||
    (m.email || '').toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, activePeerId]);

  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    const res = await sendMessage(draft);
    setSending(false);
    if (!res.error) setDraft('');
  };

  return (
    <AppLayout title="Comunicação Interna" subtitle="Converse em tempo real com colegas da sua empresa ou sub-empresa">
      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4 h-[calc(100vh-11rem)] min-h-[500px]">
        {/* Members list */}
        <div className="rounded-2xl border border-border bg-card flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-2">
              <Users className="w-4 h-4" /> Colegas ({members.length})
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar colega..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            {loadingMembers ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Nenhum colega encontrado no seu escopo.
              </div>
            ) : (
              <ul className="p-2 space-y-1">
                {filtered.map((m) => (
                  <li key={m.user_id}>
                    <button
                      type="button"
                      onClick={() => setActivePeerId(m.user_id)}
                      className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left ${
                        activePeerId === m.user_id ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/60'
                      }`}
                    >
                      <Avatar className="w-9 h-9">
                        {m.avatar_url && <AvatarImage src={m.avatar_url} alt={m.display_name} />}
                        <AvatarFallback className="text-xs">{initials(m.display_name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{m.display_name}</p>
                        {m.email && <p className="text-xs text-muted-foreground truncate">{m.email}</p>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </div>

        {/* Thread */}
        <div className="rounded-2xl border border-border bg-card flex flex-col overflow-hidden">
          {!activePeer ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-sm">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                  <MessagesSquare className="w-7 h-7" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">Selecione um colega</h3>
                <p className="text-sm text-muted-foreground">
                  Escolha alguém da sua empresa ou sub-empresa na lista ao lado para iniciar uma conversa privada.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="p-3 border-b border-border flex items-center gap-3">
                <Avatar className="w-9 h-9">
                  {activePeer.avatar_url && <AvatarImage src={activePeer.avatar_url} alt={activePeer.display_name} />}
                  <AvatarFallback className="text-xs">{initials(activePeer.display_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{activePeer.display_name}</p>
                  {activePeer.email && <p className="text-xs text-muted-foreground truncate">{activePeer.email}</p>}
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/20">
                {loadingMessages ? (
                  <div className="text-center text-xs text-muted-foreground py-6">Carregando conversa...</div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-xs text-muted-foreground py-6">
                    Nenhuma mensagem ainda. Envie a primeira!
                  </div>
                ) : messages.map((msg) => {
                  const mine = msg.sender_id === me?.id;
                  return (
                    <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                        mine ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-card border border-border rounded-bl-md'
                      }`}>
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        <p className={`text-[10px] mt-1 ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                          {formatTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-3 border-t border-border flex items-center gap-2">
                <Input
                  placeholder="Escreva sua mensagem..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  disabled={sending}
                />
                <Button onClick={handleSend} disabled={!draft.trim() || sending} size="icon" aria-label="Enviar">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
