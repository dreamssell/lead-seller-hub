import { useState } from 'react';
import { Play, Pause, FileText, Download, Image as ImageIcon, Film, Music, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  url: string;
  type: 'image' | 'video' | 'audio' | 'document' | string | null;
  mime?: string | null;
  filename?: string | null;
  duration?: number | null;
  mine?: boolean;
}

function formatDuration(seconds?: number | null) {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function extOf(name?: string | null, mime?: string | null): string {
  if (name && name.includes('.')) return name.split('.').pop()!.toLowerCase();
  if (mime) {
    const m = mime.split('/')[1];
    if (m) return m.split(';')[0].toLowerCase();
  }
  return 'arq';
}

function docKindColor(ext: string): string {
  if (['pdf'].includes(ext)) return 'bg-red-500/15 text-red-600 dark:text-red-300';
  if (['doc', 'docx'].includes(ext)) return 'bg-blue-500/15 text-blue-600 dark:text-blue-300';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300';
  if (['ppt', 'pptx'].includes(ext)) return 'bg-orange-500/15 text-orange-600 dark:text-orange-300';
  if (['zip', 'rar', '7z'].includes(ext)) return 'bg-purple-500/15 text-purple-600 dark:text-purple-300';
  return 'bg-muted text-muted-foreground';
}

export function MediaMessageContent({ url, type, mime, filename, duration, mine }: Props) {
  const [imgError, setImgError] = useState(false);

  if (type === 'image') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block relative group my-1 rounded-xl overflow-hidden bg-black/5 dark:bg-white/5 max-w-[280px]"
      >
        {!imgError ? (
          <img
            src={url}
            alt={filename || 'imagem'}
            className="w-full max-h-72 object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-[240px] h-40 flex flex-col items-center justify-center text-muted-foreground gap-1">
            <ImageIcon className="w-6 h-6" />
            <span className="text-[10px]">Imagem indisponível</span>
          </div>
        )}
        <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition rounded-md bg-black/60 text-white p-1">
          <ExternalLink className="w-3 h-3" />
        </div>
      </a>
    );
  }

  if (type === 'video') {
    return (
      <div className="relative my-1 rounded-xl overflow-hidden bg-black max-w-[320px]">
        <video
          controls
          preload="metadata"
          src={url}
          className="w-full max-h-72 rounded-xl"
          playsInline
        />
        {duration && (
          <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-mono pointer-events-none">
            <Film className="w-2.5 h-2.5 inline mr-1" />
            {formatDuration(duration)}
          </span>
        )}
      </div>
    );
  }

  if (type === 'audio') {
    return (
      <div
        className={cn(
          'my-1 flex items-center gap-2 rounded-2xl px-2 py-1.5 max-w-[320px]',
          mine ? 'bg-primary-foreground/10' : 'bg-background/60 border border-border/60'
        )}
      >
        <div
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
            mine ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/15 text-primary'
          )}
        >
          <Music className="w-4 h-4" />
        </div>
        <audio controls preload="metadata" src={url} className="w-full h-8 max-w-[240px]" />
      </div>
    );
  }

  // document / fallback
  const ext = extOf(filename, mime);
  const badge = docKindColor(ext);
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      download={filename || undefined}
      className={cn(
        'my-1 flex items-center gap-3 rounded-xl px-3 py-2.5 max-w-[320px] transition',
        mine
          ? 'bg-primary-foreground/10 hover:bg-primary-foreground/20'
          : 'bg-background/60 border border-border/60 hover:bg-background/80'
      )}
    >
      <div className={cn('w-10 h-10 rounded-lg flex flex-col items-center justify-center shrink-0 relative', badge)}>
        <FileText className="w-5 h-5" />
        <span className="absolute bottom-0.5 text-[8px] font-bold uppercase tracking-tight">
          {ext.slice(0, 4)}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{filename || 'Documento'}</p>
        <p className="text-[10px] opacity-60 uppercase tracking-wide">{ext} · abrir</p>
      </div>
      <Download className="w-4 h-4 opacity-60 shrink-0" />
    </a>
  );
}
