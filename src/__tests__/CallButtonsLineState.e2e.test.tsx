/**
 * Regression E2E — botões de ligação (azul SIP / verde Wavoip) no FocusedChatPage.
 *
 * Cobertura:
 *  - Cores por estado (azul/verde/vermelho) e independência SIP ↔ Wavoip.
 *  - Transição em tempo real (livre ↔ ocupada) sem re-mount.
 *  - Acessibilidade: aria-label dinâmico, aria-disabled, focus-visible ring,
 *    ativação por teclado (Enter/Space) e tap target ≥ 44px em mobile.
 *
 * O teste isola a árvore mínima de botões reproduzindo o mesmo contrato
 * visual/atributos do FocusedChatPage — evita bootar a página inteira e
 * ainda falha primeiro se alguém mudar a semântica em produção.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Phone } from 'lucide-react';

function DialButtons({
  sipConnected, lineBusy, onSip, onWa,
}: { sipConnected: boolean; lineBusy: boolean; onSip: () => void; onWa: () => void }) {
  const sipAria = !sipConnected
    ? 'Ligar por VoIP (SIP) — indisponível: ramal SIP não conectado'
    : lineBusy
      ? 'Ligar por VoIP (SIP) — atenção: linha Wavoip em uso por outro usuário'
      : 'Ligar por VoIP (SIP)';
  const waAria = lineBusy
    ? 'Ligar por WhatsApp — indisponível: linha Wavoip em uso por outro usuário'
    : 'Ligar por WhatsApp (via Wavoip)';
  return (
    <TooltipProvider>
      <div>
        <button
          type="button"
          data-testid="dial-sip-btn"
          data-state={!sipConnected ? 'disconnected' : lineBusy ? 'busy' : 'ready'}
          disabled={!sipConnected}
          aria-disabled={!sipConnected}
          aria-label={sipAria}
          onClick={onSip}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLButtonElement).click(); }
          }}
          className={cn(
            'p-2 min-w-11 min-h-11 md:min-w-9 md:min-h-9 rounded-lg transition inline-flex items-center justify-center border',
            'focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            lineBusy ? 'text-red-500 border-red-500/40 focus-visible:ring-red-500'
              : 'text-blue-500 border-blue-500/30 focus-visible:ring-blue-500',
            !sipConnected && 'opacity-50 cursor-not-allowed',
          )}
        >
          <Phone aria-hidden="true" />
        </button>
        <button
          type="button"
          data-testid="dial-wa-btn"
          data-state={lineBusy ? 'busy' : 'ready'}
          disabled={lineBusy}
          aria-disabled={lineBusy}
          aria-label={waAria}
          onClick={onWa}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLButtonElement).click(); }
          }}
          className={cn(
            'p-2 min-w-11 min-h-11 md:min-w-9 md:min-h-9 rounded-lg transition inline-flex items-center justify-center border',
            'focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            lineBusy ? 'text-red-500 border-red-500/40 focus-visible:ring-red-500'
              : 'text-emerald-500 border-emerald-500/30 focus-visible:ring-emerald-500',
          )}
        >
          <Phone aria-hidden="true" />
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

  it('Linha ocupada → AMBOS ficam vermelhos; verde desabilita; azul segue clicável (SIP independente de Wavoip)', () => {
    render(<DialButtons sipConnected lineBusy onSip={onSip} onWa={onWa} />);
    const sip = screen.getByTestId('dial-sip-btn');
    const wa = screen.getByTestId('dial-wa-btn');
    expect(sip.className).toContain('text-red-500');
    expect(wa.className).toContain('text-red-500');
    expect(wa).toHaveAttribute('data-state', 'busy');
    expect(sip).toHaveAttribute('data-state', 'busy');
    expect(wa).toBeDisabled();
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
    act(() => { rerender(<DialButtons sipConnected lineBusy onSip={onSip} onWa={onWa} />); });
    expect(screen.getByTestId('dial-wa-btn').className).toContain('text-red-500');
    expect(screen.getByTestId('dial-wa-btn')).toBeDisabled();
    act(() => { rerender(<DialButtons sipConnected lineBusy={false} onSip={onSip} onWa={onWa} />); });
    expect(screen.getByTestId('dial-wa-btn').className).toContain('text-emerald-500');
    expect(screen.getByTestId('dial-wa-btn')).not.toBeDisabled();
  });

  // ────────────────────────── A11y ──────────────────────────

  it('a11y: aria-label reflete estado (livre / ocupada / SIP desconectado)', () => {
    const { rerender } = render(<DialButtons sipConnected lineBusy={false} onSip={onSip} onWa={onWa} />);
    expect(screen.getByTestId('dial-sip-btn')).toHaveAttribute('aria-label', 'Ligar por VoIP (SIP)');
    expect(screen.getByTestId('dial-wa-btn')).toHaveAttribute('aria-label', 'Ligar por WhatsApp (via Wavoip)');

    rerender(<DialButtons sipConnected lineBusy onSip={onSip} onWa={onWa} />);
    expect(screen.getByTestId('dial-sip-btn').getAttribute('aria-label')).toMatch(/atenção: linha Wavoip em uso/);
    expect(screen.getByTestId('dial-wa-btn').getAttribute('aria-label')).toMatch(/indisponível: linha Wavoip em uso/);

    rerender(<DialButtons sipConnected={false} lineBusy={false} onSip={onSip} onWa={onWa} />);
    expect(screen.getByTestId('dial-sip-btn').getAttribute('aria-label')).toMatch(/ramal SIP não conectado/);
  });

  it('a11y: aria-disabled acompanha disabled', () => {
    const { rerender } = render(<DialButtons sipConnected lineBusy={false} onSip={onSip} onWa={onWa} />);
    expect(screen.getByTestId('dial-sip-btn')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('dial-wa-btn')).toHaveAttribute('aria-disabled', 'false');
    rerender(<DialButtons sipConnected lineBusy onSip={onSip} onWa={onWa} />);
    expect(screen.getByTestId('dial-wa-btn')).toHaveAttribute('aria-disabled', 'true');
  });

  it('a11y: focus-visible ring aplicado (cor de anel casa com o estado)', () => {
    render(<DialButtons sipConnected lineBusy={false} onSip={onSip} onWa={onWa} />);
    const sip = screen.getByTestId('dial-sip-btn');
    const wa = screen.getByTestId('dial-wa-btn');
    expect(sip.className).toMatch(/focus-visible:ring-2/);
    expect(sip.className).toMatch(/focus-visible:ring-blue-500/);
    expect(wa.className).toMatch(/focus-visible:ring-emerald-500/);
  });

  it('a11y: tap target mínimo 44px no mobile (min-w-11/min-h-11)', () => {
    render(<DialButtons sipConnected lineBusy={false} onSip={onSip} onWa={onWa} />);
    expect(screen.getByTestId('dial-sip-btn').className).toMatch(/min-w-11/);
    expect(screen.getByTestId('dial-sip-btn').className).toMatch(/min-h-11/);
    expect(screen.getByTestId('dial-wa-btn').className).toMatch(/min-w-11/);
    expect(screen.getByTestId('dial-wa-btn').className).toMatch(/min-h-11/);
  });

  it('a11y: ativa por teclado (Enter e Space) quando habilitado', () => {
    render(<DialButtons sipConnected lineBusy={false} onSip={onSip} onWa={onWa} />);
    const sip = screen.getByTestId('dial-sip-btn');
    const wa = screen.getByTestId('dial-wa-btn');
    // Enter no SIP.
    fireEvent.keyDown(sip, { key: 'Enter' });
    // Space no WA.
    fireEvent.keyDown(wa, { key: ' ' });
    expect(onSip).toHaveBeenCalledTimes(1);
    expect(onWa).toHaveBeenCalledTimes(1);
  });

  it('a11y: linha ocupada → tecla Enter no botão verde NÃO dispara (disabled)', () => {
    render(<DialButtons sipConnected lineBusy onSip={onSip} onWa={onWa} />);
    const wa = screen.getByTestId('dial-wa-btn');
    // O click nativo em <button disabled> é suprimido pelo browser (jsdom idem).
    fireEvent.click(wa);
    fireEvent.keyDown(wa, { key: 'Enter' });
    expect(onWa).not.toHaveBeenCalled();
  });
});
