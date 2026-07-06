import { ChevronRight, Crown, Home } from 'lucide-react';

interface Props {
  contextName?: string | null;
  onHomeClick?: () => void;
}

/**
 * Cabeçalho do painel do dono (CEO Home): breadcrumb "Início › Performance
 * da Empresa › <empresa>" + selo "Painel executivo completo".
 *
 * - Totalmente responsivo (empilha em mobile).
 * - Trunca nomes longos com `title` para tooltip.
 * - Fallback confiável para "Minha empresa" quando o contexto vier vazio.
 */
export function CeoBreadcrumb({ contextName, onHomeClick }: Props) {
  const name = (contextName || '').trim() || 'Minha empresa';
  return (
    <div
      data-testid="ceo-breadcrumb"
      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0"
      >
        <button
          type="button"
          onClick={onHomeClick}
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors shrink-0"
        >
          <Home className="w-3.5 h-3.5" /> <span>Início</span>
        </button>
        <ChevronRight className="w-3.5 h-3.5 opacity-60 shrink-0" />
        <span className="text-foreground font-medium shrink-0">Performance da Empresa</span>
        <ChevronRight className="w-3.5 h-3.5 opacity-60 shrink-0" />
        <span
          data-testid="ceo-breadcrumb-context"
          className="truncate min-w-0 max-w-[45vw] sm:max-w-[240px] md:max-w-[360px]"
          title={name}
        >
          {name}
        </span>
      </nav>
      <span className="inline-flex items-center gap-1.5 self-start sm:self-auto shrink-0 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary">
        <Crown className="w-3 h-3" />
        <span className="hidden sm:inline">Painel executivo completo</span>
        <span className="sm:hidden">Painel executivo</span>
      </span>
    </div>
  );
}
