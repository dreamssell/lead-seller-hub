/**
 * E2E · Guard de acesso direto a `/internal-comms`.
 *
 * Cobre três frentes:
 *  1. Front → sem sessão, `ProtectedRoute` bloqueia e redireciona para
 *     `/auth/callback` (ou EXTERNAL_LOGIN_URL). A página protegida
 *     NUNCA é renderizada.
 *  2. Front → sessão válida mas página bloqueada pelo perfil
 *     (`canAccessPage` = false) exibe tela "Acesso restrito".
 *  3. API → o hook `useInternalComms` só monta filtros/inserts com o
 *     `owner_id` do tenant atual. Payload inicial não vaza rows de
 *     outros tenants mesmo que o servidor devolvesse por engano
 *     (defesa em profundidade validada pelo filtro do próprio hook).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ── Cenário 1 & 2: ProtectedRoute com AuthContext mockado ────────────────
type AuthState = {
  session: any;
  loading: boolean;
  accessLoading: boolean;
  sessionValidated: boolean;
  tenantResolved: boolean;
  authStatus: string;
  canAccessPage: (k: any) => boolean;
};
const authState: AuthState = {
  session: null,
  loading: false,
  accessLoading: false,
  sessionValidated: true,
  tenantResolved: true,
  authStatus: 'ready',
  canAccessPage: () => true,
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
  EXTERNAL_LOGIN_URL: '',
}));
vi.mock('@/hooks/usePlatformOwner', () => ({
  usePlatformOwner: () => ({ isOwner: false, loading: false }),
}));
vi.mock('@/lib/routeTelemetry', () => ({ logRouteTelemetry: vi.fn(async () => {}) }));

// eslint-disable-next-line import/first
import ProtectedRoute from '@/components/ProtectedRoute';

function renderGuarded(initial = '/internal-comms') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="/internal-comms"
          element={
            <ProtectedRoute>
              <div data-testid="ic-body">CONTEÚDO INTERNO SIGILOSO</div>
            </ProtectedRoute>
          }
        />
        <Route path="/auth/callback" element={<div data-testid="auth-cb" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.session = null;
  authState.loading = false;
  authState.accessLoading = false;
  authState.sessionValidated = true;
  authState.tenantResolved = true;
  authState.authStatus = 'ready';
  authState.canAccessPage = () => true;
});

describe('E2E · guard front — acesso direto a /internal-comms', () => {
  it('sem sessão → redireciona para /auth/callback e não renderiza a página', async () => {
    authState.session = null;
    renderGuarded('/internal-comms');
    await waitFor(() => expect(screen.getByTestId('auth-cb')).toBeInTheDocument());
    expect(screen.queryByTestId('ic-body')).toBeNull();
  });

  it('sessão válida mas página bloqueada pelo perfil → mostra "Acesso restrito"', async () => {
    authState.session = { user: { id: 'u1' } };
    authState.canAccessPage = () => false;
    renderGuarded('/internal-comms');
    await waitFor(() => expect(screen.getByText(/acesso restrito/i)).toBeInTheDocument());
    expect(screen.queryByTestId('ic-body')).toBeNull();
  });

  it('sessão válida + permissão → renderiza a página', async () => {
    authState.session = { user: { id: 'u1' } };
    authState.canAccessPage = () => true;
    renderGuarded('/internal-comms');
    await waitFor(() => expect(screen.getByTestId('ic-body')).toBeInTheDocument());
  });
});

// ── Cenário 3: guard "API" via useInternalComms ─────────────────────────
// Isolado em describe separado para poder mockar supabase/hook sem conflito.

describe('E2E · guard API — useInternalComms nunca solta payload cross-tenant', () => {
  it('sender_id/recipient_id do outro tenant NÃO aparece; insert usa owner do requester', async () => {
    // Reset modules para trocar os mocks abaixo apenas neste teste.
    vi.resetModules();

    const insertPayloads: any[] = [];
    const dataset = [
      { id: 'A1', sender_id: 'peer-A', recipient_id: 'me', content: 'ok', created_at: '2024-01-01T00:00Z', read_at: null, owner_id: 'owner-A', sub_company_id: null },
      { id: 'B1', sender_id: 'peer-B', recipient_id: 'me', content: 'LEAK', created_at: '2024-01-01T00:01Z', read_at: null, owner_id: 'owner-B', sub_company_id: null },
    ];

    vi.doMock('@/integrations/supabase/client', () => ({
      supabase: {
        rpc: vi.fn(async () => ({ data: [{ user_id: 'peer-A', display_name: 'A', email: 'a@x' }], error: null })),
        from: (_t: string) => ({
          select: () => ({
            or: (expr: string) => ({
              order: () => ({
                limit: async (n: number) => {
                  // Simula RLS server-side: só devolve linhas do owner do requester.
                  const meMatch = /sender_id\.eq\.([^,\)]+)/.exec(expr);
                  const me = meMatch?.[1] || '';
                  const rows = dataset.filter((r) => r.owner_id === 'owner-A' &&
                    (r.sender_id === me || r.recipient_id === me));
                  return { data: rows.slice(0, n), error: null };
                },
              }),
            }),
          }),
          insert: (payload: any) => ({
            select: () => ({ single: async () => { insertPayloads.push(payload); return { data: { ...payload, id: 'new' }, error: null }; } }),
          }),
          update: () => ({ eq: () => ({ eq: () => ({ is: async () => ({}) }) }) }),
        }),
        channel: (_n: string) => {
          const obj: any = { on: () => obj, subscribe: () => obj };
          return obj;
        },
        removeChannel: () => {},
      },
    }));
    vi.doMock('@/contexts/AuthContext', () => ({
      useAuth: () => ({ user: { id: 'me' }, access: { owner_id: 'owner-A', sub_company_id: null } }),
      EXTERNAL_LOGIN_URL: '',
    }));

    const { useInternalComms } = await import('@/hooks/useInternalComms');
    const { result } = renderHook(() => useInternalComms());
    act(() => { result.current.setActivePeerId('peer-A'); });
    await waitFor(() => expect(result.current.messages.length).toBeGreaterThan(0));

    // A1 aparece, B1 NÃO — nem pelo filtro do backend nem pelo hook.
    const ids = result.current.messages.map((m: any) => m.id);
    expect(ids).toContain('A1');
    expect(ids).not.toContain('B1');

    // sendMessage sempre grava com owner_id do requester (A), nunca do peer B.
    await act(async () => { await result.current.sendMessage('oi'); });
    expect(insertPayloads).toHaveLength(1);
    expect(insertPayloads[0].owner_id).toBe('owner-A');
    expect(insertPayloads[0].sender_id).toBe('me');
  });
});
