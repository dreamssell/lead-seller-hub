import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload, Files, X, Plus, Send, Loader2, CheckCircle2, AlertCircle,
  Image as ImageIcon, Video as VideoIcon, FileText, AudioLines, Trash2,
  RotateCcw, Ban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const QUEUE_META_KEY = 'chat:composerQueue:meta:v1';
interface PersistedItemMeta {
  id: string;
  name: string;
  size: number;
  type: string;
  kind: 'image' | 'video' | 'audio' | 'document';
  lastModified: number;
}
function persistQueueMeta(items: Array<{ id: string; file: File; kind: PersistedItemMeta['kind'] }>): void {
  try {
    const meta: PersistedItemMeta[] = items.map(i => ({
      id: i.id, name: i.file.name, size: i.file.size, type: i.file.type,
      kind: i.kind, lastModified: i.file.lastModified,
    }));
    if (meta.length) sessionStorage.setItem(QUEUE_META_KEY, JSON.stringify(meta));
    else sessionStorage.removeItem(QUEUE_META_KEY);
  } catch {}
}
function readQueueMeta(): PersistedItemMeta[] {
  try {
    const raw = sessionStorage.getItem(QUEUE_META_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function clearQueueMeta() { try { sessionStorage.removeItem(QUEUE_META_KEY); } catch {} }

type Kind = 'image' | 'video' | 'audio' | 'document';
type Status = 'queued' | 'sending' | 'done' | 'error' | 'canceled' | 'rejected';

interface QueueItem {
  id: string;
  file: File;
  kind: Kind;
  previewUrl: string | null;
  status: Status;
  progress: number;
  error?: string;
}

interface Props {
  active: boolean;
  /** Envia um arquivo. Deve resolver quando o envio terminar. */
  onSendFile: (file: File, kind: Kind) => Promise<void>;
  /** Máximo de arquivos aceitos por lote. Default: 30 */
  maxFiles?: number;
  /** Tamanho máx. por arquivo em bytes. Default: 20MB */
  maxBytes?: number;
  /** Formatos aceitos (accept do input). Default: aceita tudo. */
  accept?: string;
  /** Incrementar para abrir o painel manualmente (fallback mobile). */
  openSignal?: number;
}

function kindOf(file: File): Kind {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'document';
}

function isBlockedFormat(file: File): string | null {
  // Bloqueia apenas executáveis óbvios — WhatsApp aceita quase todos os tipos.
  const bad = /\.(exe|bat|cmd|com|msi|scr|ps1|sh|apk)$/i;
  if (bad.test(file.name)) return 'Formato não permitido';
  return null;
}

function humanSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function KindIcon({ k, className }: { k: Kind; className?: string }) {
  const cls = className ?? 'w-5 h-5';
  if (k === 'image') return <ImageIcon className={cls} />;
  if (k === 'video') return <VideoIcon className={cls} />;
  if (k === 'audio') return <AudioLines className={cls} />;
  return <FileText className={cls} />;
}

export function MediaDropzone({
  active,
  onSendFile,
  maxFiles = 30,
  maxBytes = 20 * 1024 * 1024,
  accept,
  openSignal = 0,
}: Props) {
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [sending, setSending] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const cancelRef = useRef(false);
  const canceledIdsRef = useRef<Set<string>>(new Set());
  const depthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastOpenSignal = useRef(openSignal);

  // Cleanup preview URLs
  useEffect(() => () => {
    items.forEach((i) => { if (i.previewUrl) URL.revokeObjectURL(i.previewUrl); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persistência de metadados da fila (sobrevive a reload dentro da mesma aba).
  // Blobs não podem ser reidratados em File objects sem apoio de IDB específico;
  // por isso ao recarregar exibimos um aviso ao usuário para reanexar.
  useEffect(() => {
    persistQueueMeta(items.map(i => ({ id: i.id, file: i.file, kind: i.kind })));
  }, [items]);

  useEffect(() => {
    const meta = readQueueMeta();
    if (meta.length) {
      toast.warning(`${meta.length} anexo(s) da sessão anterior precisam ser reanexados`, {
        description: meta.slice(0, 3).map(m => m.name).join(' · '),
        duration: 6000,
      });
      clearQueueMeta();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validateAndBuild = useCallback((files: File[]): QueueItem[] => {
    const currentCount = items.length;
    const slots = Math.max(0, maxFiles - currentCount);
    const trimmed = files.slice(0, slots);
    if (files.length > slots) {
      toast.warning(`Limite de ${maxFiles} arquivos. ${files.length - slots} ignorado(s).`);
    }
    return trimmed.map((f) => {
      const k = kindOf(f);
      let status: Status = 'queued';
      let error: string | undefined;
      const blocked = isBlockedFormat(f);
      if (blocked) { status = 'rejected'; error = blocked; }
      else if (f.size > maxBytes) { status = 'rejected'; error = `Excede ${(maxBytes / (1024 * 1024)).toFixed(0)} MB`; }
      const previewUrl = (k === 'image' || k === 'video') ? URL.createObjectURL(f) : null;
      return {
        id: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        file: f, kind: k, previewUrl, status, progress: 0, error,
      };
    });
  }, [items.length, maxBytes, maxFiles]);

  const addFiles = useCallback((files: File[]) => {
    if (!files.length) return;
    const next = validateAndBuild(files);
    if (!next.length) return;
    const rejected = next.filter(i => i.status === 'rejected');
    if (rejected.length) {
      const msg = `${rejected.length} arquivo(s) inválido(s)`;
      toast.error(msg, {
        description: rejected.slice(0, 3).map(r => `${r.file.name}: ${r.error}`).join(' · '),
      });
      setAnnouncement(msg);
    } else {
      setAnnouncement(`${next.length} arquivo(s) adicionado(s) à fila`);
    }
    setItems((prev) => [...prev, ...next]);
    setOpen(true);
  }, [validateAndBuild]);

  const removeItem = (id: string) => {
    setItems((prev) => {
      const it = prev.find(x => x.id === id);
      if (it?.previewUrl) URL.revokeObjectURL(it.previewUrl);
      return prev.filter(x => x.id !== id);
    });
    setAnnouncement('Arquivo removido da fila');
  };

  const clearAll = () => {
    items.forEach(i => { if (i.previewUrl) URL.revokeObjectURL(i.previewUrl); });
    setItems([]);
    setOpen(false);
    cancelRef.current = false;
    canceledIdsRef.current.clear();
    clearQueueMeta();
  };

  const cancelSending = () => {
    cancelRef.current = true;
    toast.message('Cancelando envios pendentes...');
    setAnnouncement('Cancelando envios pendentes');
  };

  const cancelItem = (id: string) => {
    canceledIdsRef.current.add(id);
    setItems(prev => prev.map(x => x.id === id && (x.status === 'queued' || x.status === 'sending')
      ? { ...x, status: 'canceled' } : x));
    setAnnouncement('Envio de arquivo cancelado');
  };

  const retryItem = (id: string) => {
    canceledIdsRef.current.delete(id);
    setItems(prev => prev.map(x => x.id === id
      ? { ...x, status: 'queued', progress: 0, error: undefined } : x));
    setAnnouncement('Reenvio agendado — clique em Enviar');
  };

  const sendOne = async (it: QueueItem): Promise<'ok' | 'fail' | 'canceled'> => {
    if (canceledIdsRef.current.has(it.id)) return 'canceled';
    setItems(prev => prev.map(x => x.id === it.id ? { ...x, status: 'sending', progress: 10 } : x));
    setAnnouncement(`Enviando ${it.file.name}`);
    const tick = window.setInterval(() => {
      setItems(prev => prev.map(x => x.id === it.id && x.status === 'sending'
        ? { ...x, progress: Math.min(90, x.progress + 8) } : x));
    }, 250);
    try {
      await onSendFile(it.file, it.kind);
      window.clearInterval(tick);
      if (canceledIdsRef.current.has(it.id)) {
        setItems(prev => prev.map(x => x.id === it.id ? { ...x, status: 'canceled' } : x));
        return 'canceled';
      }
      setItems(prev => prev.map(x => x.id === it.id ? { ...x, status: 'done', progress: 100 } : x));
      setAnnouncement(`${it.file.name} enviado com sucesso`);
      return 'ok';
    } catch (e: any) {
      window.clearInterval(tick);
      const msg = e?.message || 'Falha no envio';
      setItems(prev => prev.map(x => x.id === it.id ? { ...x, status: 'error', error: msg } : x));
      setAnnouncement(`Falha ao enviar ${it.file.name}: ${msg}`);
      return 'fail';
    }
  };

  const sendAll = async () => {
    const toSend = items.filter(i => i.status === 'queued');
    if (!toSend.length) return;
    setSending(true);
    cancelRef.current = false;
    let ok = 0, fail = 0;
    for (const it of toSend) {
      if (cancelRef.current) {
        setItems(prev => prev.map(x => x.status === 'queued' ? { ...x, status: 'canceled' } : x));
        break;
      }
      const r = await sendOne(it);
      if (r === 'ok') ok++;
      else if (r === 'fail') fail++;
    }
    setSending(false);
    if (ok || fail) {
      const msg = `${ok} enviado(s)${fail ? ` · ${fail} falha(s)` : ''}`;
      fail ? toast.warning(msg) : toast.success(msg);
      setAnnouncement(msg);
    }
    if (fail === 0 && !cancelRef.current) {
      window.setTimeout(() => clearAll(), 900);
    }
  };

  const retryFailed = async () => {
    const failed = items.filter(i => i.status === 'error' || i.status === 'canceled');
    if (!failed.length) return;
    setItems(prev => prev.map(x => (x.status === 'error' || x.status === 'canceled')
      ? { ...x, status: 'queued', progress: 0, error: undefined } : x));
    failed.forEach(f => canceledIdsRef.current.delete(f.id));
    setAnnouncement(`Reenviando ${failed.length} arquivo(s)`);
    // Deixa o React aplicar o reset antes de disparar o envio.
    await new Promise(r => setTimeout(r, 30));
    void sendAll();
  };


  // Drag & drop global
  useEffect(() => {
    if (!active) return;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types?.includes('Files');
    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depthRef.current += 1;
      setOver(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depthRef.current = Math.max(0, depthRef.current - 1);
      if (depthRef.current === 0) setOver(false);
    };
    const onDropEv = (e: DragEvent) => {
      depthRef.current = 0;
      setOver(false);
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      addFiles(Array.from(e.dataTransfer.files));
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDropEv);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDropEv);
    };
  }, [active, addFiles]);

  // Colar (Ctrl/⌘+V) — captura arquivos da área de transferência.
  useEffect(() => {
    if (!active) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items?.length) return;
      const files: File[] = [];
      for (const it of Array.from(items)) {
        if (it.kind === 'file') {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (!files.length) return;
      // Se o foco está num campo de texto e o usuário digitou texto (sem arquivos reais),
      // não interceptar. Aqui já filtramos por kind==='file', então é seguro assumir.
      e.preventDefault();
      addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [active, addFiles]);

  // Sinal externo para abrir picker (fallback mobile)
  useEffect(() => {
    if (openSignal !== lastOpenSignal.current) {
      lastOpenSignal.current = openSignal;
      fileInputRef.current?.click();
    }
  }, [openSignal]);

  // ESC para fechar (quando não está enviando)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) { e.preventDefault(); clearAll(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sending, items]);

  const total = items.length;
  const valid = items.filter(i => i.status !== 'rejected').length;
  const doneCount = items.filter(i => i.status === 'done').length;

  const showOverlay = over || open;
  if (!showOverlay && !active) return null;

  return (
    <>
      {/* Botão flutuante fallback para touch/mobile */}
      {active && (
        <button
          type="button"
          aria-label="Anexar arquivos"
          onClick={() => fileInputRef.current?.click()}
          className="md:hidden fixed bottom-24 right-4 z-[70] h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const list = e.target.files;
          if (list?.length) addFiles(Array.from(list));
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
      />

      {showOverlay && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Enviar arquivos"
          className="fixed inset-0 z-[80] bg-background/50 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            depthRef.current = 0;
            setOver(false);
            if (e.dataTransfer?.files?.length) addFiles(Array.from(e.dataTransfer.files));
          }}
        >
          <div
            ref={panelRef}
            className="w-full max-w-2xl max-h-[85vh] rounded-3xl border-2 border-dashed border-primary bg-background/90 shadow-2xl flex flex-col animate-scale-in overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-border flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                {total > 1 ? <Files className="w-5 h-5 text-primary" /> : <Upload className="w-5 h-5 text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-base">
                  {total === 0
                    ? 'Solte arquivos aqui'
                    : `${total} arquivo${total > 1 ? 's' : ''} na fila`}
                </p>
                <p className="text-xs text-muted-foreground">
                  Máx. {maxFiles} · até {(maxBytes / (1024 * 1024)).toFixed(0)} MB cada
                  {sending && doneCount > 0 && ` · ${doneCount}/${valid} enviados`}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Fechar"
                disabled={sending}
                onClick={clearAll}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Lista de arquivos */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {total === 0 ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-16 rounded-2xl border-2 border-dashed border-border hover:border-primary/60 hover:bg-primary/5 transition flex flex-col items-center gap-3 text-muted-foreground"
                >
                  <Upload className="w-10 h-10 text-primary" />
                  <span className="text-sm font-medium">Toque para selecionar arquivos</span>
                  <span className="text-xs">ou arraste para esta janela</span>
                </button>
              ) : items.map((it) => (
                <div
                  key={it.id}
                  className={`flex items-center gap-3 p-2 rounded-xl border ${
                    it.status === 'rejected' || it.status === 'error'
                      ? 'border-destructive/40 bg-destructive/5'
                      : it.status === 'done'
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : 'border-border bg-secondary/40'
                  }`}
                >
                  {/* Miniatura / chip */}
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-black/10 flex items-center justify-center shrink-0 text-primary">
                    {it.kind === 'image' && it.previewUrl ? (
                      <img src={it.previewUrl} alt="" className="w-full h-full object-cover" />
                    ) : it.kind === 'video' && it.previewUrl ? (
                      <video src={it.previewUrl} className="w-full h-full object-cover" muted />
                    ) : (
                      <KindIcon k={it.kind} />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{it.file.name}</p>
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary text-muted-foreground shrink-0">
                        {it.kind}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {humanSize(it.file.size)}
                      {it.error && <span className="ml-2 text-destructive">· {it.error}</span>}
                      {it.status === 'canceled' && <span className="ml-2">· cancelado</span>}
                    </p>
                    {/* Barra de progresso */}
                    {(it.status === 'sending' || it.status === 'done') && (
                      <div className="mt-1 h-1 w-full rounded-full bg-secondary overflow-hidden">
                        <div
                          className={`h-full ${it.status === 'done' ? 'bg-emerald-500' : 'bg-primary'} transition-[width] duration-300`}
                          style={{ width: `${it.progress}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Status / remover */}
                  <div className="shrink-0 flex items-center gap-1">
                    {it.status === 'sending' && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                    {it.status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    {(it.status === 'error' || it.status === 'rejected') && (
                      <AlertCircle className="w-4 h-4 text-destructive" />
                    )}
                    {(it.status === 'queued' || it.status === 'rejected' || it.status === 'error' || it.status === 'canceled') && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        aria-label={`Remover ${it.file.name}`}
                        onClick={() => removeItem(it.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-2 bg-background/60">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || total >= maxFiles}
              >
                <Plus className="w-4 h-4 mr-1" /> Adicionar
              </Button>
              <div className="flex items-center gap-2">
                {sending ? (
                  <Button type="button" variant="outline" size="sm" onClick={cancelSending}>
                    Cancelar envio
                  </Button>
                ) : (
                  <Button type="button" variant="ghost" size="sm" onClick={clearAll} disabled={total === 0}>
                    Limpar
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={sendAll}
                  disabled={sending || items.filter(i => i.status === 'queued').length === 0}
                >
                  {sending ? (
                    <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Enviando…</>
                  ) : (
                    <><Send className="w-4 h-4 mr-1" /> Enviar {items.filter(i => i.status === 'queued').length || ''}</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
