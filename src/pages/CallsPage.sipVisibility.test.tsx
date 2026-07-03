/**
 * Regression tests: the "Configurações SIP" tab must only appear when the
 * current user is the platform owner (admin). Also validates that legacy SIP
 * credentials in browser storage are wiped on mount and stay wiped after a
 * simulated page reload (component remount).
 *
 * Heavy dependencies (framer-motion, recharts, jssip) are mocked so Vitest
 * doesn't hang inside jsdom.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// --- Heavy-dep mocks ---------------------------------------------------------
vi.mock('framer-motion', () => {
  const passthrough = (tag: string) =>
    React.forwardRef(({ children, ...props }: any, ref: any) =>
      React.createElement(tag, { ...props, ref }, children),
    );
  return {
    motion: new Proxy({}, { get: (_t, key: string) => passthrough(key === 'div' ? 'div' : String(key)) }),
    AnimatePresence: ({ children }: any) => children ?? null,
  };
});

vi.mock('recharts', () => {
  const Passthrough = ({ children }: any) => children ?? null;
  return new Proxy(
    { ResponsiveContainer: Passthrough },
    { get: () => Passthrough },
  );
});

vi.mock('jssip', () => ({ default: { UA: class {}, WebSocketInterface: class {} } }));

// Supabase client — minimal stub, no data needed for the visibility check.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: null } })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) })),
    functions: { invoke: vi.fn(() => Promise.resolve({ data: null, error: null })) },
    rpc: vi.fn(() => Promise.resolve({ data: false })),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/lib/sipConfig', () => ({
  fetchSipConfig: vi.fn(() => Promise.resolve(null)),
  saveSipConfig: vi.fn(() => Promise.resolve({ ok: true })),
  listSipAudit: vi.fn(() => Promise.resolve([])),
  SipError: class extends Error { status = 0; code = ''; },
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'x' }, loading: false }),
}));

const ownerState = { isOwner: false, loading: false };
vi.mock('@/hooks/usePlatformOwner', () => ({
  usePlatformOwner: () => ownerState,
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

import CallsPage from './CallsPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <CallsPage />
    </MemoryRouter>,
  );
}

describe('CallsPage · SIP tab visibility (regression)', () => {
  beforeEach(() => {
    ownerState.isOwner = false;
    localStorage.clear();
    sessionStorage.clear();
    cleanup();
  });

  it('hides the "Configurações SIP" tab from non-owner users', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: /Configurações SIP/i })).not.toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/Servidor SIP/i)).not.toBeInTheDocument();
  });

  it('shows the "Configurações SIP" tab for the platform owner', async () => {
    ownerState.isOwner = true;
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Configurações SIP/i })).toBeInTheDocument();
    });
  });

  it('purges every legacy SIP credential key on mount', async () => {
    localStorage.setItem('sipConfig', JSON.stringify({ password: 'leak' }));
    localStorage.setItem('sip_config', 'x');
    localStorage.setItem('voipConfig', 'x');
    sessionStorage.setItem('sipConfig', 'x');
    renderPage();
    await waitFor(() => {
      expect(localStorage.getItem('sipConfig')).toBeNull();
      expect(localStorage.getItem('sip_config')).toBeNull();
      expect(localStorage.getItem('voipConfig')).toBeNull();
      expect(sessionStorage.getItem('sipConfig')).toBeNull();
    });
  });

  it('does not reintroduce credentials after a simulated page reload (remount)', async () => {
    // First mount purges anything present.
    localStorage.setItem('sipConfig', JSON.stringify({ password: 'leak' }));
    const { unmount } = renderPage();
    await waitFor(() => expect(localStorage.getItem('sipConfig')).toBeNull());
    unmount();

    // Simulate reload: fresh mount must NOT write credentials back into storage.
    ownerState.isOwner = true;
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Configurações SIP/i })).toBeInTheDocument(),
    );
    expect(localStorage.getItem('sipConfig')).toBeNull();
    expect(sessionStorage.getItem('sipConfig')).toBeNull();
  });
});
