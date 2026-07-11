import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useInternalComms } from '@/hooks/useInternalComms';
import { useInternalCommsUnread } from '@/hooks/useInternalCommsUnread';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessagesSquare, Send, Search, Users, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { validateInternalAttachment, ALLOWED_ATTACHMENT_MIMES, MAX_ATTACHMENT_BYTES } from '@/lib/internalCommsAttachments';

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
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const filtered = members.filter((m) =>
    !search.trim() ||
    m.display_name.toLowerCase().includes(search.toLowerCase()) ||
    (m.email || '').toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, activePeerId]);

  const clearAttachment = () => {
    setPendingFile(null);
    setAttachmentError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = validateInternalAttachment({ filename: file.name, mime: file.type, size: file.size });
    if (result.ok === true) {
      setAttachmentError(null);
      setPendingFile(file);
      return;
    }
    const msg = result.message;
    setPendingFile(null);
    setAttachmentError(msg);
    toast.error(msg);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async () => {
    if (attachmentError) {
      toast.error('Corrija o anexo antes de enviar.');
      return;
    }
    if ((!draft.trim() && !pendingFile) || sending) return;
    setSending(true);
    const res = await sendMessage(draft);
    setSending(false);
    if (!res.error) { setDraft(''); clearAttachment(); }
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
                      onClick={() => openConversation(m.user_id)}
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
                      {countByPeer[m.user_id] > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center">
                          {countByPeer[m.user_id] > 99 ? '99+' : countByPeer[m.user_id]}
                        </span>
                      )}
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

              <div className="border-t border-border">
                {(pendingFile || attachmentError) && (
                  <div
                    role={attachmentError ? 'alert' : undefined}
                    data-testid={attachmentError ? 'attachment-error' : 'attachment-pending'}
                    className={`px-3 py-2 text-xs flex items-center justify-between gap-2 ${
                      attachmentError ? 'bg-destructive/10 text-destructive' : 'bg-muted/40 text-muted-foreground'
                    }`}
                  >
                    <span className="truncate">
                      {attachmentError ?? `Anexo pronto: ${pendingFile?.name}`}
                    </span>
                    <button
                      type="button"
                      onClick={clearAttachment}
                      className="p-1 rounded hover:bg-background/60"
                      aria-label="Remover anexo"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <div className="p-3 flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept={ALLOWED_ATTACHMENT_MIMES.join(',')}
                    onChange={handleFileChange}
                    data-testid="attachment-input"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Anexar arquivo"
                    title={`Anexos até ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB`}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending}
                  >
                    <Paperclip className="w-4 h-4" />
                  </Button>
                  <Input
                    placeholder="Escreva sua mensagem..."
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    disabled={sending}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!draft.trim() || sending || !!attachmentError}
                    size="icon"
                    aria-label="Enviar"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
