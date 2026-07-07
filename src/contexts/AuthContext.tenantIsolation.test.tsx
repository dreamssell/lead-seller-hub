/**
 * Tenant isolation suite.
 *
 * These tests exercise the invariants that guarantee a user from one tenant
 * (owner_id / sub_company_id) can never see pages or data from another:
 *
 *   1. `canAccessPage` is deny-by-default when no access row is present.
 *   2. Blocked accounts and per-tenant blocked_pages are always honored.
 *   3. Sub-company allowed_pages/blocked_pages scope is respected and cannot
 *      be widened by the parent-company allowlist.
 *   4. Session revalidation (getUser) forces sign-out when the auth server
 *      reports a user id that does not match the local session (the exact
 *      scenario that would leak a previous owner's data into a new login).
 *   5. `sessionValidated` and `tenantResolved` gates start false and only
 *      flip to true after the identity + scope have been confirmed — so
 *      any consumer that respects the gate never renders cross-tenant data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import type { SidebarPageKey } from '@/lib/navigation';

type MockAccess = {
  owner_id: string;
  sub_company_id: string | null;
  sub_company_name: string | null;
  allowed_pages: SidebarPageKey[];
  is_account_admin: boolean;
  blocked_pages: string[];
  status: string;
  allow_custom_logic: boolean;
  feature_landing_builder: boolean;
};

// ── Mutable mock state ───────────────────────────────────────────────────────
let sessionUserId: string | null = 'user-tenantA';
let getUserId: string | null = 'user-tenantA';
let getUserError: { message: string } | null = null;
let mockAccess: MockAccess | null = {
  owner_id: 'owner-A',
  sub_company_id: null,
  sub_company_name: null,
  allowed_pages: [],
  is_account_admin: true,
  blocked_pages: [],
  status: 'active',
  allow_custom_logic: true,
  feature_landing_builder: true,
};
const signOutSpy = vi.fn(() => Promise.resolve());

vi.mock('@/integrations/supabase/client', () => {
  const channel = {
    on: vi.fn(function (this: any) { return this; }),
    subscribe: vi.fn(function (this: any, cb?: (s: string) => void) { cb?.('SUBSCRIBED'); return this; }),
  };
  return {
    supabase: {
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        getSession: () =>
          Promise.resolve({
            data: { session: sessionUserId ? { user: { id: sessionUserId } } : null },
          }),
        getUser: () =>
          Promise.resolve({
            data: { user: getUserId ? { id: getUserId } : null },
            error: getUserError,
          }),
        signOut: () => signOutSpy(),
      },
      rpc: vi.fn((fn: string) => {
        if (fn === 'get_my_account_access') {
          return Promise.resolve({ data: mockAccess ? [mockAccess] : [] });
        }
        if (fn === 'has_role') {
          return Promise.resolve({ data: false });
        }
        return Promise.resolve({ data: null });
      }),
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }),
        }),
      }),
      channel: () => channel,
      removeChannel: () => {},
    },
  };
});

type ProbeSnapshot = {
  sessionValidated: boolean;
  tenantResolved: boolean;
  ownerId: string | null | undefined;
  subId: string | null | undefined;
  allow: Partial<Record<SidebarPageKey, boolean>>;
};

function Probe({ pages, onSnapshot }: { pages: SidebarPageKey[]; onSnapshot: (s: ProbeSnapshot) => void }) {
  const { canAccessPage, access, sessionValidated, tenantResolved } = useAuth();
  const allow: Partial<Record<SidebarPageKey, boolean>> = {};
  for (const p of pages) allow[p] = canAccessPage(p);
  onSnapshot({
    sessionValidated,
    tenantResolved,
    ownerId: access?.owner_id,
    subId: access?.sub_company_id,
    allow,
  });
  return null;
}

function mount(pages: SidebarPageKey[]) {
  const snapshots: ProbeSnapshot[] = [];
  const utils = render(
    <AuthProvider>
      <Probe pages={pages} onSnapshot={(s) => snapshots.push(s)} />
    </AuthProvider>,
  );
  return { ...utils, snapshots, last: () => snapshots[snapshots.length - 1] };
}

const PAGES: SidebarPageKey[] = [
  'dashboard', 'chat', 'calls', 'tickets', 'team', 'cadastros',
  'ai-agents', 'reports', 'pipeline', 'ceo', 'settings', 'api-keys',
  'status', 'profile', 'signatures', 'developer', 'outros',
] as unknown as SidebarPageKey[];

beforeEach(() => {
  signOutSpy.mockClear();
  sessionUserId = 'user-tenantA';
  getUserId = 'user-tenantA';
  getUserError = null;
  mockAccess = {
    owner_id: 'owner-A',
    sub_company_id: null,
    sub_company_name: null,
    allowed_pages: [],
    is_account_admin: true,
    blocked_pages: [],
    status: 'active',
    allow_custom_logic: true,
    feature_landing_builder: true,
  };
});

describe('Tenant isolation · canAccessPage matrix', () => {
  it('default-deny: without an access row, only /profile is reachable', async () => {
    mockAccess = null;
    const { last } = mount(PAGES);
    await waitFor(() => expect(last().tenantResolved).toBe(true));
    const allow = last().allow;
    for (const p of PAGES) {
      if (p === 'profile') expect(allow[p]).toBe(true);
      else expect(allow[p]).toBe(false);
    }
  });

  it('blocked account only allows /profile even for an account admin', async () => {
    mockAccess = { ...mockAccess!, status: 'blocked' };
    const { last } = mount(PAGES);
    await waitFor(() => expect(last().tenantResolved).toBe(true));
    const allow = last().allow;
    expect(allow.profile).toBe(true);
    for (const p of PAGES.filter((x) => x !== 'profile')) expect(allow[p]).toBe(false);
  });

  it('sub-company blocked_pages are enforced even if user is account admin of the sub', async () => {
    mockAccess = {
      ...mockAccess!,
      sub_company_id: 'sub-A',
      is_account_admin: true,
      blocked_pages: ['reports', 'ai-agents', 'ceo'],
    };
    const { last } = mount(PAGES);
    await waitFor(() => expect(last().tenantResolved).toBe(true));
    const allow = last().allow;
    expect(allow.reports).toBe(false);
    expect(allow['ai-agents' as SidebarPageKey]).toBe(false);
    expect(allow.ceo).toBe(false);
    // still allowed
    expect(allow.dashboard).toBe(true);
    expect(allow.profile).toBe(true);
  });

  it('non-admin members are restricted to allowed_pages ∪ {profile}', async () => {
    mockAccess = {
      ...mockAccess!,
      sub_company_id: 'sub-A',
      is_account_admin: false,
      allowed_pages: ['chat', 'pipeline'] as SidebarPageKey[],
      blocked_pages: [],
    };
    const { last } = mount(PAGES);
    await waitFor(() => expect(last().tenantResolved).toBe(true));
    const allow = last().allow;
    expect(allow.chat).toBe(true);
    expect(allow.pipeline).toBe(true);
    expect(allow.profile).toBe(true);
    expect(allow.reports).toBe(false);
    expect(allow.settings).toBe(false);
    expect(allow.ceo).toBe(false);
  });

  it('feature flag: sub-company without landing builder cannot access "outros"', async () => {
    mockAccess = {
      ...mockAccess!,
      sub_company_id: 'sub-A',
      feature_landing_builder: false,
    };
    const { last } = mount(['outros' as SidebarPageKey, 'dashboard']);
    await waitFor(() => expect(last().tenantResolved).toBe(true));
    expect(last().allow['outros' as SidebarPageKey]).toBe(false);
    expect(last().allow.dashboard).toBe(true);
  });

  it('parent-company allowed_pages cannot widen a sub-company blocked_pages', async () => {
    // Backend already merges parent ∪ sub into blocked_pages before delivering.
    mockAccess = {
      ...mockAccess!,
      sub_company_id: 'sub-A',
      allowed_pages: ['reports', 'signatures'] as SidebarPageKey[],
      blocked_pages: ['reports'], // sub-level block
      is_account_admin: false,
    };
    const { last } = mount(['reports', 'signatures' as SidebarPageKey]);
    await waitFor(() => expect(last().tenantResolved).toBe(true));
    expect(last().allow.reports).toBe(false);
    expect(last().allow['signatures' as SidebarPageKey]).toBe(true);
  });
});

describe('Tenant isolation · session revalidation gate', () => {
  it('sessionValidated is true when getUser confirms the same user id', async () => {
    const { last } = mount(['profile']);
    await waitFor(() => expect(last().sessionValidated).toBe(true));
    expect(signOutSpy).not.toHaveBeenCalled();
  });

  it('sessionValidated stays false and signOut fires when getUser returns a different user id', async () => {
    // Auth server says the token actually belongs to another user (tenant B),
    // which is exactly the leak we must block.
    getUserId = 'user-tenantB';
    const { last } = mount(['profile', 'reports']);
    await waitFor(() => expect(signOutSpy).toHaveBeenCalled());
    // After forced sign-out access is cleared → canAccessPage returns
    // profile-only (deny-by-default).
    await waitFor(() => expect(last().sessionValidated).toBe(false));
  });

  it('sessionValidated stays false when getUser returns an error', async () => {
    getUserId = null;
    getUserError = { message: 'invalid token' };
    const { last } = mount(['profile']);
    await waitFor(() => expect(signOutSpy).toHaveBeenCalled());
    expect(last().sessionValidated).toBe(false);
  });

  it('scope switch: swapping the access row updates ownerId/subId reactively', async () => {
    const { last } = mount(['reports']);
    await waitFor(() => expect(last().ownerId).toBe('owner-A'));

    // Tenant switches (e.g. sub-empresa scope activated for the same user).
    mockAccess = {
      ...mockAccess!,
      owner_id: 'owner-A',
      sub_company_id: 'sub-B',
      blocked_pages: ['reports'],
    };
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(last().subId).toBe('sub-B'));
    expect(last().allow.reports).toBe(false);
  });
});
