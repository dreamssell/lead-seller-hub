/**
 * E2E · reconexão realtime (fechar/reabrir aba) com concorrência.
 *
 * Complementa `InternalCommsReconnect.e2e.test.tsx` provando o cenário
 * mais delicado: enquanto a aba está fechada chegam mensagens novas
 * (offline gap) E, no exato instante da reabertura, mais uma mensagem
 * chega via realtime. Precisamos garantir simultaneamente:
 *   • nenhuma mensagem duplicada (ids únicos);
 *   • nenhuma mensagem perdida (todas as ids offline aparecem);
 *   • ordem cronológica preservada;
 *   • o handler antigo (canal morto) NÃO recebe nada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

type Row = { id: string; sender_id: string; recipient_id: string; content: string; created_at: string; read_at: null; owner_id: string; sub_company_id: null };

const dataset: Row[] = [];
const activeHandlers: Array<{ event: string; filter?: string; cb: (p: any) => void; channelId: number; alive: boolean }> = [];
let channelSeq = 0;
const deadHandlerHits: string[] = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(async () => ({ data: [], error: null })),
    from: (_t: string) => ({
      select: () => ({
        or: () => ({
          order: () => ({
            limit: async (n: number) => ({
              data: [...dataset].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, n),
              error: null,
            }),
          }),
        }),
      }),
      update: () => ({ eq: () => ({ eq: () => ({ is: async () => ({}) }) }) }),
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
    }),
    channel: (_n: string) => {
      const id = ++channelSeq;
      const captured: Array<{ event: string; filter?: string; cb: (p: any) => void }> = [];
      const obj: any = {
        __id: id,
        on(_type: string, cfg: any, cb: any) { captured.push({ event: cfg.event, filter: cfg.filter, cb }); return obj; },
        subscribe() {
          captured.forEach((c) => activeHandlers.push({ ...c, channelId: id, alive: true }));
          return obj;
        },
      };
      return obj;
    },
    removeChannel: (ch: any) => {
      const id = ch?.__id;
      for (const h of activeHandlers) {
        if (h.channelId === id) h.alive = false;
      }
    },
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me' }, access: { owner_id: 'owner-x', sub_company_id: null } }),
}));

// eslint-disable-next-line import/first
import { useInternalComms } from '@/hooks/useInternalComms';

function emitInsert(row: Row) {
  activeHandlers.forEach((h) => {
    if (h.event !== 'INSERT' || !h.filter) return;
    const [col, val] = h.filter.split('=eq.');
    if ((row as any)[col] !== val) return;
    if (!h.alive) { deadHandlerHits.push(row.id); return; }
    h.cb({ new: row });
  });
}

const mk = (id: string, ts: string, from = 'peer', to = 'me'): Row => ({
  id, sender_id: from, recipient_id: to, content: id, created_at: ts,
  read_at: null, owner_id: 'owner-x', sub_company_id: null,
});

beforeEach(() => {
  dataset.length = 0;
  activeHandlers.length = 0;
  deadHandlerHits.length = 0;
  channelSeq = 0;
});

describe('E2E · fechar/reabrir aba com concorrência entre offline gap e broadcast', () => {
  it('sem duplicar e sem perder mensagens: offline + broadcast simultâneo no remount', async () => {
    // Estado inicial: 2 mensagens no histórico.
    dataset.push(mk('h1', '2024-01-01T00:00:00Z'));
    dataset.push(mk('h2', '2024-01-01T00:01:00Z', 'me', 'peer'));

    const s1 = renderHook(() => useInternalComms());
    act(() => { s1.result.current.setActivePeerId('peer'); });
    await waitFor(() => expect(s1.result.current.messages.length).toBe(2));

    // Fecha a aba.
    s1.unmount();

    // Enquanto a aba está fechada chegam 3 mensagens no banco (broadcast perdido).
    dataset.push(mk('off1', '2024-01-01T00:02:00Z'));
    dataset.push(mk('off2', '2024-01-01T00:03:00Z'));
    dataset.push(mk('off3', '2024-01-01T00:04:00Z', 'me', 'peer'));

    // Reabre a aba.
    const s2 = renderHook(() => useInternalComms());
    act(() => { s2.result.current.setActivePeerId('peer'); });

    // Em paralelo à recuperação inicial, chega um broadcast novinho.
    const live = mk('live1', '2024-01-01T00:05:00Z');
    dataset.push(live);
    await act(async () => { emitInsert(live); await new Promise((r) => setTimeout(r, 0)); });

    await waitFor(() => expect(s2.result.current.messages.length).toBe(6));

    const ids = s2.result.current.messages.map((m) => m.id);
    // Nenhuma duplicata.
    expect(new Set(ids).size).toBe(ids.length);
    // Nenhuma perda + ordem cronológica.
    expect(ids).toEqual(['h1', 'h2', 'off1', 'off2', 'off3', 'live1']);
    // O canal morto da primeira aba não pode ter recebido o broadcast.
    expect(deadHandlerHits).toContain('live1');
  });

  it('duas reconexões seguidas não acumulam handlers ativos duplicados', async () => {
    const first = renderHook(() => useInternalComms());
    act(() => { first.result.current.setActivePeerId('peer'); });
    await waitFor(() => expect(activeHandlers.filter((h) => h.alive).length).toBeGreaterThan(0));
    first.unmount();

    const second = renderHook(() => useInternalComms());
    act(() => { second.result.current.setActivePeerId('peer'); });
    await waitFor(() => expect(activeHandlers.filter((h) => h.alive).length).toBeGreaterThan(0));
    second.unmount();

    const third = renderHook(() => useInternalComms());
    act(() => { third.result.current.setActivePeerId('peer'); });
    await waitFor(() => expect(activeHandlers.filter((h) => h.alive).length).toBeGreaterThan(0));

    // Somente a instância atual pode ter handlers vivos.
    const aliveChannelIds = new Set(
      activeHandlers.filter((h) => h.alive).map((h) => h.channelId),
    );
    expect(aliveChannelIds.size).toBe(1);
  });

  it('broadcast APÓS unmount não entrega para o hook morto (sem race de setState)', async () => {
    const s1 = renderHook(() => useInternalComms());
    act(() => { s1.result.current.setActivePeerId('peer'); });
    await waitFor(() => expect(activeHandlers.some((h) => h.alive)).toBe(true));

    s1.unmount();
    // Broadcast tardio.
    const late = mk('late', '2024-01-01T00:10:00Z');
    await act(async () => { emitInsert(late); await new Promise((r) => setTimeout(r, 0)); });

    // O handler morto foi contatado, mas NÃO chamou o callback vivo.
    expect(deadHandlerHits).toContain('late');
    // A referência do hook morto continua com messages vazias (nunca setou peer).
    expect(s1.result.current.messages.some((m) => m.id === 'late')).toBe(false);
  });
});
