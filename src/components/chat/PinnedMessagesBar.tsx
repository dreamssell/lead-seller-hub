import { useState } from 'react';
import { Pin, PinOff, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface PinnedItem {
  pin_id: string;
  message_id: string;
  content: string | null;
  sender_type: string;
  created_at: string;
  pinned_at: string;
}

interface Props {
  items: PinnedItem[];
  onJump: (messageId: string) => void;
  onUnpin: (pinId: string) => void;
}

/**
 * Etapa 8 — Faixa recolhível com as mensagens fixadas da conversa atual.
 * Um clique rola até a mensagem original; o ícone remove o fixação.
 */
export function PinnedMessagesBar({ items, onJump, onUnpin }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (!items.length) return null;

  const first = items[0];
  const preview = (first.content || '[mídia]').slice(0, 90);

  return (
    <div className="border-b border-border bg-primary/5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-primary/10 transition-colors"
        title={expanded ? 'Recolher mensagens fixadas' : 'Ver mensagens fixadas'}
      >
        <Pin className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-[11px] uppercase tracking-wider font-semibold text-primary shrink-0">
          {items.length} fixada{items.length > 1 ? 's' : ''}
        </span>
        {!expanded && (
          <span className="text-xs text-muted-foreground truncate flex-1">
            {preview}
          </span>
        )}
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <ul className="max-h-40 overflow-y-auto divide-y divide-border/60">
          {items.map((it) => (
            <li key={it.pin_id} className="flex items-start gap-2 px-3 py-2 hover:bg-primary/5">
              <button
                type="button"
                onClick={() => onJump(it.message_id)}
                className="flex-1 min-w-0 text-left"
                title="Ir até a mensagem"
              >
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  {it.sender_type === 'client' ? 'Contato' : 'Você'} · fixada{' '}
                  {formatDistanceToNow(new Date(it.pinned_at), { addSuffix: true, locale: ptBR })}
                </div>
                <div className="text-xs text-foreground truncate">
                  {it.content || '[mídia]'}
                </div>
              </button>
              <button
                type="button"
                onClick={() => onUnpin(it.pin_id)}
                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0"
                title="Desafixar mensagem"
              >
                <PinOff className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
