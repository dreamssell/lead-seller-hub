import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Image as ImageIcon, FileText, Film, Music, Images } from 'lucide-react';
import { MediaViewerDialog, MediaItem } from './MediaViewerDialog';
import { cn } from '@/lib/utils';

interface Props { customerId: string }

type Filter = 'all' | 'image' | 'video' | 'audio' | 'document';

interface MediaRow extends MediaItem {
  id: string;
  kind: Filter;
  created_at: string;
}

function classify(mime = '', url = ''): Filter {
  if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(url)) return 'image';
  if (mime.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(url)) return 'video';
  if (mime.startsWith('audio/') || /\.(mp3|ogg|wav|m4a|webm)$/i.test(url)) return 'audio';
  return 'document';
}

export function MediaGallery({ customerId }: Props) {
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<MediaItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('chat_messages')
        .select('id, content, metadata, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(300);
      const arr: MediaRow[] = [];
      (data || []).forEach((m: any) => {
        const meta = (m.metadata || {}) as any;
        const url = meta.media_url || meta.url || meta.attachment_url;
        if (!url) return;
        const mime = meta.mime || meta.mimetype || '';
        const name = meta.file_name || meta.name || '';
        arr.push({
          id: m.id, url, mime, name, caption: meta.caption || m.content,
          kind: classify(mime, url), created_at: m.created_at,
        });
      });
      if (!cancelled) { setRows(arr); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [customerId]);

  const filtered = useMemo(() => filter === 'all' ? rows : rows.filter(r => r.kind === filter), [rows, filter]);

  const counts = useMemo(() => ({
    all: rows.length,
    image: rows.filter(r => r.kind === 'image').length,
    video: rows.filter(r => r.kind === 'video').length,
    audio: rows.filter(r => r.kind === 'audio').length,
    document: rows.filter(r => r.kind === 'document').length,
  }), [rows]);

  const chip = (k: Filter, Icon: any, label: string) => (
    <button
      onClick={() => setFilter(k)}
      className={cn('px-2 py-1 rounded-full text-[10px] flex items-center gap-1 border transition',
        filter === k ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary/50 border-border hover:bg-secondary')}
    >
      <Icon className="w-3 h-3" /> {label} <span className="opacity-60">{counts[k]}</span>
    </button>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex flex-wrap gap-1.5 pb-3">
        {chip('all', Images, 'Tudo')}
        {chip('image', ImageIcon, 'Imagens')}
        {chip('video', Film, 'Vídeos')}
        {chip('audio', Music, 'Áudios')}
        {chip('document', FileText, 'Docs')}
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8 italic">Nenhuma mídia para este filtro.</p>
      ) : (
        <ScrollArea className="flex-1 -mx-3 px-3">
          {filter === 'audio' || filter === 'document' ? (
            <ul className="space-y-1.5">
              {filtered.map(r => (
                <li key={r.id}>
                  <button
                    onClick={() => setOpen(r)}
                    className="w-full flex items-center gap-2.5 rounded-lg border border-border bg-card/60 hover:bg-secondary px-2.5 py-2 text-left transition"
                    title={r.name || r.caption || ''}
                  >
                    <div className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                      r.kind === 'audio'
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        : 'bg-blue-500/15 text-blue-600 dark:text-blue-300',
                    )}>
                      {r.kind === 'audio' ? <Music className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">
                        {r.name || r.caption || (r.kind === 'audio' ? 'Áudio' : 'Documento')}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {filtered.map(r => (
                <button
                  key={r.id}
                  onClick={() => setOpen(r)}
                  className="relative aspect-square rounded-md overflow-hidden bg-secondary border border-border group hover:ring-2 hover:ring-primary/40"
                  title={r.name || r.caption || ''}
                >
                  {r.kind === 'image' ? (
                    <img src={r.url} alt="" className="w-full h-full object-cover transition group-hover:scale-105" loading="lazy" />
                  ) : r.kind === 'video' ? (
                    <>
                      <video src={r.url} preload="metadata" muted playsInline className="w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition">
                        <div className="w-8 h-8 rounded-full bg-white/90 text-black flex items-center justify-center shadow-md">
                          <Film className="w-4 h-4" />
                        </div>
                      </div>
                    </>
                  ) : r.kind === 'audio' ? (
                    <div className="w-full h-full flex items-center justify-center bg-amber-500/15 text-amber-700 dark:text-amber-300"><Music className="w-5 h-5" /></div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-blue-500/15 text-blue-600 dark:text-blue-300 gap-1 px-1">
                      <FileText className="w-5 h-5" />
                      <span className="text-[9px] truncate max-w-full">{r.name || 'doc'}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      )}
      <MediaViewerDialog item={open} onClose={() => setOpen(null)} />
    </div>
  );
}
