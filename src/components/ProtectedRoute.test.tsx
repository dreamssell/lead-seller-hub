/**
 * Testes de ProtectedRoute — validam que rotas diretas (deep links) são
 * negadas quando a chave da página está em `blocked_pages`, e que rotas
 * `ownerOnly` (CEO) só liberam para o dono da plataforma.
 *
 * Cobrem: dono da plataforma vê CEO; membro comum é bloqueado; qualquer
 * usuário com a página em blocked_pages recebe tela de "Acesso restrito".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ── Mocks ────────────────────────────────────────────────────────────────────
const authState: any = {
  session: { user: { id: 'u1' } },
  loading: false,
  accessLoading: false,
  sessionValidated: true,
  tenantResolved: true,
  access: { blocked_pages: [], allowed_pages: [], is_account_admin: true, status: 'active', sub_company_id: null, feature_landing_builder: false },
};

vi.mock('@/contexts/AuthContext', () => ({
  EXTERNAL_LOGIN_URL: '',
  useAuth: () => ({
    ...authState,
    canAccessPage: (page: string) => {
      const a = authState.access;
      if (!a) return true;
      if (a.status === 'blocked') return page === 'profile';
      if (a.blocked_pages?.includes(page)) return false;
      if (a.is_account_admin || a.allowed_pages.length === 0) return true;
      return a.allowed_pages.includes(page) || page === 'profile';
    },
  }),
}));

const ownerState = { isOwner: false, loading: false };
vi.mock('@/hooks/usePlatformOwner', () => ({
  usePlatformOwner: () => ownerState,
}));

vi.mock('@/lib/routeTelemetry', () => ({ logRouteTelemetry: vi.fn() }));

import ProtectedRoute from '@/components/ProtectedRoute';

function renderAt(path: string, pageKey?: any, ownerOnly = false) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path={path}
          element={
            <ProtectedRoute pageKey={pageKey} ownerOnly={ownerOnly}>
              <div data-testid="page-content">CONTEUDO OK</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.access = { blocked_pages: [], allowed_pages: [], is_account_admin: true, status: 'active', sub_company_id: null, feature_landing_builder: false };
  ownerState.isOwner = false;
  ownerState.loading = false;
});

describe('ProtectedRoute · CEO (ownerOnly)', () => {
  it('dono da plataforma acessa /ceo', () => {
    ownerState.isOwner = true;
    renderAt('/ceo', 'ceo', true);
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  it('não-dono é bloqueado em /ceo mesmo com is_account_admin', () => {
    ownerState.isOwner = false;
    renderAt('/ceo', 'ceo', true);
    expect(screen.queryByTestId('page-content')).not.toBeInTheDocument();
    expect(screen.getByText(/Esta página é exclusiva do administrador da plataforma/i)).toBeInTheDocument();
  });

  it('não-dono é bloqueado em deep links /ceo/leads-capture, /ceo/calls, /ceo/signatures', () => {
    for (const p of ['/ceo/leads-capture', '/ceo/calls', '/ceo/signatures']) {
      const { unmount } = renderAt(p, 'ceo', true);
      expect(screen.queryByTestId('page-content')).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe('ProtectedRoute · blocked_pages (deep link)', () => {
  it('bloqueia qualquer usuário quando a chave está em blocked_pages', () => {
    authState.access.blocked_pages = ['reports'];
    renderAt('/reports', 'reports');
    expect(screen.queryByTestId('page-content')).not.toBeInTheDocument();
    expect(screen.getByText(/Você não tem permissão para acessar esta página/i)).toBeInTheDocument();
  });

  it('libera quando a chave não está em blocked_pages', () => {
    authState.access.blocked_pages = ['ai-agents'];
    renderAt('/reports', 'reports');
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  it('cenário Mult Seguros: sub-empresa herda bloqueio da empresa-mãe', () => {
    // Backend já entrega blocked_pages mesclado (empresa ∪ sub).
    // Aqui simulamos o resultado final vindo do RPC.
    authState.access = {
      ...authState.access,
      sub_company_id: 'sub-1',
      blocked_pages: ['reports', 'ai-agents'], // union já aplicado
      is_account_admin: false,
      allowed_pages: [],
    };
    renderAt('/reports', 'reports');
    expect(screen.queryByTestId('page-content')).not.toBeInTheDocument();
  });

  it('conta bloqueada só libera /profile', () => {
    authState.access.status = 'blocked';
    renderAt('/reports', 'reports');
    expect(screen.queryByTestId('page-content')).not.toBeInTheDocument();
  });
});
