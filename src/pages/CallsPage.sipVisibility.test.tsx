/**
 * Regression tests: the "Configurações SIP" tab must only appear when the
 * current user is the platform owner (admin). Any other role — regular user,
 * sub-company, client company — must never see the trigger nor the panel.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

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

// Avoid heavy chart deps blowing up jsdom
vi.mock('recharts', () => new Proxy({}, { get: () => (props: any) => props?.children ?? null }));

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
  });

  it('hides the "Configurações SIP" tab from non-owner users', async () => {
    ownerState.isOwner = false;
    renderPage();
    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: /Configurações SIP/i })).not.toBeInTheDocument();
    });
    // Panel content (server input) also must be absent
    expect(screen.queryByLabelText(/Servidor SIP/i)).not.toBeInTheDocument();
  });

  it('shows the "Configurações SIP" tab for the platform owner', async () => {
    ownerState.isOwner = true;
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Configurações SIP/i })).toBeInTheDocument();
    });
  });

  it('never leaves SIP credentials in localStorage after mount', async () => {
    localStorage.setItem('sipConfig', JSON.stringify({ password: 'leak' }));
    ownerState.isOwner = false;
    renderPage();
    await waitFor(() => {
      expect(localStorage.getItem('sipConfig')).toBeNull();
    });
  });
});
