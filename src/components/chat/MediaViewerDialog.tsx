import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  ExternalLink,
  X,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';

export interface MediaItem {
  url: string;
  mime?: string;
  name?: string;
  caption?: string;
  /** When true, no download/open-in-tab buttons are rendered. */
  protected?: boolean;
}

interface Props {
  /** Single-item mode. */
  item?: MediaItem | null;
  /** Gallery mode: list + current index. When provided, `item` is ignored. */
  items?: MediaItem[];
  index?: number;
  onIndexChange?: (idx: number) => void;
  onClose: () => void;
}

function kindOf(mime = '', url = '') {
  if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(url)) return 'image';
  if (mime.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(url)) return 'video';
  if (mime.startsWith('audio/') || /\.(mp3|ogg|wav|m4a|webm)$/i.test(url)) return 'audio';
  if (mime === 'application/pdf' || /\.pdf($|\?)/i.test(url)) return 'pdf';
  return 'document';
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

export function MediaViewerDialog({ item, items, index, onIndexChange, onClose }: Props) {
  const galleryMode = Array.isArray(items) && items.length > 0;
  const [internalIdx, setInternalIdx] = useState(index ?? 0);
  useEffect(() => { if (typeof index === 'number') setInternalIdx(index); }, [index]);

  const active = useMemo<MediaItem | null>(() => {
    if (galleryMode) return items![Math.max(0, Math.min(internalIdx, items!.length - 1))] || null;
    return item ?? null;
  }, [galleryMode, items, internalIdx, item]);

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const resetZoom = useCallback(() => { setZoom(1); setOffset({ x: 0, y: 0 }); }, []);
  useEffect(() => { resetZoom(); }, [active?.url, resetZoom]);

  const go = useCallback((delta: number) => {
    if (!galleryMode) return;
    const next = Math.max(0, Math.min(items!.length - 1, internalIdx + delta));
    if (next === internalIdx) return;
    setInternalIdx(next);
    onIndexChange?.(next);
  }, [galleryMode, items, internalIdx, onIndexChange]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === '+' || e.key === '=') setZoom(z => Math.min(MAX_ZOOM, +(z + 0.25).toFixed(2)));
      else if (e.key === '-' || e.key === '_') setZoom(z => Math.max(MIN_ZOOM, +(z - 0.25).toFixed(2)));
      else if (e.key === '0') resetZoom();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, go, resetZoom]);

  if (!active) return null;
  const kind = kindOf(active.mime, active.url);
  const locked = !!active.protected;
  const canPrev = galleryMode && internalIdx > 0;
  const canNext = galleryMode && internalIdx < (items!.length - 1);
  const pdfSrc = `${active.url}${active.url.includes('#') ? '&' : '#'}toolbar=0&navpanes=0`;

  const onWheel = (e: React.WheelEvent) => {
    if (kind !== 'image') return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoom(z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, +(z + delta).toFixed(2))));
  };
  const onMouseDown = (e: React.MouseEvent) => {
    if (kind !== 'image' || zoom <= 1) return;
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    setOffset({ x: dragRef.current.ox + (e.clientX - dragRef.current.x), y: dragRef.current.oy + (e.clientY - dragRef.current.y) });
  };
  const endDrag = () => { dragRef.current = null; };

  return (
    <Dialog open={!!active} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl p-0 overflow-hidden bg-background/95 backdrop-blur-md">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <div className="min-w-0 flex items-center gap-2">
            {locked && <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-label="Conteúdo protegido" />}
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{active.name || 'Visualizar mídia'}</p>
              {active.caption && <p className="text-[11px] text-muted-foreground truncate">{active.caption}</p>}
            </div>
            {galleryMode && (
              <span className="ml-2 text-[11px] text-muted-foreground shrink-0">
                {internalIdx + 1} / {items!.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {kind === 'image' && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Diminuir zoom (-)"
                  onClick={() => setZoom(z => Math.max(MIN_ZOOM, +(z - 0.25).toFixed(2)))}>
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <span className="text-[11px] tabular-nums w-10 text-center text-muted-foreground">{Math.round(zoom * 100)}%</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Ampliar (+)"
                  onClick={() => setZoom(z => Math.min(MAX_ZOOM, +(z + 0.25).toFixed(2)))}>
                  <ZoomIn className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Redefinir (0)" onClick={resetZoom}>
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </>
            )}
            {!locked && (
              <Button asChild variant="ghost" size="icon" className="h-8 w-8" title="Abrir em nova aba">
                <a href={active.url} target="_blank" rel="noreferrer noopener"><ExternalLink className="w-4 h-4" /></a>
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Fechar">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div
          className="relative bg-black/80 flex items-center justify-center min-h-[60vh] max-h-[85vh] overflow-hidden select-none"
          onContextMenu={(e) => { if (locked) e.preventDefault(); }}
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
        >
          {galleryMode && (
            <>
              <button
                onClick={() => go(-1)}
                disabled={!canPrev}
                aria-label="Anterior"
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed text-white flex items-center justify-center"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => go(1)}
                disabled={!canNext}
                aria-label="Próxima"
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed text-white flex items-center justify-center"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {kind === 'image' && (
            <img
              src={active.url}
              alt={active.name || ''}
              draggable={false}
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                cursor: zoom > 1 ? (dragRef.current ? 'grabbing' : 'grab') : 'zoom-in',
                transition: dragRef.current ? 'none' : 'transform 0.15s ease',
              }}
              onClick={() => { if (zoom === 1) setZoom(2); }}
              className="max-h-[85vh] max-w-full object-contain select-none"
            />
          )}
          {kind === 'video' && (
            <video
              src={active.url}
              controls
              controlsList={locked ? 'nodownload noremoteplayback' : undefined}
              disablePictureInPicture={locked}
              className="max-h-[85vh] max-w-full"
            />
          )}
          {kind === 'audio' && (
            <div className="p-8 w-full max-w-md">
              <audio
                src={active.url}
                controls
                controlsList={locked ? 'nodownload noremoteplayback' : undefined}
                className="w-full"
              />
            </div>
          )}
          {kind === 'pdf' && (
            <iframe src={pdfSrc} title={active.name || 'PDF'} className="w-full h-[85vh] bg-white" />
          )}
          {kind === 'document' && (
            <div className="p-8 text-center text-white">
              <p className="text-sm mb-3">Pré-visualização não suportada para este formato.</p>
              {!locked && (
                <Button asChild variant="secondary">
                  <a href={active.url} target="_blank" rel="noreferrer noopener">Abrir documento</a>
                </Button>
              )}
            </div>
          )}
        </div>
        {locked && (
          <div className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
            Conteúdo restrito ao atendimento — download e compartilhamento bloqueados por política.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
