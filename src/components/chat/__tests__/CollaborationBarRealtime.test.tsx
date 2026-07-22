/**
 * E2E-style integration test: CollaborationBar reacts in real time.
 *
 * Simulates the backend closeConversation / transfer flow by:
 *  1. Mounting <CollaborationBar/> for a customer.
 *  2. Letting the initial load run.
 *  3. Dispatching Realtime events on the mocked supabase channel for
 *     `lead_assignments` and `customers` and asserting the component
 *     re-fetches (i.e. the UI updates without a page reload).
 *
 * The subcomponents used by CollaborationBar are stubbed so this test
 * targets only the realtime plumbing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';

// --- Stub heavy children so we only exercise CollaborationBar's own effect. ---
vi.mock('@/components/chat/PrioritySelect', () => ({
  PrioritySelect: () => <div data-testid="priority" />,
}));
vi.mock('@/components/chat/TicketStatusSelect', () => ({
  TicketStatusSelect: () => <div data-testid="status" />,
}));
vi.mock('@/components/chat/TagPicker', () => ({
  TagPicker: () => <div data-testid="tags" />,
}));
vi.mock('@/components/chat/SlaTimer', () => ({
  SlaTimer: () => <div data-testid="sla" />,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// --- Fake Realtime bus wired into a mocked supabase client. ---
type Handler = (payload: any) => void;
type ChannelSub = { table: string; filter?: string; handler: Handler };
const bus = {
  subs: [] as ChannelSub[],
  fetches: 0,
  reset() {
    this.subs = [];
    this.fetches = 0;
    removeChannel.mockClear();
  },
  dispatch(table: string, payload: any) {
    for (const s of this.subs) if (s.table === table) s.handler(payload);
  },
};

const removeChannel = vi.fn();

function fakeChannel() {
  const pending: ChannelSub[] = [];
  const api: any = {
    on: (_event: string, cfg: any, handler: Handler) => {
      pending.push({ table: cfg.table, filter: cfg.filter, handler });
      return api;
    },
    subscribe: () => {
      bus.subs.push(...pending);
      return api;
    },
  };
  return api;
}

// Customer row returned by every `.from('customers').select().eq().maybeSingle()`
const customerRow = {
  id: 'cust-1',
  owner_id: 'own-1',
  assigned_to: null,
  queue_id: null,
  priority: 'medium',
  ticket_status: 'open',
  tags: [],
  sla_first_response_due_at: null,
  sla_next_response_due_at: null,
  sla_resolution_due_at: null,
  ai_handoff: null,
};

function customersBuilder() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => {
          bus.fetches += 1;
          return { data: customerRow };
        },
      }),
    }),
    update: () => ({ eq: async () => ({ error: null }) }),
  };
}

function profilesBuilder() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: null }),
      }),
    }),
  };
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: () => fakeChannel(),
    removeChannel: (...a: any[]) => removeChannel(...a),
    from: (table: string) => {
      if (table === 'customers') return customersBuilder();
      if (table === 'profiles') return profilesBuilder();
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
      };
    },
    functions: { invoke: async () => ({ data: null }) },
  },
}));

import { CollaborationBar } from '@/components/chat/CollaborationBar';

describe('CollaborationBar realtime sync', () => {
  beforeEach(() => {
    bus.reset();
    cleanup();
  });

  it('subscribes to customers + lead_assignments filtered by customerId', async () => {
    render(
      <CollaborationBar
        customerId="cust-1"
        onOpenTransfer={() => {}}
        onClose={() => {}}
        isSupervisor={false}
        currentUserId="user-1"
      />,
    );
    await waitFor(() => expect(bus.fetches).toBeGreaterThanOrEqual(1));
    const tables = bus.subs.map((s) => s.table).sort();
    expect(tables).toEqual(['customers', 'lead_assignments']);
    for (const s of bus.subs) {
      expect(s.filter).toContain('cust-1');
    }
  });

  it('re-fetches the customer when a lead_assignments event fires (close/transfer)', async () => {
    render(
      <CollaborationBar
        customerId="cust-1"
        onOpenTransfer={() => {}}
        onClose={() => {}}
        isSupervisor={false}
        currentUserId="user-1"
      />,
    );
    await waitFor(() => expect(bus.fetches).toBeGreaterThanOrEqual(1));
    const initial = bus.fetches;

    // Simulate the backend closeConversation firing on lead_assignments.
    bus.dispatch('lead_assignments', {
      eventType: 'UPDATE',
      new: { customer_id: 'cust-1', stage: 'closed' },
    });
    await waitFor(() => expect(bus.fetches).toBeGreaterThan(initial));

    // Simulate a transfer touching the customer row directly.
    const afterClose = bus.fetches;
    bus.dispatch('customers', {
      eventType: 'UPDATE',
      new: { id: 'cust-1', assigned_to: 'user-2' },
    });
    await waitFor(() => expect(bus.fetches).toBeGreaterThan(afterClose));
  });

  it('removes the realtime channel on unmount to avoid leaks', async () => {
    const { unmount } = render(
      <CollaborationBar
        customerId="cust-1"
        onOpenTransfer={() => {}}
        onClose={() => {}}
        isSupervisor={false}
        currentUserId="user-1"
      />,
    );
    await waitFor(() => expect(bus.subs.length).toBe(2));
    unmount();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });
});
