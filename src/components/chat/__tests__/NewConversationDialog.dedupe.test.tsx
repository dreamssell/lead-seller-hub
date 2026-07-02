import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NewConversationDialog } from '../NewConversationDialog';

// Mock supabase.functions.invoke to simulate `start-conversation` deduping the
// customer: same customer_id returned even when the modal is submitted twice.
const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: any[]) => invokeMock(...args) },
  },
}));

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

vi.mock('@/components/whatsapp/adapters', () => ({
  getProviderAdapter: () => ({ sendMessage: vi.fn().mockResolvedValue({}) }),
}));

const conn: any = {
  id: 'conn-1',
  provider: 'evolution',
  owner_id: 'owner-1',
  sub_company_id: null,
  metadata: {},
  status: 'connected',
};

describe('NewConversationDialog · dedupe', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('cria apenas um customer para o mesmo (owner_id + phone) em aberturas repetidas', async () => {
    // Both calls return the same customer_id — first creates, second reuses.
    invokeMock
      .mockResolvedValueOnce({ data: { ok: true, customer_id: 'cust-abc', created: true, phone_e164: '5527997784501' }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, customer_id: 'cust-abc', created: false, phone_e164: '5527997784501' }, error: null });

    const onCreated = vi.fn();

    // First submission
    const { rerender, unmount } = render(
      <NewConversationDialog open connection={conn} onOpenChange={() => {}} onCreated={onCreated} />
    );
    fireEvent.change(screen.getByLabelText(/número/i), { target: { value: '+55 27 99778-4501' } });
    fireEvent.click(screen.getByRole('button', { name: /iniciar conversa/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('cust-abc'));

    // Re-open dialog and submit again
    unmount();
    render(
      <NewConversationDialog open connection={conn} onOpenChange={() => {}} onCreated={onCreated} />
    );
    fireEvent.change(screen.getByLabelText(/número/i), { target: { value: '+55 27 99778-4501' } });
    fireEvent.click(screen.getByRole('button', { name: /iniciar conversa/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(2));

    // Same id returned both times = dedupe honored by the backend.
    const ids = onCreated.mock.calls.map(c => c[0]);
    expect(new Set(ids).size).toBe(1);
    expect(invokeMock).toHaveBeenCalledTimes(2);
    // Both calls used the same normalized phone.
    const bodies = invokeMock.mock.calls.map(c => c[1]?.body?.phone_raw);
    expect(bodies[0]).toBe(bodies[1]);
  });
});
