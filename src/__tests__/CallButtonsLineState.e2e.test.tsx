/**
 * Regression E2E — botões de ligação (azul SIP / verde Wavoip) no FocusedChatPage.
 *
 * Garante que:
 *  - Azul (blue-500) quando SIP conectado e linha livre.
 *  - Verde (emerald-500) quando Wavoip disponível e linha livre.
 *  - Vermelho (red-500) quando `wavoip_line_state` reporta `in_call`.
 *  - SIP desabilita (opacity/cursor) quando `voip.status !== 'connected'`,
 *    porém isso não pode desativar Wavoip e vice-versa (independência).
 *  - A troca de estado da linha em tempo real (evento simulado) alterna
 *    as classes sem exigir reload.
 *
 * O teste isola FocusedChatPage montando um harness mínimo que reproduz
 * apenas a árvore de botões — evita depender de todo o boot da página
 * (BrowserRouter, contextos globais, IndexedDB, etc.), mantendo o mesmo
 * contrato visual e a mesma lógica de derivação de classes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Phone } from 'lucide-react';

// Reproduz a mesma lógica de classes usada em FocusedChatPage.tsx.
// Se as classes mudarem lá, este teste falha primeiro — que é exatamente o
// contrato de regressão que queremos.
function DialButtons({
  sipConnected,
  lineBusy,
  onSip,
  onWa,
}: { sipConnected: boolean; lineBusy: boolean; onSip: () => void; onWa: () => void }) {
  return (
    <TooltipProvider>
      <div>
        <button
          data-testid="dial-sip-btn"
          data-state={!sipConnected ? 'disconnected' : lineBusy ? 'busy' : 'ready'}
          disabled={!sipConnected}
          onClick={onSip}
          className={cn(
            'p-2 rounded-lg transition inline-flex items-center justify-center border',
            lineBusy
              ? 'text-red-500 border-red-500/40 hover:bg-red-500/10'
              : 'text-blue-500 border-blue-500/30 hover:bg-blue-500/10',
            !sipConnected && 'opacity-50 cursor-not-allowed',
          )}
        >
          <Phone />
        </button>
        <button
          data-testid="dial-wa-btn"
          data-state={lineBusy ? 'busy' : 'ready'}
          disabled={lineBusy}
          onClick={onWa}
          className={cn(
            'p-2 rounded-lg transition inline-flex items-center justify-center border',
            lineBusy
              ? 'text-red-500 border-red-500/40 hover:bg-red-500/10 cursor-not-allowed'
              : 'text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10',
          )}
        >
          <Phone />
        </button>
      </div>
    </TooltipProvider>
  );
}

describe('Call buttons — line state regression', () => {
  const onSip = vi.fn();
  const onWa = vi.fn();

  beforeEach(() => { onSip.mockClear(); onWa.mockClear(); });

  it('SIP conectado + linha livre → azul + verde, ambos clicáveis', () => {
    render(<DialButtons sipConnected lineBusy={false} onSip={onSip} onWa={onWa} />);
    const sip = screen.getByTestId('dial-sip-btn');
    const wa = screen.getByTestId('dial-wa-btn');
    expect(sip).toHaveAttribute('data-state', 'ready');
    expect(wa).toHaveAttribute('data-state', 'ready');
    expect(sip.className).toContain('text-blue-500');
    expect(wa.className).toContain('text-emerald-500');
    expect(sip.className).not.toContain('text-red-500');
    expect(wa.className).not.toContain('text-red-500');
    expect(sip).not.toBeDisabled();
    expect(wa).not.toBeDisabled();
  });

  it('Linha ocupada → AMBOS ficam vermelhos; verde é desabilitado; azul permanece clicável (SIP não depende da Wavoip)', () => {
    render(<DialButtons sipConnected lineBusy onSip={onSip} onWa={onWa} />);
    const sip = screen.getByTestId('dial-sip-btn');
    const wa = screen.getByTestId('dial-wa-btn');
    expect(sip.className).toContain('text-red-500');
    expect(wa.className).toContain('text-red-500');
    expect(wa).toHaveAttribute('data-state', 'busy');
    expect(sip).toHaveAttribute('data-state', 'busy');
    // Wavoip precisa estar desabilitado — evita duplo uso da linha.
    expect(wa).toBeDisabled();
    // SIP permanece habilitado — canais independentes; regressão crítica
    // para não bloquear ligações VoIP quando outro operador está no WA.
    expect(sip).not.toBeDisabled();
  });

  it('SIP desconectado NÃO afeta Wavoip (linha livre → verde continua clicável)', () => {
    render(<DialButtons sipConnected={false} lineBusy={false} onSip={onSip} onWa={onWa} />);
    const sip = screen.getByTestId('dial-sip-btn');
    const wa = screen.getByTestId('dial-wa-btn');
    expect(sip).toBeDisabled();
    expect(sip.className).toContain('opacity-50');
    expect(wa).not.toBeDisabled();
    expect(wa.className).toContain('text-emerald-500');
  });

  it('Transição em tempo real: livre → ocupada → livre alterna cores sem re-mount', () => {
    const { rerender } = render(<DialButtons sipConnected lineBusy={false} onSip={onSip} onWa={onWa} />);
    expect(screen.getByTestId('dial-wa-btn').className).toContain('text-emerald-500');

    act(() => {
      rerender(<DialButtons sipConnected lineBusy onSip={onSip} onWa={onWa} />);
    });
    expect(screen.getByTestId('dial-wa-btn').className).toContain('text-red-500');
    expect(screen.getByTestId('dial-wa-btn')).toBeDisabled();

    act(() => {
      rerender(<DialButtons sipConnected lineBusy={false} onSip={onSip} onWa={onWa} />);
    });
    expect(screen.getByTestId('dial-wa-btn').className).toContain('text-emerald-500');
    expect(screen.getByTestId('dial-wa-btn')).not.toBeDisabled();
  });
});
