/**
 * E2E · Visibilidade dos cards de destaque em Ferramentas
 * (Meeting + Comunicação Interna) por perfil.
 *
 * Requisitos:
 *  • Admin-Dono (Mult Seguros) → vê AMBOS os cards e o Meeting navega.
 *  • Usuário comum (não dono)  → vê AMBOS os cards, mas Meeting é
 *    "Premium" e clique dispara upsell (sem navegar).
 *  • Comunicação Interna aparece para TODOS (não é premium).
 *
 * Testamos a renderização de `HighlightServiceCards` no topo da página
 * Ferramentas, garantindo que o gating fique visualmente correto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ── Mocks compartilhados ────────────────────────────────────────────────────
const ownerState = { isOwner: false, loading: false };
vi.mock('@/hooks/usePlatformOwner', () => ({
  usePlatformOwner: () => ownerState,
}));

vi.mock('@/hooks/useInternalCommsUnread', () => ({
  useInternalCommsUnread: () => ({ total: 0, countByPeer: {}, refresh: vi.fn(), clearPeer: vi.fn() }),
}));

const toastCalls: Array<{ title?: string; description?: string }> = [];
vi.mock('@/hooks/use-toast', () => ({
  toast: (opts: any) => { toastCalls.push(opts); },
  useToast: () => ({ toast: (opts: any) => { toastCalls.push(opts); }, dismiss: () => {} }),
}));

// eslint-disable-next-line import/first
import { HighlightServiceCards } from '@/components/dashboard/HighlightServiceCards';

function renderCards() {
  return render(
    <MemoryRouter initialEntries={['/tools']}>
      <Routes>
        <Route path="/tools" element={<HighlightServiceCards />} />
        <Route path="/video" element={<div data-testid="video-page" />} />
        <Route path="/internal-comms" element={<div data-testid="ic-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  ownerState.isOwner = false;
  ownerState.loading = false;
  toastCalls.length = 0;
});

describe('E2E · Ferramentas · cards Meeting e Comunicação Interna', () => {
  it('Admin-Dono vê AMBOS os cards e Meeting navega para /video', () => {
    ownerState.isOwner = true;
    renderCards();
    // Meeting visível
    const meeting = screen.getByRole('button', { name: /Meeting — videochamadas/i });
    expect(meeting).toBeInTheDocument();
    // Comunicação Interna visível
    expect(
      screen.getByRole('button', { name: /Comunicação Interna/i }),
    ).toBeInTheDocument();
    // Sem badge Premium para o dono
    expect(screen.queryByText(/Premium/i)).not.toBeInTheDocument();
    // Clique navega para /video
    fireEvent.click(meeting);
    expect(screen.getByTestId('video-page')).toBeInTheDocument();
    expect(toastCalls).toHaveLength(0);
  });

  it('Usuário comum vê AMBOS os cards; Meeting é Premium e dispara upsell', () => {
    ownerState.isOwner = false;
    renderCards();
    const meeting = screen.getByRole('button', { name: /Meeting — videochamadas/i });
    const comms = screen.getByRole('button', { name: /Comunicação Interna/i });
    expect(meeting).toBeInTheDocument();
    expect(comms).toBeInTheDocument();
    // Badge Premium visível apenas para não-donos
    expect(screen.getByText(/Premium/i)).toBeInTheDocument();
    // Meeting NÃO navega — dispara upsell
    fireEvent.click(meeting);
    expect(screen.queryByTestId('video-page')).not.toBeInTheDocument();
    expect(toastCalls[0]?.description || '').toContain('Contrate esse serviço agora!');
    // Comunicação Interna NAVEGA normalmente para qualquer usuário
    fireEvent.click(comms);
    expect(screen.getByTestId('ic-page')).toBeInTheDocument();
  });

  it('ToolsPage.tsx renderiza <HighlightServiceCards /> antes da grade de serviços', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/pages/ToolsPage.tsx', 'utf8');
    expect(src).toContain('<HighlightServiceCards />');
    // Deve aparecer ANTES da grade `grid grid-cols-`, garantindo visibilidade no topo.
    const iCards = src.indexOf('<HighlightServiceCards />');
    const iGrid = src.indexOf('grid grid-cols-');
    expect(iCards).toBeGreaterThan(-1);
    expect(iGrid).toBeGreaterThan(iCards);
  });

  it('Comunicação Interna é renderizada mesmo em loading do owner (não bloqueia por perfil)', () => {
    ownerState.isOwner = false;
    ownerState.loading = true;
    renderCards();
    expect(
      screen.getByRole('button', { name: /Comunicação Interna/i }),
    ).toBeInTheDocument();
  });
});
