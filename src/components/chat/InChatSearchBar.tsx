import { useEffect, useRef } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  currentIndex: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

/**
 * Etapa 8 — Barra de busca dentro da conversa ativa.
 * Digite → filtra as mensagens da conversa; setas navegam entre as ocorrências
 * e o item ativo ganha um destaque no balão.
 */
export function InChatSearchBar({
  open,
  query,
  onQueryChange,
  currentIndex,
  total,
  onPrev,
  onNext,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="border-b border-border bg-secondary/60 backdrop-blur px-3 py-2 flex items-center gap-2">
      <Search className="w-4 h-4 text-muted-foreground shrink-0" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onClose(); }
          if (e.key === 'Enter') {
            e.preventDefault();
            e.shiftKey ? onPrev() : onNext();
          }
        }}
        placeholder="Buscar nesta conversa..."
        className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
      />
      <span className="text-[11px] text-muted-foreground tabular-nums min-w-[52px] text-right">
        {total === 0 ? (query ? '0 de 0' : '') : `${currentIndex + 1} de ${total}`}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onPrev}
        disabled={total === 0}
        title="Anterior (Shift+Enter)"
      >
        <ChevronUp className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onNext}
        disabled={total === 0}
        title="Próximo (Enter)"
      >
        <ChevronDown className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onClose}
        title="Fechar busca (Esc)"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
