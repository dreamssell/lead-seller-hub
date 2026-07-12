import { act, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WahaLiveBadge } from './WahaLiveBadge';
import type { WhatsAppConnection } from './types';

const invokeMock = vi.fn();
let realtimeHandler: ((payload: any) => void) | null = null;

vi.mock('sonner', () => ({
  toast: {
    loading: vi.fn(() => 'toast-id'),
    dismiss: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: any[]) => invokeMock(...args) },
    channel: () => ({
      on: function (_event: string, _filter: any, handler: (payload: any) => void) {
        realtimeHandler = handler;
        return this;
      },
      subscribe: function (callback?: (status: string) => void) {
        callback?.('SUBSCRIBED');
        return this;
      },
    }),
    removeChannel: vi.fn(),
  },
}));

const connection: WhatsAppConnection = {
  id: 'conn-waha-1',
  provider: 'waha',
  display_name: 'WAHA Mult Seguros',
  status: 'connected',
  metadata: { session: 'mult-seguros' },
  owner_id: 'owner-1',
  sub_company_id: null,
};

describe('WahaLiveBadge — reconexão automática', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValue({ data: { ok: true, status: 'STARTING' }, error: null });
    realtimeHandler = null;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('força restart quando a sessão entra em FAILED sem remover o histórico/estado da conversa aberta', async () => {
    const { unmount } = render(<WahaLiveBadge conn={connection} />);

    await waitFor(() => expect(realtimeHandler).toBeTruthy());

    act(() => {
      realtimeHandler?.({
        new: {
          ...connection,
          status: 'FAILED',
          metadata: {
            session: 'mult-seguros',
            last_ack: { id: 'msg-1', status: 'delivered', at: '2026-07-12T12:00:00.000Z' },
            ack_history: [{ id: 'msg-1', status: 'delivered', at: '2026-07-12T12:00:00.000Z' }],
          },
        },
      });
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('waha-session', {
        body: { action: 'restart', connection_id: 'conn-waha-1' },
      });
    });

    expect(screen.getByTestId('waha-live-badge')).toHaveAttribute('data-testid', 'waha-live-badge');
    expect(screen.getByText(/Último ACK: Entregue/i)).toBeInTheDocument();
    expect(screen.getByText(/Histórico \(1\)/i)).toBeInTheDocument();

    unmount();
  });
});