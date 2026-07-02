import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Mocks ──────────────────────────────────────────────────────────────────
const invokeMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: (...args: any[]) => fromMock(...args),
    functions: { invoke: (...args: any[]) => invokeMock(...args) },
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
  },
}));

// Mutable auth mock
const authState: any = {
  user: { id: 'u1', email: 'user@test.com' },
  access: { sub_company_id: null, is_account_admin: false },
  loading: false,
  accessLoading: false,
  canAccessPage: () => true,
  signOut: vi.fn(),
  session: { user: { id: 'u1' } },
};
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

const platformOwnerState = { isOwner: false };
vi.mock('@/hooks/usePlatformOwner', () => ({
  usePlatformOwner: () => platformOwnerState,
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

const toastMock = vi.fn();
vi.mock('@/components/ui/use-toast', () => ({
  toast: (...args: any[]) => toastMock(...args),
  useToast: () => ({ toast: toastMock }),
}));

import TeamPage from './TeamPage';

// Chainable stub for supabase.from().select().eq()... resolving to given payload
function makeChain(result: any) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve(result),
    then: (res: any) => Promise.resolve(result).then(res),
  };
  return chain;
}

function setup(members: any[], planMax: number | null, planName = 'Starter') {
  invokeMock.mockImplementation(async (fn: string, opts: any) => {
    if (fn === 'manage-account-user' && opts?.body?.action === 'list') {
      return { data: { users: members }, error: null };
    }
    return { data: { ok: true }, error: null };
  });
  fromMock.mockImplementation((table: string) => {
    if (table === 'sub_companies') return makeChain({ data: { plan_slug: 'starter' } });
    if (table === 'client_companies') return makeChain({ data: { plan_slug: 'starter' } });
    if (table === 'plan_packages') return makeChain({ data: { name: planName, max_users: planMax } });
    if (table === 'audit_logs') return makeChain({ data: [] });
    if (table === 'profiles') return makeChain({ data: [] });
    return makeChain({ data: null });
  });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TeamPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('TeamPage — permission gating and plan limits', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    fromMock.mockReset();
    platformOwnerState.isOwner = false;
    authState.access = { sub_company_id: null, is_account_admin: false };
  });

  it('hides Add Member enable state and Audit button for common users', async () => {
    setup([], 5);
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /Adicionar Membro/i })).toBeDisabled());
    expect(screen.queryByRole('button', { name: /Auditoria/i })).not.toBeInTheDocument();
  });

  it('enables Add Member and shows Audit for account admins', async () => {
    authState.access = { sub_company_id: null, is_account_admin: true };
    setup([], 5);
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /Adicionar Membro/i })).toBeEnabled());
    expect(screen.getByRole('button', { name: /Auditoria/i })).toBeInTheDocument();
  });

  it('enables Add Member and Audit for platform owner regardless of plan', async () => {
    platformOwnerState.isOwner = true;
    setup([{ user_id: 'a', is_account_admin: false, allowed_pages: [], profile: { display_name: 'A' } }], 1);
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /Adicionar Membro/i })).toBeEnabled());
    expect(screen.getByRole('button', { name: /Auditoria/i })).toBeInTheDocument();
  });

  it('shows detailed limit-reached alert with plan name and upgrade CTA when quota is reached', async () => {
    authState.access = { sub_company_id: null, is_account_admin: true };
    const members = Array.from({ length: 2 }, (_, i) => ({
      user_id: `u${i}`, is_account_admin: false, allowed_pages: [],
      profile: { display_name: `User ${i}`, email: `u${i}@t.com`, is_active: true },
    }));
    setup(members, 2, 'Starter');
    renderPage();
    const alert = await screen.findByRole('alert', { name: /limite-plano-atingido/i });
    expect(alert).toHaveTextContent(/Starter/);
    expect(alert).toHaveTextContent(/2/);
    const cta = screen.getByTestId('request-plan-upgrade') as HTMLAnchorElement;
    expect(cta).toHaveAttribute('href', expect.stringMatching(/^mailto:suporte@leadseller\.com/));
    expect(decodeURIComponent(cta.href)).toContain('Plano Starter');
    // Button disabled when limit reached (non-owner)
    expect(screen.getByRole('button', { name: /Adicionar Membro/i })).toBeDisabled();
  });

  it('does not show limit alert for unlimited plan / platform owner', async () => {
    platformOwnerState.isOwner = true;
    setup([{ user_id: 'a', is_account_admin: false, allowed_pages: [], profile: {} }], null);
    renderPage();
    await waitFor(() =>
      expect(screen.queryByRole('alert', { name: /limite-plano-atingido/i })).not.toBeInTheDocument()
    );
  });
});
