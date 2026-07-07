/**
 * Integração: alterar blocked_pages via Realtime deve refletir imediatamente
 * em canAccessPage (Assinaturas, Desenvolvedor). Também valida re-sync ao
 * disparar visibilitychange/online.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

let currentBlocked: string[] = [];
let realtimeCallback: (() => void) | null = null;
let subscribeCb: ((status: string) => void) | null = null;

vi.mock('@/integrations/supabase/client', () => {
  const channel = {
    on: vi.fn(function (this: any, _event: string, _cfg: any, cb: () => void) {
      realtimeCallback = cb;
      return this;
    }),
    subscribe: vi.fn(function (this: any, cb?: (s: string) => void) {
      subscribeCb = cb ?? null;
      cb?.('SUBSCRIBED');
      return this;
    }),
  };
  return {
    supabase: {
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }),
        getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }),
        signOut: () => Promise.resolve(),
      },
      rpc: vi.fn(() => Promise.resolve({
        data: [{
          owner_id: 'owner-1', sub_company_id: null, sub_company_name: null,
          allowed_pages: [], is_account_admin: true,
          blocked_pages: [...currentBlocked], status: 'active',
          allow_custom_logic: true, feature_landing_builder: false,
        }],
      })),
      channel: () => channel,
      removeChannel: () => {},
    },
  };
});

function Probe() {
  const { canAccessPage, accessLoading } = useAuth();
  if (accessLoading) return <span>loading</span>;
  return (
    <div>
      <span data-testid="sig">{String(canAccessPage('signatures'))}</span>
      <span data-testid="dev">{String(canAccessPage('developer'))}</span>
    </div>
  );
}

describe('AuthContext · realtime blocked_pages', () => {
  beforeEach(() => { currentBlocked = []; realtimeCallback = null; subscribeCb = null; });

  it('Assinaturas e Desenvolvedor iniciam liberados quando não estão em blocked_pages', async () => {
    const { getByTestId, queryByTestId } = render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(queryByTestId('sig')?.textContent).toBe('true'));
    await waitFor(() => expect(getByTestId('dev').textContent).toBe('true'));
  });

  it('quando um UPDATE de client_companies bloqueia signatures/developer, o UI reflete sem refresh', async () => {
    const { getByTestId } = render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(getByTestId('sig').textContent).toBe('true'));

    // Simula alteração em blocked_pages no banco + emissão do Postgres Change.
    currentBlocked = ['signatures', 'developer'];
    await act(async () => { realtimeCallback?.(); });

    await waitFor(() => expect(getByTestId('sig').textContent).toBe('false'));
    expect(getByTestId('dev').textContent).toBe('false');
  });

  it('re-sync automático ao voltar do background (visibilitychange)', async () => {
    const { getByTestId } = render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(getByTestId('sig').textContent).toBe('true'));

    currentBlocked = ['signatures'];
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(getByTestId('sig').textContent).toBe('false'));
  });

  it('re-sync automático ao recuperar conexão (evento online)', async () => {
    const { getByTestId } = render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(getByTestId('sig').textContent).toBe('true'));

    currentBlocked = ['developer'];
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(getByTestId('dev').textContent).toBe('false'));
  });
});
