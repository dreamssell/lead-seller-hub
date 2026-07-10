/**
 * Testes do hook `useInternalCommsUnread`.
 *
 * Foco:
 *  - Total consolidado somando todas as conversas (badge do card no dashboard).
 *  - Mapa por peer (badge por conversa na página /internal-comms).
 *  - Atualização realtime ao chegar mensagem nova (INSERT).
 *  - `clearPeer` zera o contador daquela conversa sem afetar as demais.
 *  - Realtime é reciclado (removeChannel) ao desmontar para evitar leaks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const rpcMock = vi.fn();
const removeChannelMock = vi.fn();

type Handler = (payload: any) => void;
const handlers: { event: string; filter?: string; cb: Handler }[] = [];

const channelObj: any = {
  on: vi.fn((_type: string, cfg: any, cb: Handler) => {
    handlers.push({ event: cfg.event, filter: cfg.filter, cb });
    return channelObj;
  }),
  subscribe: vi.fn(() => channelObj),
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: any[]) => rpcMock(...args),
    channel: vi.fn(() => channelObj),
    removeChannel: (...args: any[]) => removeChannelMock(...args),
  },
}));

const ME = 'user-me';
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: ME } }),
}));

// eslint-disable-next-line import/first
import { useInternalCommsUnread } from './useInternalCommsUnread';

beforeEach(() => {
  rpcMock.mockReset();
  removeChannelMock.mockReset();
  handlers.length = 0;
  channelObj.on.mockClear();
  channelObj.subscribe.mockClear();
});

describe('useInternalCommsUnread', () => {
  it('carrega contagem inicial via RPC e consolida total', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        { peer_id: 'peer-A', unread_count: 3 },
        { peer_id: 'peer-B', unread_count: 5 },
      ],
      error: null,
    });

    const { result } = renderHook(() => useInternalCommsUnread());

    await waitFor(() => {
      expect(result.current.total).toBe(8);
    });
    expect(result.current.countByPeer).toEqual({ 'peer-A': 3, 'peer-B': 5 });
    expect(rpcMock).toHaveBeenCalledWith('internal_comms_unread_counts');
  });

  it('incrementa contador do peer correto ao receber INSERT realtime', async () => {
    rpcMock.mockResolvedValueOnce({ data: [{ peer_id: 'peer-A', unread_count: 1 }], error: null });

    const { result } = renderHook(() => useInternalCommsUnread());
    await waitFor(() => expect(result.current.total).toBe(1));

    // handler de INSERT com filter recipient_id
    const insertHandler = handlers.find(
      (h) => h.event === 'INSERT' && h.filter?.startsWith('recipient_id='),
    );
    expect(insertHandler).toBeTruthy();

    act(() => {
      insertHandler!.cb({ new: { sender_id: 'peer-A', recipient_id: ME, id: 'm1' } });
      insertHandler!.cb({ new: { sender_id: 'peer-C', recipient_id: ME, id: 'm2' } });
    });

    expect(result.current.countByPeer).toEqual({ 'peer-A': 2, 'peer-C': 1 });
    expect(result.current.total).toBe(3);
  });

  it('clearPeer zera apenas a conversa alvo (badge por conversa independente)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        { peer_id: 'peer-A', unread_count: 2 },
        { peer_id: 'peer-B', unread_count: 4 },
      ],
      error: null,
    });

    const { result } = renderHook(() => useInternalCommsUnread());
    await waitFor(() => expect(result.current.total).toBe(6));

    act(() => { result.current.clearPeer('peer-A'); });

    expect(result.current.countByPeer).toEqual({ 'peer-B': 4 });
    expect(result.current.total).toBe(4);
  });

  it('UPDATE realtime dispara refresh (marcação como lida atualiza o card)', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: [{ peer_id: 'peer-A', unread_count: 3 }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const { result } = renderHook(() => useInternalCommsUnread());
    await waitFor(() => expect(result.current.total).toBe(3));

    const updateHandler = handlers.find((h) => h.event === 'UPDATE');
    expect(updateHandler).toBeTruthy();

    act(() => { updateHandler!.cb({ new: {} }); });

    await waitFor(() => expect(result.current.total).toBe(0));
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it('desmonta canal realtime ao unmount (sem leaks/reconnect loop)', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    const { unmount } = renderHook(() => useInternalCommsUnread());
    await waitFor(() => expect(channelObj.subscribe).toHaveBeenCalled());
    unmount();
    expect(removeChannelMock).toHaveBeenCalledTimes(1);
  });
});
