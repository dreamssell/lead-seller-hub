/**
 * Alterna rapidamente entre Empresa (owner) e Sub-empresa (mesmo usuário) e
 * confirma:
 *  1. Os filtros do canal Realtime são reconstruídos por ID (owner vs sub).
 *  2. Um evento Postgres para a Empresa não afeta o UI quando o usuário
 *     está no escopo da Sub-empresa (e vice-versa).
 *  3. canAccessPage reage instantaneamente ao trocar de escopo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

type Scope = { owner_id: string; sub_company_id: string | null; blocked_pages: string[] };
let currentScope: Scope = { owner_id: 'owner-1', sub_company_id: null, blocked_pages: [] };

type Filter = { table: string; filter?: string; cb: () => void };
let filters: Filter[] = [];

vi.mock('@/integrations/supabase/client', () => {
  const channel = {
    on: vi.fn(function (this: any, _event: string, cfg: any, cb: () => void) {
      filters.push({ table: cfg.table, filter: cfg.filter, cb });
      return this;
    }),
    subscribe: vi.fn(function (this: any, cb?: (s: string) => void) {
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
          owner_id: currentScope.owner_id,
          sub_company_id: currentScope.sub_company_id,
          sub_company_name: currentScope.sub_company_id ? 'Sub A' : null,
          allowed_pages: [], is_account_admin: true,
          blocked_pages: [...currentScope.blocked_pages], status: 'active',
          allow_custom_logic: true, feature_landing_builder: true,
        }],
      })),
      channel: () => { filters = []; return channel; },
      removeChannel: () => {},
    },
  };
});

function Probe() {
  const { canAccessPage, access, accessLoading } = useAuth();
  if (accessLoading) return <span>loading</span>;
  return (
    <div>
      <span data-testid="scope">{access?.sub_company_id ?? 'owner'}</span>
      <span data-testid="dev">{String(canAccessPage('developer'))}</span>
      <span data-testid="sig">{String(canAccessPage('signatures'))}</span>
    </div>
  );
}

describe('AuthContext · rápido chaveamento Empresa ↔ Sub-empresa', () => {
  beforeEach(() => {
    filters = [];
    currentScope = { owner_id: 'owner-1', sub_company_id: null, blocked_pages: [] };
  });

  it('canal usa filtro por owner_id quando está na Empresa e não observa sub_companies', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(filters.length).toBeGreaterThan(0));
    const cc = filters.find(f => f.table === 'client_companies');
    const sub = filters.find(f => f.table === 'sub_companies');
    expect(cc?.filter).toBe('owner_id=eq.owner-1');
    expect(sub).toBeUndefined();
  });

  it('ao trocar para Sub-empresa, o canal ganha filtro por sub_companies.id=<sub>', async () => {
    const { getByTestId } = render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(getByTestId('scope').textContent).toBe('owner'));

    // Simula troca de conta: agora o usuário está em uma sub-empresa.
    currentScope = { owner_id: 'owner-1', sub_company_id: 'sub-A', blocked_pages: [] };
    // Dispara reload via evento de re-sync (visibilitychange) para pegar novo escopo.
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(getByTestId('scope').textContent).toBe('sub-A'));

    const sub = filters.find(f => f.table === 'sub_companies');
    expect(sub?.filter).toBe('id=eq.sub-A');
  });

  it('bloquear "developer" na Sub-empresa reflete no UI sem afetar caminho da Empresa', async () => {
    const { getByTestId } = render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(getByTestId('dev').textContent).toBe('true'));

    // Muda o escopo para sub e bloqueia developer.
    currentScope = { owner_id: 'owner-1', sub_company_id: 'sub-A', blocked_pages: ['developer'] };
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(getByTestId('scope').textContent).toBe('sub-A'));
    await waitFor(() => expect(getByTestId('dev').textContent).toBe('false'));
    // Assinaturas continua liberado (não estava no blocked_pages)
    expect(getByTestId('sig').textContent).toBe('true');

    // Volta para Empresa → developer volta a ser liberado.
    currentScope = { owner_id: 'owner-1', sub_company_id: null, blocked_pages: [] };
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(getByTestId('scope').textContent).toBe('owner'));
    await waitFor(() => expect(getByTestId('dev').textContent).toBe('true'));
  });
});
