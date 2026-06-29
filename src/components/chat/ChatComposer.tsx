import { useEffect, useRef, useState, KeyboardEvent, ReactNode } from 'react';
import { Send, Paperclip, X, Loader2, FileText, Image as ImageIcon, Mic, AudioLines } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FormatToolbar } from './FormatToolbar';
import { QuickReplyPopover } from './QuickReplyPopover';
import { AIAssistMenu } from './AIAssistMenu';
import { AudioRecorder } from './AudioRecorder';
import { toast } from 'sonner';

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
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachment, setAttachment] = useState<ComposerAttachment | null>(null);
  const [caption, setCaption] = useState('');
  const [sending, setSending] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');

  // Receive externally-dropped/pasted files (from page-level dropzone)
  useEffect(() => {
    if (externalAttachment) {
      attach(externalAttachment);
      onConsumeExternalAttachment?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalAttachment]);

  // Clean up object URL
  useEffect(() => () => { if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl); }, [attachment]);

  // Slash detection
  useEffect(() => {
    const m = text.match(/(^|\s)\/([\wÀ-ÿ-]*)$/);
    if (m) { setSlashOpen(true); setSlashQuery(m[2]); }
    else setSlashOpen(false);
  }, [text]);

  // Paste image from clipboard
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

  const submit = async () => {
    if (sending || disabled) return;
    if (attachment && onSendMedia) {
      setSending(true);
      try { await onSendMedia(attachment, caption || text); resetAfterSend(); }
      catch (e: any) { toast.error(e?.message || 'Falha ao enviar anexo'); }
      finally { setSending(false); }
      return;
    }
    if (!text.trim()) return;
    setSending(true);
    try { await onSendText(text); resetAfterSend(); }
    catch (e: any) { toast.error(e?.message || 'Falha ao enviar'); }
    finally { setSending(false); }
  };

  const resetAfterSend = () => {
    onChangeText('');
    setCaption('');
    setAttachment((a) => { if (a?.previewUrl) URL.revokeObjectURL(a.previewUrl); return null; });
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const cmd = e.ctrlKey || e.metaKey;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); return; }
    if (cmd && e.key.toLowerCase() === 'b') { e.preventDefault(); document.execCommand?.('insertText'); /* handled by toolbar */ }
    if (e.key === 'Escape') {
      if (slashOpen) { setSlashOpen(false); return; }
      if (attachment) { resetAfterSend(); }
    }
  };

  const variables = { nome: contactName || '', empresa: 'Lead Seller' };

  return (
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

      <QuickReplyPopover open={slashOpen} query={slashQuery} onPick={insertSlashPick} variables={variables} />

      <FormatToolbar textareaRef={taRef} value={text} onChange={onChangeText} />

      <div className="flex items-end gap-2 mt-1">
        <div className="flex items-center">
          <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-xl" onClick={() => fileInputRef.current?.click()} title="Anexar arquivo">
            <Paperclip className="w-4 h-4" />
          </Button>
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

        <Button
          type="button"
          onClick={submit}
          disabled={sending || disabled || (!text.trim() && !attachment)}
          className="h-10 w-10 p-0 rounded-xl"
          title="Enviar (Enter)"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground px-1">
        <span>
          Rascunho salvo automaticamente · use <kbd className="px-1 py-px bg-secondary border border-border rounded">/</kbd> para respostas rápidas
        </span>
        <span>{text.length} caracteres</span>
      </div>
    </div>
  );
}
