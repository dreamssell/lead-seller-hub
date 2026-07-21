/**
 * AttachmentBubble — renderiza o anexo de uma mensagem interna.
 *
 * Como o bucket `internal-comms` é privado, geramos uma signed URL sob demanda
 * (cache local por URL/expiração para evitar tempestade de chamadas quando a
 * conversa tem várias mídias). Imagem abre em modal com zoom ajustável (roda do
 * mouse, botões +/-, atalhos de teclado e arraste para pan). Áudio usa <audio>
 * nativo com preload=metadata, e arquivos genéricos exibem cartão com nome/tamanho
 * e botão para baixar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Download, Loader2, ImageOff, ZoomIn, ZoomOut, RotateCcw, X } from 'lucide-react';

// Cache simples: chave = objectKey, valor = { url, exp (epoch ms) }.
const signedCache = new Map<string, { url: string; exp: number }>();
const SIGN_TTL_S = 60 * 60; // 1h

async function getSignedUrl(objectKey: string): Promise<string | null> {
  const now = Date.now();
  const cached = signedCache.get(objectKey);
  if (cached && cached.exp - 60_000 > now) return cached.url;
  const { data, error } = await supabase.storage
    .from('internal-comms')
    .createSignedUrl(objectKey, SIGN_TTL_S);
  if (error || !data?.signedUrl) return null;
  signedCache.set(objectKey, { url: data.signedUrl, exp: now + SIGN_TTL_S * 1000 });
  return data.signedUrl;
}

function humanSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDuration(ms?: number | null) {
  if (!ms || ms <= 0) return '';
  const s = Math.round(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export interface AttachmentBubbleProps {
  url: string; // objectKey no bucket (versão exibível / comprimida)
  name?: string | null;
  mime?: string | null;
  size?: number | null;
  kind?: 'image' | 'audio' | 'file' | null;
  durationMs?: number | null;
  mine?: boolean;
  /** Chave do arquivo original (sem compressão), quando disponível. */
  originalUrl?: string | null;
  originalSize?: number | null;
}

