import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, ExternalLink, X } from 'lucide-react';

export interface MediaItem {
  url: string;
  mime?: string;
  name?: string;
  caption?: string;
}

interface Props {
  item: MediaItem | null;
  onClose: () => void;
}

function kindOf(mime = '', url = '') {
  if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(url)) return 'image';
  if (mime.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(url)) return 'video';
  if (mime.startsWith('audio/') || /\.(mp3|ogg|wav|m4a|webm)$/i.test(url)) return 'audio';
  if (mime === 'application/pdf' || /\.pdf($|\?)/i.test(url)) return 'pdf';
  return 'document';
}

export function MediaViewerDialog({ item, onClose }: Props) {
  if (!item) return null;
  const kind = kindOf(item.mime, item.url);

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden bg-background/95 backdrop-blur-md">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{item.name || 'Visualizar mídia'}</p>
            {item.caption && <p className="text-[11px] text-muted-foreground truncate">{item.caption}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button asChild variant="ghost" size="icon" className="h-8 w-8" title="Abrir em nova aba">
              <a href={item.url} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4" /></a>
            </Button>
            <Button asChild variant="ghost" size="icon" className="h-8 w-8" title="Baixar">
              <a href={item.url} download={item.name || ''}><Download className="w-4 h-4" /></a>
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="bg-black/80 flex items-center justify-center min-h-[60vh] max-h-[80vh] overflow-auto">
          {kind === 'image' && <img src={item.url} alt={item.name || ''} className="max-h-[80vh] object-contain" />}
          {kind === 'video' && <video src={item.url} controls className="max-h-[80vh]" />}
          {kind === 'audio' && (
            <div className="p-8 w-full max-w-md">
              <audio src={item.url} controls className="w-full" />
            </div>
          )}
          {kind === 'pdf' && (
            <iframe src={item.url} title={item.name || 'PDF'} className="w-full h-[80vh] bg-white" />
          )}
          {kind === 'document' && (
            <div className="p-8 text-center text-white">
              <p className="text-sm mb-3">Pré-visualização não suportada para este formato.</p>
              <Button asChild variant="secondary"><a href={item.url} target="_blank" rel="noreferrer">Abrir documento</a></Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
