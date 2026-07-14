import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Star, StarOff, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

interface Row {
  id: string;
  message_id: string;
  customer_id: string;
  created_at: string;
  chat_messages: {
    content: string | null;
    sender_type: string;
    created_at: string;
  } | null;
  customers: { name: string | null } | null;
}

interface Props {
  customerId: string;
  /** When set, restrict the list to a single conversation; omit to show all. */
  scope?: 'conversation' | 'all';
}

/**
 * Etapa 8 — Painel de mensagens favoritas (estrela) do próprio atendente.
 * Aparece como aba no ChatRightPanel.
 */
export function StarredMessagesPanel({ customerId, scope = 'conversation' }: Props) {
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from('chat_starred_messages')
      .select('id, message_id, customer_id, created_at, chat_messages(content, sender_type, created_at), customers(name)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (scope === 'conversation') q = q.eq('customer_id', customerId);
    const { data, error } = await q;
    if (error) {
      toast.error('Não foi possível carregar os favoritos');
    } else {
      setItems((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`starred-panel-${customerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_starred_messages' },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, scope]);

  const unstar = async (id: string) => {
    await supabase.from('chat_starred_messages').delete().eq('id', id);
    setItems((prev) => prev.filter((r) => r.id !== id));
  };

  const jumpTo = (messageId: string) => {
    const el = document.querySelector(`[data-msg-id="${messageId}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-yellow-400/70');
      setTimeout(() => el.classList.remove('ring-2', 'ring-yellow-400/70'), 1400);
    } else {
      toast.info('Mensagem fora do trecho carregado — role o histórico primeiro.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!items.length) {
    return (
      <p className="text-xs text-muted-foreground text-center py-6 italic px-2">
        Nenhuma mensagem favoritada ainda. Passe o mouse sobre uma mensagem no chat e clique na estrela para salvá-la aqui.
      </p>
    );
  }

  return (
    <ScrollArea className="flex-1 -mx-3 px-3">
      <div className="space-y-2">
        {items.map((r) => {
          const msg = r.chat_messages;
          const who = msg?.sender_type === 'client' ? (r.customers?.name || 'Contato') : 'Você';
          return (
            <div key={r.id} className="rounded-lg border border-border bg-secondary/40 p-2.5 group">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0 flex items-center gap-1.5">
                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-500 shrink-0" />
                  <p className="text-[10px] font-semibold text-foreground truncate">{who}</p>
                </div>
                <button
                  onClick={() => unstar(r.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
                  title="Remover dos favoritos"
                >
                  <StarOff className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-foreground whitespace-pre-wrap line-clamp-4 mb-1.5">
                {msg?.content || '[mídia]'}
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] text-muted-foreground">
                  {formatDistanceToNow(new Date(msg?.created_at || r.created_at), { addSuffix: true, locale: ptBR })}
                </span>
                <button
                  onClick={() => jumpTo(r.message_id)}
                  className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                  title="Ir para a mensagem"
                >
                  <MessageSquare className="w-2.5 h-2.5" /> Ir para a mensagem
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