function ImageLightbox({ src, name, onClose }: { src: string; name?: string | null; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragRef = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);

  const reset = useCallback(() => { setScale(1); setTx(0); setTy(0); }, []);
  const zoomBy = useCallback((delta: number) => {
    setScale((s) => Math.min(6, Math.max(1, +(s + delta).toFixed(2))));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') zoomBy(0.25);
      else if (e.key === '-' || e.key === '_') zoomBy(-0.25);
      else if (e.key === '0') reset();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, zoomBy, reset]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    zoomBy(e.deltaY > 0 ? -0.15 : 0.15);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, sx: tx, sy: ty };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setTx(dragRef.current.sx + (e.clientX - dragRef.current.x));
    setTy(dragRef.current.sy + (e.clientY - dragRef.current.y));
  };
  const onPointerUp = () => { dragRef.current = null; };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Visualizar ${name || 'imagem'}`}
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
        <button
          type="button" onClick={() => zoomBy(0.25)}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
          aria-label="Aumentar zoom"
        ><ZoomIn className="w-4 h-4" /></button>
        <button
          type="button" onClick={() => zoomBy(-0.25)}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
          aria-label="Diminuir zoom"
        ><ZoomOut className="w-4 h-4" /></button>
        <button
          type="button" onClick={reset}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
          aria-label="Redefinir zoom"
        ><RotateCcw className="w-4 h-4" /></button>
        <button
          type="button" onClick={onClose}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
          aria-label="Fechar visualização"
        ><X className="w-4 h-4" /></button>
      </div>
      <div className="absolute top-3 left-3 text-white/80 text-xs bg-white/10 rounded px-2 py-1">
        {Math.round(scale * 100)}%
      </div>
      <div
        className="w-full h-full flex items-center justify-center overflow-hidden select-none"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: scale > 1 ? (dragRef.current ? 'grabbing' : 'grab') : 'zoom-in' }}
        onDoubleClick={() => (scale === 1 ? setScale(2) : reset())}
      >
        <img
          src={src}
          alt={name || 'anexo'}
          draggable={false}
          className="max-w-[95vw] max-h-[92vh] object-contain transition-transform will-change-transform"
          style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
        />
      </div>
    </div>
  );
}

export function AttachmentBubble({
  url, name, mime, size, kind, durationMs, mine,
  originalUrl, originalSize,
}: AttachmentBubbleProps) {
  const [signed, setSigned] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const derivedKind: 'image' | 'audio' | 'file' = useMemo(() => {
    if (kind) return kind;
    if (mime?.startsWith('image/')) return 'image';
    if (mime?.startsWith('audio/')) return 'audio';
    return 'file';
  }, [kind, mime]);

  const hasOriginal = !!originalUrl && !!originalSize && !!size && originalSize > size;
  const savedPct = hasOriginal ? Math.round((1 - (size as number) / (originalSize as number)) * 100) : 0;

  useEffect(() => {
    let cancelled = false;
    setSigned(null); setFailed(false);
    getSignedUrl(url).then((u) => { if (!cancelled) { if (u) setSigned(u); else setFailed(true); } });
    return () => { cancelled = true; };
  }, [url]);

  const triggerDownload = (href: string, filename: string) => {
    const a = document.createElement('a');
    a.href = href; a.download = filename; a.target = '_blank'; a.rel = 'noopener noreferrer';
    document.body.appendChild(a); a.click(); a.remove();
  };

  const downloadCompressed = async () => {
    if (!signed) return;
    triggerDownload(signed, name || 'anexo');
  };

  const downloadOriginal = async () => {
    if (!originalUrl) return;
    const u = await getSignedUrl(originalUrl);
    if (!u) return;
    triggerDownload(u, `original-${name || 'anexo'}`);
  };

  if (failed) {
    return (
      <div className="flex items-center gap-2 text-xs opacity-80">
        <ImageOff className="w-4 h-4" /> Anexo indisponível
      </div>
    );
  }

  const sizeLine = hasOriginal ? (
    <span>
      {humanSize(originalSize as number)} → <strong>{humanSize(size as number)}</strong>
      {savedPct >= 1 && <> (−{savedPct}%)</>}
    </span>
  ) : (
    <span>{humanSize(size)}</span>
  );

  if (derivedKind === 'image') {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => signed && setLightboxOpen(true)}
          className="block max-w-[260px] rounded-lg overflow-hidden bg-black/5 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label={`Abrir imagem ${name || ''}`.trim()}
          disabled={!signed}
        >
          {signed ? (
            <img src={signed} alt={name || 'anexo'} className="w-full h-auto object-cover cursor-zoom-in" loading="lazy" />
          ) : (
            <div className="w-[260px] h-[160px] flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin opacity-70" />
            </div>
          )}
        </button>
        <div className={`flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[10px] ${mine ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
          {sizeLine}
          <button
            type="button"
            onClick={downloadCompressed}
            disabled={!signed}
            className="inline-flex items-center gap-1 hover:underline disabled:opacity-50"
            aria-label="Baixar imagem otimizada"
          >
            <Download className="w-3 h-3" /> Otimizada
          </button>
          {hasOriginal && (
            <button
              type="button"
              onClick={downloadOriginal}
              className="inline-flex items-center gap-1 hover:underline"
              aria-label="Baixar imagem original sem compressão"
            >
              <Download className="w-3 h-3" /> Original
            </button>
          )}
        </div>
        {lightboxOpen && signed && (
          <ImageLightbox src={signed} name={name} onClose={() => setLightboxOpen(false)} />
        )}
      </div>
    );
  }

  if (derivedKind === 'audio') {
    return (
      <div className="flex flex-col gap-1 min-w-[220px]">
        {signed ? (
          <audio src={signed} controls preload="metadata" className="w-full h-9" />
        ) : (
          <div className="h-9 flex items-center gap-2 text-xs opacity-70">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando áudio...
          </div>
        )}
        <div className={`text-[10px] ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
          Áudio {fmtDuration(durationMs)}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={downloadCompressed}
      disabled={!signed}
      className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition ${
        mine ? 'bg-primary-foreground/10 hover:bg-primary-foreground/20' : 'bg-muted hover:bg-muted/70'
      }`}
      aria-label={`Baixar ${name || 'anexo'}`}
    >
      <FileText className="w-4 h-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-medium truncate">{name || 'Arquivo'}</p>
        <p className={`text-[10px] ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
          {humanSize(size)} {mime ? `· ${mime.split('/')[1]?.toUpperCase() || mime}` : ''}
        </p>
      </div>
      {signed ? <Download className="w-3.5 h-3.5 opacity-70" /> : <Loader2 className="w-3.5 h-3.5 animate-spin" />}
    </button>
  );
}
