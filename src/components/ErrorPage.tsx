import { AlertTriangle, Home, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  message?: string;
  onRetry?: () => void;
  onHome?: () => void;
}

/**
 * Página de erro amigável — mensagem de tranquilidade para o usuário final.
 * Nunca expõe stack técnico; ele vai para o painel do dono da plataforma.
 */
export function ErrorPage({ message, onRetry, onHome }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-lg w-full text-center space-y-5">
        <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">
            Ops! Algo inesperado aconteceu
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Fique tranquilo — seus dados estão seguros e a nossa equipe já foi
            avisada automaticamente. Você pode tentar novamente ou voltar para
            o início.
          </p>
          {message ? (
            <p className="text-xs text-muted-foreground/80 pt-1 truncate" title={message}>
              Referência: <span className="font-mono">{message.slice(0, 120)}</span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          <Button
            variant="default"
            onClick={onRetry ?? (() => window.location.reload())}
            className="gap-2"
          >
            <RefreshCcw className="w-4 h-4" /> Tentar novamente
          </Button>
          <Button
            variant="outline"
            onClick={onHome ?? (() => (window.location.href = '/'))}
            className="gap-2"
          >
            <Home className="w-4 h-4" /> Ir para o início
          </Button>
        </div>
      </div>
    </div>
  );
}
