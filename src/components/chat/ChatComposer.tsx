import { useEffect, useRef, useState, KeyboardEvent, ReactNode } from 'react';
import { Send, Paperclip, X, Loader2, FileText, AudioLines, CalendarClock, PenLine, MoreHorizontal } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FormatToolbar } from './FormatToolbar';
import { QuickReplyPopover } from './QuickReplyPopover';
import { AIAssistMenu } from './AIAssistMenu';
import { AudioRecorder } from './AudioRecorder';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface ComposerAttachment {
  file: File;
  previewUrl: string | null;
  kind: 'image' | 'video' | 'audio' | 'document';
}

interface Props {
  conversationId: string;
  text: string;
  onChangeText: (v: string) => void;
  onSendText: (text: string) => Promise<void> | void;
  onSendMedia?: (a: ComposerAttachment, caption: string) => Promise<void> | void;
  onSendAudio?: (blob: Blob, durationSec: number) => Promise<void> | void;
  recentMessages: Array<{ sender_type: string; content: string }>;
  contactName?: string;
  disabled?: boolean;
  externalAttachment?: File | null;
  onConsumeExternalAttachment?: () => void;
  extras?: ReactNode;
  /** Etapa 9 — abrir diálogo de agendamento */
  onScheduleClick?: () => void;
  /** Etapa 9 — assinatura pessoal do atendente (texto). */
  signature?: string | null;
  signatureEnabled?: boolean;
  onToggleSignature?: (v: boolean) => void;
}

const MAX_BYTES = 20 * 1024 * 1024;

function kindOf(file: File): ComposerAttachment['kind'] {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'document';
}

