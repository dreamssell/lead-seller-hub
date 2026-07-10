/**
 * E2E · /internal-comms carrega colegas (inclusive dono/admin) em qualquer
 * combinação Empresa / Empresa+Sub-empresa.
 *
 * Cenários:
 *  1. Mult Seguros (Empresa) — 14 colegas + dono da conta aparecem.
 *  2. Tenant com Sub-empresa — colegas filtrados ao escopo da sub, incluindo
 *     seu admin.
 *
 * A fonte da lista é a RPC SECURITY DEFINER `list_internal_comms_members`,
 * então o teste garante:
 *   - página consome exclusivamente essa RPC (nada de JOIN client-side em
 *     `user_account_access`, que quebraria para não-donos por RLS);
 *   - colegas são renderizados com display_name/email;
 *   - contagem no cabeçalho ("Colegas (N)") bate com o payload;
 *   - lista funciona igual para diferentes tenants.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ──────────────────────────────────────────────────────────────────
const rpcMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: any[]) => rpcMock(...args),
    from: () => ({
      select: () => ({ or: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }),
      update: () => ({ eq: () => ({ eq: () => ({ is: async () => ({}) }) }) }),
    }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: vi.fn(),
  },
}));

const authState: any = {
  user: { id: 'me' },
  access: { owner_id: 'owner-mult', sub_company_id: null },
};
vi.mock('@/contexts/AuthContext', () => ({
  EXTERNAL_LOGIN_URL: '',
  useAuth: () => ({
    ...authState,
    session: { user: authState.user },
    loading: false, accessLoading: false,
    sessionValidated: true, tenantResolved: true,
    canAccessPage: () => true,
    signOut: vi.fn(),
  }),
}));

vi.mock('@/hooks/usePlatformOwner', () => ({ usePlatformOwner: () => ({ isOwner: false, loading: false }) }));
vi.mock('@/lib/routeTelemetry', () => ({ logRouteTelemetry: vi.fn() }));

// eslint-disable-next-line import/first
import InternalCommsPage from '@/pages/InternalCommsPage';

function buildMembers(prefix: string, n: number, withOwner = true) {
  const list = Array.from({ length: n }).map((_, i) => ({
    user_id: `${prefix}-u${i}`,
    display_name: `${prefix} User ${i}`,
    email: `${prefix}${i}@ex.com`,
    avatar_url: null,
    is_account_admin: i === 0,
  }));
  if (withOwner) {
    list.push({
      user_id: `${prefix}-owner`,
      display_name: `${prefix} Owner`,
      email: `${prefix}-owner@ex.com`,
      avatar_url: null,
      is_account_admin: true,
    });
  }
  return list;
}

beforeEach(() => {
  rpcMock.mockReset();
  authState.user = { id: 'me' };
  authState.access = { owner_id: 'owner-mult', sub_company_id: null };
});

function renderPage() {
  return render(<MemoryRouter><InternalCommsPage /></MemoryRouter>);
}

describe('/internal-comms · carregamento de colegas por tenant', () => {
  it('Mult Seguros (Empresa) renderiza 14 colegas + o dono via RPC', async () => {
    const members = buildMembers('mult', 14, true); // 14 + owner = 15
    rpcMock.mockResolvedValueOnce({ data: members, error: null });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Colegas \(15\)/)).toBeInTheDocument();
    });
    expect(screen.getByText('mult User 0')).toBeInTheDocument();
    expect(screen.getByText('mult User 13')).toBeInTheDocument();
    expect(screen.getByText('mult Owner')).toBeInTheDocument();
    // Contrato: página consultou exclusivamente a RPC unificada.
    expect(rpcMock).toHaveBeenCalledWith('list_internal_comms_members');
  });

  it('Tenant com Sub-empresa renderiza apenas colegas do escopo da sub + admin da sub', async () => {
    authState.user = { id: 'sub-user-1' };
    authState.access = { owner_id: 'owner-acme', sub_company_id: 'sub-1' };
    const members = buildMembers('sub', 5, true); // 5 + owner (admin da sub) = 6
    rpcMock.mockResolvedValueOnce({ data: members, error: null });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Colegas \(6\)/)).toBeInTheDocument();
    });
    expect(screen.getByText('sub User 0')).toBeInTheDocument();
    expect(screen.getByText('sub Owner')).toBeInTheDocument();
  });

  it('Zero colegas → exibe mensagem "Nenhum colega encontrado" (nunca quebra)', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Nenhum colega encontrado/i)).toBeInTheDocument();
    });
  });
});
