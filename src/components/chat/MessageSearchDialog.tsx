import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Paperclip, Loader2, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

export interface MessageSearchHit {
  id: string;
  customer_id: string;
  content: string;
  created_at: string;
  sender_type: string;
  metadata: any;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerId: string | null;
  onJump: (hit: MessageSearchHit) => void;
}

/**
 * Diálogo de busca completa no histórico da conversa aberta em /chat/focus.
 * Filtra por texto e por anexos, sem quebrar a paginação/virtualização — os
 * resultados são fetchados do backend sob demanda (debounce de 250ms) e não
 * alteram a lista `msgs` até o usuário clicar em "Ir para".
 */
export function MessageSearchDialog({ open, onOpenChange, customerId, onJump }: Props) {
  const [q, setQ] = useState('');
  const [onlyAttachments, setOnlyAttachments] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<MessageSearchHit[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
    else { setQ(''); setHits([]); setOnlyAttachments(false); }
  }, [open]);

  useEffect(() => {
    if (!open || !customerId) return;
    const my = ++seq.current;
    const term = q.trim();
    if (!term && !onlyAttachments) { setHits([]); setLoading(false); return; }
    setLoading(true);
    const handle = window.setTimeout(async () => {
      let query = supabase
        .from('chat_messages')
        .select('id,customer_id,content,created_at,sender_type,metadata')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (term) query = query.ilike('content', `%${term}%`);
      if (onlyAttachments) query = query.not('metadata->>media_url', 'is', null);
      const { data } = await query;
      if (my !== seq.current) return;
      setHits(((data as MessageSearchHit[]) || []));
      setLoading(false);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [q, onlyAttachments, open, customerId]);

  const highlight = useMemo(() => {
    const term = q.trim();
    if (!term) return (s: string) => s;
    const re = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
    return (s: string) =>
      s.split(re).map((chunk, i) =>
        i % 2 === 1
          ? <mark key={i} className="bg-primary/25 text-foreground rounded px-0.5">{chunk}</mark>
          : chunk,
      );
  }, [q]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-4 h-4" /> Buscar no histórico
          </DialogTitle>
        </DialogHeader>
        <div className="px-5 py-3 border-b border-border space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Digite palavras, telefone ou trecho..."
              className="pl-8 h-10"
            />
            {q && (
              <button
                onClick={() => setQ('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-secondary"
                aria-label="Limpar busca"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={onlyAttachments ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOnlyAttachments((v) => !v)}
              className="h-7"
            >
              <Paperclip className="w-3.5 h-3.5 mr-1" /> Só com anexos
            </Button>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {loading ? 'Buscando…' : `${hits.length} resultado${hits.length === 1 ? '' : 's'}`}
            </span>
          </div>
        </div>
        <div className="max-h-[55vh] overflow-y-auto">
          {loading && hits.length === 0 && (
            <div className="p-6 text-center text-xs text-muted-foreground inline-flex items-center gap-2 w-full justify-center">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Procurando mensagens…
            </div>
          )}
          {!loading && hits.length === 0 && (q.trim() || onlyAttachments) && (
            <div className="p-8 text-center text-xs text-muted-foreground">Nenhuma mensagem encontrada</div>
          )}
          {!loading && !q.trim() && !onlyAttachments && (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Comece a digitar para buscar mensagens desta conversa.
            </div>
          )}
          <ul className="divide-y divide-border/60">
            {hits.map((h) => {
              const isMe = h.sender_type !== 'client';
              const hasMedia = !!(h.metadata?.media_url || h.metadata?.attachment_url);
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => { onJump(h); onOpenChange(false); }}
                    className="w-full text-left px-5 py-3 hover:bg-secondary/60 transition flex items-start gap-3 group"
                  >
                    <Badge variant={isMe ? 'default' : 'secondary'} className="mt-0.5 text-[10px] uppercase tracking-wider">
                      {isMe ? 'Você' : 'Cliente'}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm break-words line-clamp-2">
                        {highlight(h.content || (hasMedia ? '[anexo]' : ''))}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                        <span>{new Date(h.created_at).toLocaleString('pt-BR')}</span>
                        {hasMedia && <span className="inline-flex items-center gap-1"><Paperclip className="w-3 h-3" /> anexo</span>}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition mt-1" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
