import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useInternalComms, type OutgoingAttachment } from '@/hooks/useInternalComms';
import { useInternalCommsUnread } from '@/hooks/useInternalCommsUnread';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessagesSquare, Send, Search, Users, Paperclip, X, Loader2,
  UploadCloud, RotateCcw, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  validateInternalAttachment, ALLOWED_ATTACHMENT_MIMES,
  MAX_ATTACHMENT_BYTES, attachmentKindFor,
} from '@/lib/internalCommsAttachments';
import { compressImageFile } from '@/lib/imageCompression';
import { AudioRecorder } from '@/components/internal-comms/AudioRecorder';
import { AttachmentBubble } from '@/components/internal-comms/AttachmentBubble';

const MAX_ATTACHMENTS_PER_MESSAGE = 10;

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || 'U';
}
function formatTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}
function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type QueueItem = {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'sent' | 'failed';
  error?: string;
};

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
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
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

  const clearAllAttachments = () => {
    setQueue([]);
    setAttachmentError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const addFiles = (files: File[]) => {
    if (!files.length) return;
    setAttachmentError(null);
    const remaining = MAX_ATTACHMENTS_PER_MESSAGE - queue.length;
    if (remaining <= 0) {
      const msg = `Limite de ${MAX_ATTACHMENTS_PER_MESSAGE} anexos por mensagem atingido.`;
      setAttachmentError(msg); toast.error(msg);
      return;
    }
    const toConsider = files.slice(0, remaining);
    if (files.length > remaining) {
      toast.error(`Apenas os primeiros ${remaining} arquivos foram anexados (limite ${MAX_ATTACHMENTS_PER_MESSAGE}).`);
    }
    const accepted: QueueItem[] = [];
    for (const file of toConsider) {
      const result = validateInternalAttachment({ filename: file.name, mime: file.type, size: file.size });
      if (result.ok === true) {
        accepted.push({
          id: (crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
          file, status: 'pending',
        });
      } else {
        setAttachmentError(result.message);
        toast.error(`${file.name}: ${result.message}`);
      }
    }
    if (accepted.length) setQueue((prev) => [...prev, ...accepted]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    addFiles(list);
  };

  const removeFromQueue = (id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  };

  const uploadOne = async (item: QueueItem, textForFirst: string): Promise<boolean> => {
    setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: 'uploading', error: undefined } : q));
    const outgoing: OutgoingAttachment = {
      file: item.file,
      filename: item.file.name,
      mime: item.file.type || 'application/octet-stream',
      size: item.file.size,
      kind: attachmentKindFor(item.file.type || ''),
    };
    const res = await sendMessage(textForFirst, outgoing);
    if (res.error) {
      setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: 'failed', error: res.error! } : q));
      return false;
    }
    setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: 'sent' } : q));
    return true;
  };

  const handleSend = async () => {
    if (attachmentError) { toast.error('Corrija os anexos antes de enviar.'); return; }
    const text = draft.trim();
    const pending = queue.filter((q) => q.status === 'pending' || q.status === 'failed');
    if ((!text && pending.length === 0) || sending) return;
    setSending(true);
    try {
      if (pending.length === 0) {
        // Somente texto — mantém contrato anterior.
        const res = await sendMessage(draft, null);
        if (res.error) toast.error(`Falha ao enviar: ${res.error}`);
        else setDraft('');
        return;
      }
      let textAttached = false;
      let anyFailed = false;
      for (const item of pending) {
        const ok = await uploadOne(item, !textAttached ? draft : '');
        if (ok) textAttached = true;
        else anyFailed = true;
      }
      // Limpa somente enviados; mantém falhados para retry.
      setQueue((prev) => prev.filter((q) => q.status !== 'sent'));
      if (!anyFailed) { setDraft(''); setAttachmentError(null); }
      else toast.error('Alguns anexos falharam. Toque em "Tentar novamente" para reenviar.');
    } finally {
      setSending(false);
    }
  };

  const retryOne = async (id: string) => {
    const item = queue.find((q) => q.id === id);
    if (!item || sending) return;
    setSending(true);
    try { await uploadOne(item, ''); }
    finally { setSending(false); setQueue((prev) => prev.filter((q) => q.status !== 'sent')); }
  };

  const handleAudioRecorded = async (payload: { blob: Blob; mime: string; durationMs: number }) => {
    if (sending) return;
    setSending(true);
    const ext = payload.mime.includes('mp4') ? 'm4a' : payload.mime.includes('ogg') ? 'ogg' : 'webm';
    const filename = `audio-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
    const outgoing: OutgoingAttachment = {
      file: payload.blob, filename, mime: payload.mime,
      size: payload.blob.size, kind: 'audio', durationMs: payload.durationMs,
    };
    const res = await sendMessage('', outgoing);
    setSending(false);
    if (res.error) toast.error(`Falha ao enviar áudio: ${res.error}`);
  };

  // Drag & drop no painel da conversa.
  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!activePeerId) return;
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dragCounter.current += 1;
    setIsDragging(true);
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!activePeerId) return;
    if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setIsDragging(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!activePeerId) return;
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) addFiles(files);
  };

  const hasPendingUploads = useMemo(() => queue.some((q) => q.status !== 'sent'), [queue]);
  const composerBusy = sending || (queue.some((q) => q.status === 'uploading'));
  const canSend = !composerBusy && !attachmentError && (draft.trim().length > 0 || queue.some((q) => q.status === 'pending' || q.status === 'failed'));

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
        <div
          className="relative rounded-2xl border border-border bg-card flex flex-col overflow-hidden"
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {isDragging && activePeerId && (
            <div
              className="absolute inset-0 z-20 bg-background/70 backdrop-blur-sm border-2 border-dashed border-primary rounded-2xl flex flex-col items-center justify-center pointer-events-none"
              data-testid="dropzone-overlay"
            >
              <UploadCloud className="w-10 h-10 text-primary mb-2" />
              <p className="text-sm font-semibold text-foreground">Solte para anexar</p>
              <p className="text-xs text-muted-foreground">
                Até {MAX_ATTACHMENTS_PER_MESSAGE} arquivos · {Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB cada
              </p>
            </div>
          )}
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
                  const hasAttachment = !!msg.attachment_url;
                  return (
                    <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm space-y-2 ${
                        mine ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-card border border-border rounded-bl-md'
                      }`}>
                        {hasAttachment && (
                          <AttachmentBubble
                            url={msg.attachment_url!}
                            name={msg.attachment_name}
                            mime={msg.attachment_mime}
                            size={msg.attachment_size}
                            kind={msg.attachment_kind}
                            durationMs={msg.audio_duration_ms}
                            mine={mine}
                          />
                        )}
                        {msg.content && (
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        )}
                        <p className={`text-[10px] ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                          {formatTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-border">
                {attachmentError && (
                  <div
                    role="alert"
                    data-testid="attachment-error"
                    className="px-3 py-2 text-xs flex items-center justify-between gap-2 bg-destructive/10 text-destructive"
                  >
                    <span className="truncate">{attachmentError}</span>
                    <button
                      type="button"
                      onClick={() => setAttachmentError(null)}
                      className="p-1 rounded hover:bg-background/60"
                      aria-label="Fechar aviso"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {queue.length > 0 && (
                  <div
                    data-testid="attachment-pending"
                    className="px-3 py-2 border-b border-border bg-muted/30 space-y-1.5 max-h-40 overflow-y-auto"
                  >
                    <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                      <span>Anexo pronto: {queue.length} {queue.length === 1 ? 'arquivo' : 'arquivos'}</span>
                      <button
                        type="button"
                        onClick={clearAllAttachments}
                        className="text-destructive hover:underline"
                        disabled={composerBusy}
                      >
                        Remover todos
                      </button>
                    </div>
                    {queue.map((q) => (
                      <div key={q.id} className="flex items-center gap-2 text-xs bg-background/80 rounded-md px-2 py-1.5 border border-border">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {q.status === 'sent' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                            {q.status === 'failed' && <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
                            {q.status === 'uploading' && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
                            <span className="truncate font-medium text-foreground">{q.file.name}</span>
                            <span className="text-muted-foreground shrink-0">· {fmtSize(q.file.size)}</span>
                          </div>
                          {q.status === 'uploading' && (
                            <div className="h-1 mt-1 rounded-full bg-muted overflow-hidden" aria-label="Enviando anexo">
                              <div className="h-full w-1/3 bg-primary animate-[shimmer_1.2s_infinite]" style={{
                                animation: 'shimmer 1.2s linear infinite',
                                background: 'linear-gradient(90deg, hsl(var(--primary)/0.3), hsl(var(--primary)), hsl(var(--primary)/0.3))',
                                backgroundSize: '200% 100%',
                              }} />
                            </div>
                          )}
                          {q.status === 'failed' && q.error && (
                            <p className="text-[10px] text-destructive truncate mt-0.5">{q.error}</p>
                          )}
                        </div>
                        {q.status === 'failed' && (
                          <button
                            type="button"
                            onClick={() => retryOne(q.id)}
                            className="p-1 rounded hover:bg-muted text-primary"
                            aria-label={`Tentar enviar ${q.file.name} novamente`}
                            disabled={composerBusy}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {q.status !== 'uploading' && (
                          <button
                            type="button"
                            onClick={() => removeFromQueue(q.id)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground"
                            aria-label={`Remover ${q.file.name}`}
                            disabled={composerBusy}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="p-3 flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept={ALLOWED_ATTACHMENT_MIMES.join(',')}
                    onChange={handleFileChange}
                    data-testid="attachment-input"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Anexar arquivos"
                    title={`Até ${MAX_ATTACHMENTS_PER_MESSAGE} anexos · ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB cada`}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={composerBusy || queue.length >= MAX_ATTACHMENTS_PER_MESSAGE}
                  >
                    <Paperclip className="w-4 h-4" />
                  </Button>
                  <AudioRecorder disabled={composerBusy} onRecorded={handleAudioRecorded} />
                  <Input
                    placeholder={hasPendingUploads ? 'Escreva uma legenda (opcional)…' : 'Escreva sua mensagem...'}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    disabled={composerBusy}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!canSend}
                    size="icon"
                    aria-label="Enviar"
                  >
                    {composerBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
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
