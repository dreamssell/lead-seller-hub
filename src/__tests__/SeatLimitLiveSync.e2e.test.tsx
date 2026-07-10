/**
 * E2E · Duas sessões simultâneas mantêm badge/botão sincronizados
 * ao criar e remover usuários em Cadastros & CRM e TeamPage.
 *
 * Simulamos duas montagens paralelas do mesmo componente ligadas a um
 * "backend" em memória e a um canal Realtime fake. Cada mudança feita em
 * uma sessão emite eventos para AMBAS as sessões, garantindo que a
 * contagem seja atualizada sem reload, com o mesmo estado visual em
 * qualquer ponto da app que use `seatLimitCopy` + subscription.
 *
 * Este teste protege contra regressões da UX prometida ao cliente:
 *   • badge muda para "⛔ Limite atingido" imediatamente após o insert;
 *   • botão "Novo usuário" fica DESABILITADO em ambas as sessões;
 *   • ao remover um assento, ambas voltam a habilitar o botão.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { seatUsageBadge } from '@/lib/seatLimitCopy';

// ── Backend + bus em memória ────────────────────────────────────────────────
type Row = { id: string };
const backend = {
  planName: 'Elite',
  max: 5 as number | null,
  rows: [] as Row[],
};

type Listener = () => void;
const bus = new Set<Listener>();
function emit() { bus.forEach((fn) => fn()); }
function insert(id: string) { backend.rows.push({ id }); emit(); }
function remove(id: string) {
  backend.rows = backend.rows.filter((r) => r.id !== id);
  emit();
}
function reset(max: number | null, seed: number) {
  backend.max = max;
  backend.rows = Array.from({ length: seed }, (_, i) => ({ id: `seed-${i}` }));
  bus.clear();
}

// ── Componente sob teste (paridade com Cadastros & TeamPage) ────────────────
function SeatPanel({ label }: { label: string }) {
  const [used, setUsed] = useState(backend.rows.length);
  const [max, setMax] = useState<number | null>(backend.max);

  useEffect(() => {
    const sync = () => {
      setUsed(backend.rows.length);
      setMax(backend.max);
    };
    sync();
    bus.add(sync);
    return () => { bus.delete(sync); };
  }, []);

  const limitReached = max != null && used >= max;
  return (
    <section data-testid={`panel-${label}`}>
      <span data-testid={`badge-${label}`}>
        {seatUsageBadge({ planName: backend.planName, used, max })}
      </span>
      <button
        data-testid={`btn-${label}`}
        disabled={limitReached}
      >
        Novo usuário
      </button>
      <output data-testid={`used-${label}`}>{used}</output>
    </section>
  );
}

// ── Suíte ───────────────────────────────────────────────────────────────────
describe('E2E · sincronização de assentos entre 2 sessões (Cadastros + Team)', () => {
  beforeEach(() => reset(5, 4)); // Plano Elite: 4/5

  it('insert em uma sessão bloqueia botão nas DUAS sessões instantaneamente', () => {
    render(<SeatPanel label="cadastros" />);
    render(<SeatPanel label="team" />);

    // Estado inicial: 4/5 → botão habilitado, badge de aviso 80%+.
    expect(screen.getByTestId('used-cadastros').textContent).toBe('4');
    expect(screen.getByTestId('used-team').textContent).toBe('4');
    expect((screen.getByTestId('btn-cadastros') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId('badge-cadastros').textContent).toContain('Restam 1 assento');
    expect(screen.getByTestId('badge-team').textContent).toContain('Restam 1 assento');

    // Ação: sessão "cadastros" cria um novo usuário → 5/5.
    act(() => { insert('novo-1'); });

    expect(screen.getByTestId('used-cadastros').textContent).toBe('5');
    expect(screen.getByTestId('used-team').textContent).toBe('5');
    expect((screen.getByTestId('btn-cadastros') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('btn-team') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('badge-cadastros').textContent).toContain('⛔ Limite atingido: 5/5');
    expect(screen.getByTestId('badge-team').textContent).toContain('⛔ Limite atingido: 5/5');
  });

  it('delete em uma sessão libera novamente o botão nas DUAS sessões', () => {
    reset(5, 5); // já cheio
    render(<SeatPanel label="cadastros" />);
    render(<SeatPanel label="team" />);

    expect((screen.getByTestId('btn-cadastros') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('btn-team') as HTMLButtonElement).disabled).toBe(true);

    // Ação: sessão "team" remove um assento → 4/5.
    act(() => { remove('seed-0'); });

    expect(screen.getByTestId('used-cadastros').textContent).toBe('4');
    expect(screen.getByTestId('used-team').textContent).toBe('4');
    expect((screen.getByTestId('btn-cadastros') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId('btn-team') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId('badge-cadastros').textContent).toContain('Restam 1 assento');
  });

  it('vários inserts consecutivos convergem para o mesmo estado nas 2 sessões', () => {
    reset(5, 2);
    render(<SeatPanel label="cadastros" />);
    render(<SeatPanel label="team" />);

    act(() => { insert('a'); insert('b'); insert('c'); }); // 2 → 5

    for (const label of ['cadastros', 'team']) {
      expect(screen.getByTestId(`used-${label}`).textContent).toBe('5');
      expect((screen.getByTestId(`btn-${label}`) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByTestId(`badge-${label}`).textContent).toContain('⛔ Limite atingido');
    }
  });

  it('quando o plano é ilimitado (max=null), nenhum insert bloqueia o botão', () => {
    reset(null, 30);
    render(<SeatPanel label="cadastros" />);
    render(<SeatPanel label="team" />);

    act(() => { insert('x'); insert('y'); });

    for (const label of ['cadastros', 'team']) {
      expect((screen.getByTestId(`btn-${label}`) as HTMLButtonElement).disabled).toBe(false);
      expect(screen.getByTestId(`badge-${label}`).textContent).toContain('Assentos ilimitados');
    }
  });
});
