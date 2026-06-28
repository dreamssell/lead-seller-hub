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
          <div className="grid grid-cols-3 gap-1.5">
            {filtered.map(r => (
              <button
                key={r.id}
                onClick={() => setOpen(r)}
                className="relative aspect-square rounded-md overflow-hidden bg-secondary border border-border group hover:ring-2 hover:ring-primary/40"
                title={r.name || r.caption || ''}
              >
                {r.kind === 'image' ? (
                  <img src={r.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : r.kind === 'video' ? (
                  <div className="w-full h-full flex items-center justify-center bg-black/60 text-white"><Film className="w-5 h-5" /></div>
                ) : r.kind === 'audio' ? (
                  <div className="w-full h-full flex items-center justify-center bg-amber-500/15 text-amber-700 dark:text-amber-300"><Music className="w-5 h-5" /></div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-blue-500/15 text-blue-600 dark:text-blue-300"><FileText className="w-5 h-5" /></div>
                )}
              </button>
            ))}
          </div>
        </ScrollArea>
      )}
      <MediaViewerDialog item={open} onClose={() => setOpen(null)} />
    </div>
  );
}
