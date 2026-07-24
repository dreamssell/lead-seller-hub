import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useVoip } from '@/contexts/VoipContext';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<string, string> = {
  connected: 'Conectado',
  connecting: 'Conectando…',
  disconnected: 'Desconectado',
  error: 'Falhou',
};

const STATUS_DETAIL: Record<string, string> = {
  connected: 'Ramal SIP registrado e pronto para discar.',
  connecting: 'Estabelecendo registro no servidor SIP…',
  disconnected: 'Ramal SIP não está registrado no momento.',
  error: 'Não foi possível conectar ao servidor SIP.',
};

/**
 * Indicador visual (pulsante) do estado atual da conexão VoIP/SIP.
 * Reflete `voip.status` em tempo real e detalha `voip.lastError` na tooltip.
 * Renderiza ao lado do botão azul de discagem no Chat Completo/Modo Foco.
 */
export function SipStatusDot({ className }: { className?: string }) {
  const { status, lastError, lastCheckedAt, hasConfig } = useVoip();
  const label = STATUS_LABEL[status] ?? status;
  const detail = STATUS_DETAIL[status] ?? '';
  const color =
    status === 'connected' ? 'bg-emerald-500'
    : status === 'connecting' ? 'bg-amber-500 animate-pulse'
    : status === 'error' ? 'bg-red-500'
    : 'bg-muted-foreground/50';

  const when = lastCheckedAt ? new Date(lastCheckedAt).toLocaleTimeString('pt-BR') : '—';

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="status"
            aria-live="polite"
            aria-label={`Status VoIP SIP: ${label}`}
            data-testid="sip-status-dot"
            data-status={status}
            className={cn('inline-flex items-center justify-center h-3 w-3 shrink-0', className)}
          >
            <span className={cn('h-2.5 w-2.5 rounded-full ring-2 ring-background', color)} />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px] text-xs" role="tooltip">
          <div className="font-medium">VoIP (SIP) · {label}</div>
          <div className="text-muted-foreground mt-0.5">{detail}</div>
          {!hasConfig && (
            <div className="mt-1 text-amber-600 dark:text-amber-400">
              Nenhum ramal cadastrado. Configure em Ferramentas → SIP.
            </div>
          )}
          {lastError && status !== 'connected' && (
            <div className="mt-1 text-red-500 break-words">Motivo: {lastError}</div>
          )}
          <div className="mt-1 text-[10px] text-muted-foreground">Última verificação: {when}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default SipStatusDot;
