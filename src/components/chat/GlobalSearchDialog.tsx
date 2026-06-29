import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, MessageSquare, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Hit {
  id: string;
  customer_id: string;
  customer_name: string;
  channel: string | null;
  sender_type: string;
  content: string;
  created_at: string;
}

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

export function GlobalSearchDialog({ open, onOpenChange }: Props) {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) { setQ(''); setHits([]); return; }
  }, [open]);

  useEffect(() => {
    if (!q.trim() || q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('search_chat_messages_global', { p_query: q.trim(), p_limit: 30 });
      if (!error) setHits((data as any) || []);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const open$ = (h: Hit) => {
    onOpenChange(false);
    navigate(`/chat?conv=${h.customer_id}&channel=${h.channel || 'whatsapp'}`);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput value={q} onValueChange={setQ} placeholder="Buscar em todas as conversas..." />
      <CommandList>
        {loading && (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Buscando...
          </div>
        )}
        {!loading && q.length >= 2 && hits.length === 0 && (
          <CommandEmpty>Nenhuma mensagem encontrada para “{q}”.</CommandEmpty>
        )}
        {!loading && hits.length > 0 && (
          <CommandGroup heading={`${hits.length} resultado(s)`}>
            {hits.map((h) => (
              <CommandItem key={h.id} value={`${h.id} ${h.customer_name} ${h.content}`} onSelect={() => open$(h)} className="flex flex-col items-start gap-0.5">
                <div className="flex items-center gap-2 w-full">
                  <User className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="text-xs font-semibold truncate flex-1">{h.customer_name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(h.created_at), { addSuffix: true, locale: ptBR })}
                  </span>
                </div>
                <div className="flex items-start gap-2 w-full pl-5">
                  <MessageSquare className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-[11px] text-muted-foreground line-clamp-2 flex-1">{h.content}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {!q && (
          <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">
            Digite para buscar em todas as mensagens.<br />
            Atalho: <kbd className="px-1 py-px bg-secondary border border-border rounded">Ctrl</kbd> + <kbd className="px-1 py-px bg-secondary border border-border rounded">K</kbd>
          </div>
        )}
      </CommandList>
    </CommandDialog>
  );
}
