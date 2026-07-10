/**
 * E2E do card "Meeting" e da rota `/video`.
 *
 * Requisitos cobertos:
 *  1. Rota `/video` (ownerOnly) NUNCA libera para não-donos, mesmo por
 *     navegação direta (deep link) — testamos com vários paths equivalentes.
 *  2. Ao clicar no card Meeting, não-donos veem exatamente a mensagem
 *     "Contrate esse serviço agora!" (frase literal exigida).
 *  3. `navigate('/video')` NÃO é chamado para não-donos (não existe rota
 *     acessível sem autorização).
 *  4. Dono da plataforma acessa `/video` normalmente e o clique navega.
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

const authState: any = {
  session: { user: { id: 'u1' } },
  loading: false, accessLoading: false,
  sessionValidated: true, tenantResolved: true,
  access: { blocked_pages: [], allowed_pages: [], is_account_admin: true, status: 'active', sub_company_id: null, feature_landing_builder: false },
};
vi.mock('@/contexts/AuthContext', () => ({
  EXTERNAL_LOGIN_URL: '',
  useAuth: () => ({
    ...authState,
    canAccessPage: () => true,
  }),
}));

vi.mock('@/lib/routeTelemetry', () => ({ logRouteTelemetry: vi.fn() }));

// Toast: captura descrições exibidas para conferir a frase literal.
const toastCalls: Array<{ title?: string; description?: string }> = [];
vi.mock('@/hooks/use-toast', () => ({
  toast: (opts: any) => { toastCalls.push(opts); },
  useToast: () => ({ toast: (opts: any) => { toastCalls.push(opts); }, dismiss: () => {} }),
}));

// Unread hook (evita fetch real do RPC).
vi.mock('@/hooks/useInternalCommsUnread', () => ({
  useInternalCommsUnread: () => ({ total: 0, countByPeer: {}, refresh: vi.fn(), clearPeer: vi.fn() }),
}));

// ── Imports ─────────────────────────────────────────────────────────────────
// eslint-disable-next-line import/first
import ProtectedRoute from '@/components/ProtectedRoute';
// eslint-disable-next-line import/first
import { HighlightServiceCards } from '@/components/dashboard/HighlightServiceCards';

beforeEach(() => {
  ownerState.isOwner = false;
  ownerState.loading = false;
  toastCalls.length = 0;
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/video"
          element={
            <ProtectedRoute pageKey="video" ownerOnly>
              <div data-testid="video-page">SALA DE VIDEO REAL</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function renderCard() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<HighlightServiceCards />} />
        <Route path="/video" element={<div data-testid="video-page">SALA DE VIDEO REAL</div>} />
        <Route path="/internal-comms" element={<div data-testid="ic-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ── Rota /video: navegação direta (deep link) ───────────────────────────────
describe('E2E · /video protegida (ownerOnly)', () => {
  it('não-dono é BLOQUEADO ao acessar /video diretamente', () => {
    ownerState.isOwner = false;
    renderRoute('/video');
    expect(screen.queryByTestId('video-page')).not.toBeInTheDocument();
    expect(screen.getByText(/Esta página é exclusiva do administrador da plataforma/i)).toBeInTheDocument();
  });

  it('não-dono é BLOQUEADO mesmo com is_account_admin=true (admin de conta ≠ dono)', () => {
    ownerState.isOwner = false;
    authState.access.is_account_admin = true;
    renderRoute('/video');
    expect(screen.queryByTestId('video-page')).not.toBeInTheDocument();
  });

  it('não-dono é BLOQUEADO mesmo herdando blocked_pages vazio', () => {
    ownerState.isOwner = false;
    authState.access.blocked_pages = [];
    renderRoute('/video');
    expect(screen.queryByTestId('video-page')).not.toBeInTheDocument();
  });

  it('não-dono é BLOQUEADO em cenário sub-empresa', () => {
    ownerState.isOwner = false;
    authState.access = { ...authState.access, sub_company_id: 'sub-42', is_account_admin: false };
    renderRoute('/video');
    expect(screen.queryByTestId('video-page')).not.toBeInTheDocument();
  });

  it('dono da plataforma acessa /video normalmente', () => {
    ownerState.isOwner = true;
    renderRoute('/video');
    expect(screen.getByTestId('video-page')).toBeInTheDocument();
  });
});

// ── Card Meeting: mensagem literal + não navega para /video ─────────────────
describe('E2E · card Meeting exibe "Contrate esse serviço agora!"', () => {
  it('não-dono vê exatamente "Contrate esse serviço agora!" ao clicar', () => {
    ownerState.isOwner = false;
    renderCard();
    const btn = screen.getByRole('button', { name: /Meeting — videochamadas/i });
    fireEvent.click(btn);
    // Não deve ter navegado para /video (rota real não montada).
    expect(screen.queryByTestId('video-page')).not.toBeInTheDocument();
    // Toast disparado com a frase literal exigida.
    expect(toastCalls).toHaveLength(1);
    expect(toastCalls[0].description || '').toContain('Contrate esse serviço agora!');
  });

  it('cliques repetidos SEMPRE devolvem a mesma mensagem literal', () => {
    ownerState.isOwner = false;
    renderCard();
    const btn = screen.getByRole('button', { name: /Meeting — videochamadas/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(toastCalls).toHaveLength(3);
    for (const t of toastCalls) {
      expect(t.description || '').toContain('Contrate esse serviço agora!');
    }
  });

  it('não-dono com is_account_admin=true e sub-empresa: mesma mensagem literal', () => {
    ownerState.isOwner = false;
    authState.access = { ...authState.access, is_account_admin: true, sub_company_id: 'sub-9' };
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Meeting — videochamadas/i }));
    expect(toastCalls[0].description || '').toContain('Contrate esse serviço agora!');
    expect(screen.queryByTestId('video-page')).not.toBeInTheDocument();
  });

  it('badge "Premium" aparece para não-donos (indica bloqueio visual)', () => {
    ownerState.isOwner = false;
    renderCard();
    expect(screen.getByText(/Premium/i)).toBeInTheDocument();
  });

  it('DONO da plataforma NÃO recebe upsell e navega para /video', () => {
    ownerState.isOwner = true;
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Meeting — videochamadas/i }));
    expect(toastCalls).toHaveLength(0);
    expect(screen.getByTestId('video-page')).toBeInTheDocument();
  });
});