export function ChatComposer({
  conversationId,
  text,
  onChangeText,
  onSendText,
  onSendMedia,
  onSendAudio,
  recentMessages,
  contactName,
  disabled,
  externalAttachment,
  onConsumeExternalAttachment,
  extras,
  onScheduleClick,
  signature,
  signatureEnabled,
  onToggleSignature,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachment, setAttachment] = useState<ComposerAttachment | null>(null);
  const [caption, setCaption] = useState('');
  const [sending, setSending] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashKey, setSlashKey] = useState<{ seq: number; key: 'up' | 'down' | 'enter' | null }>({ seq: 0, key: null });

  useEffect(() => {
    if (externalAttachment) {
      attach(externalAttachment);
      onConsumeExternalAttachment?.();
    }
  }, [externalAttachment]);

  useEffect(() => () => { if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl); }, [attachment]);

  useEffect(() => {
    const m = text.match(/(^|\s)\/([\wÀ-ÿ-]*)$/);
    if (m) { setSlashOpen(true); setSlashQuery(m[2]); }
    else setSlashOpen(false);
  }, [text]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.kind === 'file') {
          const f = it.getAsFile();
          if (f) { attach(f); e.preventDefault(); break; }
        }
      }
    };
    const ta = taRef.current;
    ta?.addEventListener('paste', onPaste as any);
    return () => ta?.removeEventListener('paste', onPaste as any);
  }, []);

  const attach = (file: File) => {
    if (file.size > MAX_BYTES) {
      toast.error(`Arquivo "${file.name}" excede 20 MB`);
      return;
    }
    const k = kindOf(file);
    const previewUrl = k === 'image' || k === 'video' || k === 'audio' ? URL.createObjectURL(file) : null;
    setAttachment({ file, previewUrl, kind: k });
  };

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    attach(files[0]);
  };

  const insertSlashPick = (replyText: string) => {
    const next = text.replace(/(^|\s)\/([\wÀ-ÿ-]*)$/, (_m, p) => `${p}${replyText}`);
    onChangeText(next);
    setSlashOpen(false);
    requestAnimationFrame(() => taRef.current?.focus());
  };

  const withSignature = (raw: string) => {
    if (!signatureEnabled || !signature?.trim()) return raw;
    const sig = signature.trim();
    if (raw.trim().endsWith(sig)) return raw;
    return `${raw.trimEnd()}\n\n${sig}`;
  };

  const submit = async () => {
    if (sending || disabled) return;
    if (attachment && onSendMedia) {
      setSending(true);
      try { await onSendMedia(attachment, withSignature(caption || text)); resetAfterSend(); }
      catch { /* ignore */ }
      finally { setSending(false); }
      return;
    }
    if (!text.trim()) return;
    setSending(true);
    try { await onSendText(withSignature(text)); resetAfterSend(); }
    catch { /* ignore */ }
    finally { setSending(false); }
  };

  const resetAfterSend = () => {
    onChangeText('');
    setCaption('');
    setAttachment((a) => { if (a?.previewUrl) URL.revokeObjectURL(a.previewUrl); return null; });
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Etapa 9 — navegação da lista de /atalhos
    if (slashOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashKey(s => ({ seq: s.seq + 1, key: 'down' })); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSlashKey(s => ({ seq: s.seq + 1, key: 'up' })); return; }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); setSlashKey(s => ({ seq: s.seq + 1, key: 'enter' })); return;
      }
      if (e.key === 'Escape') { e.preventDefault(); setSlashOpen(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); return; }
    if (e.key === 'Escape') {
      if (attachment) { resetAfterSend(); }
    }
  };

  const variables = { nome: contactName || '', empresa: 'Lead Seller' };

  return (
    <TooltipProvider>
      <div className="border-t border-border p-3 relative">
        {attachment && (
          <div className="mb-2 p-3 rounded-xl border border-border bg-secondary/40 flex items-start gap-3">
            <div className="w-14 h-14 rounded-lg overflow-hidden bg-black/10 flex items-center justify-center shrink-0">
              {attachment.kind === 'image' && attachment.previewUrl ? (
                <img src={attachment.previewUrl} alt="" className="w-full h-full object-cover" />
              ) : attachment.kind === 'video' && attachment.previewUrl ? (
                <video src={attachment.previewUrl} className="w-full h-full object-cover" />
              ) : attachment.kind === 'audio' ? (
                <AudioLines className="w-6 h-6 text-primary" />
              ) : (
                <FileText className="w-6 h-6 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-xs font-medium truncate">{attachment.file.name}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {(attachment.file.size / 1024).toFixed(1)} KB · {attachment.kind}
              </p>
              <input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Adicionar legenda (opcional)"
                className="w-full bg-background border border-border rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <button onClick={resetAfterSend} className="p-1.5 rounded hover:bg-destructive/10 text-destructive shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <QuickReplyPopover open={slashOpen} query={slashQuery} onPick={insertSlashPick} variables={variables} externalKey={slashKey} />

        <div className="flex items-end gap-2 mt-1">
          <div className="flex items-center">
            <Popover>
              <PopoverTrigger asChild>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-xl">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Formatação e emojis</TooltipContent>
                </Tooltip>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" className="w-auto p-1">
                <FormatToolbar textareaRef={taRef} value={text} onChange={onChangeText} />
              </PopoverContent>
            </Popover>
            <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-xl" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Anexar arquivo</TooltipContent>
            </Tooltip>
            {onScheduleClick && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-xl" onClick={onScheduleClick} disabled={disabled}>
                    <CalendarClock className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Agendar mensagem</TooltipContent>
              </Tooltip>
            )}
            {signature != null && onToggleSignature && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={signatureEnabled ? 'secondary' : 'ghost'}
                    size="icon"
                    className={`h-10 w-10 rounded-xl ${signatureEnabled ? 'text-primary' : ''}`}
                    onClick={() => onToggleSignature(!signatureEnabled)}
                    disabled={!signature?.trim()}
                  >
                    <PenLine className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {!signature?.trim()
                    ? 'Defina sua assinatura em Perfil'
                    : signatureEnabled ? 'Assinatura ativa' : 'Ativar assinatura'}
                </TooltipContent>
              </Tooltip>
            )}
            {extras}
          </div>

          <Textarea
            ref={taRef}
            data-composer="1"
            value={text}
            onChange={(e) => onChangeText(e.target.value)}
            onKeyDown={onKey}
            placeholder={attachment ? 'Enter para enviar o anexo · Esc para cancelar' : 'Digite sua mensagem · *negrito* _itálico_ ~tachado~ `mono` · / para respostas rápidas'}
            rows={1}
            className="flex-1 min-h-[44px] max-h-32 resize-none rounded-xl bg-secondary border-0 focus-visible:ring-2 focus-visible:ring-primary/30 text-sm py-2.5"
          />

          <AIAssistMenu messages={recentMessages} currentText={text} onSuggest={(t) => onChangeText(t)} onSummary={(t) => toast.message('Resumo da conversa', { description: t, duration: 12000 })} />

          {!attachment && !text && onSendAudio && (
            <AudioRecorder onSend={onSendAudio} />
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                onClick={submit}
                disabled={sending || disabled || (!text.trim() && !attachment)}
                className="h-10 w-10 p-0 rounded-xl"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Enviar (Enter)</TooltipContent>
          </Tooltip>
        </div>

        {sending && attachment && (
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-secondary/60">
            <div className="h-full w-1/3 bg-primary animate-[progress_1.2s_ease-in-out_infinite]" style={{ animationName: 'progress' }} />
            <style>{`@keyframes progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }`}</style>
          </div>
        )}

        <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground px-1">
          <span>
            Rascunho salvo automaticamente · <kbd className="px-1 py-px bg-secondary border border-border rounded">/</kbd> respostas rápidas · <kbd className="px-1 py-px bg-secondary border border-border rounded">↑↓</kbd> navegar · arraste arquivos para anexar
          </span>
          <span>{text.length} caracteres{signatureEnabled && signature?.trim() ? ' · assinatura ativa' : ''}</span>
        </div>
      </div>
    </TooltipProvider>
  );
}
