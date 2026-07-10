/**
 * E2E · stress · múltiplas reconexões + bursts de mensagens no mesmo chat.
 *
 * Simula um cenário de "carga real":
 *  • 5 ciclos de close/reopen da aba (unmount/remount do hook);
 *  • em cada ciclo, um burst de N mensagens chega enquanto a aba está
 *    fechada (offline gap), e outro burst chega imediatamente após o
 *    remount via canal ativo (broadcast realtime);
 *  • ao final: nenhuma duplicata, nenhuma perda, ordem cronológica
 *    preservada e apenas o último canal permanece vivo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

type Row = {
  id: string; sender_id: string; recipient_id: string; content: string;
  created_at: string; read_at: null; owner_id: string; sub_company_id: null;
};

const dataset: Row[] = [];
const activeHandlers: Array<{ event: string; filter?: string; cb: (p: any) => void; channelId: number; alive: boolean }> = [];
let channelSeq = 0;

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
        subscribe() { captured.forEach((c) => activeHandlers.push({ ...c, channelId: id, alive: true })); return obj; },
      };
      return obj;
    },
    removeChannel: (ch: any) => {
      const id = ch?.__id;
      for (const h of activeHandlers) if (h.channelId === id) h.alive = false;
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
    if (!h.alive || h.event !== 'INSERT' || !h.filter) return;
    const [col, val] = h.filter.split('=eq.');
    if ((row as any)[col] !== val) return;
    h.cb({ new: row });
  });
}

let seqTs = 0;
const mkRow = (from = 'peer', to = 'me'): Row => {
  seqTs += 1;
  const iso = new Date(Date.UTC(2024, 0, 1) + seqTs * 1000).toISOString();
  return {
    id: `m-${seqTs}`, sender_id: from, recipient_id: to, content: `c-${seqTs}`,
    created_at: iso, read_at: null, owner_id: 'owner-x', sub_company_id: null,
  };
};

beforeEach(() => {
  dataset.length = 0;
  activeHandlers.length = 0;
  channelSeq = 0;
  seqTs = 0;
});

describe('E2E · stress · reconexões + bursts', () => {
  it('5 ciclos de close/reopen com bursts offline+live não duplicam nem perdem', async () => {
    // Seed inicial de 3 mensagens.
    for (let i = 0; i < 3; i++) dataset.push(mkRow(i % 2 === 0 ? 'peer' : 'me', i % 2 === 0 ? 'me' : 'peer'));

    // Primeira montagem: consome o seed.
    let session = renderHook(() => useInternalComms());
    act(() => { session.result.current.setActivePeerId('peer'); });
    await waitFor(() => expect(session.result.current.messages.length).toBe(3));

    const CYCLES = 5;
    const OFFLINE_PER_CYCLE = 8;
    const LIVE_PER_CYCLE = 6;

    for (let c = 0; c < CYCLES; c++) {
      // Fecha a aba.
      session.unmount();

      // Burst offline (chega no dataset enquanto a aba está fechada).
      for (let i = 0; i < OFFLINE_PER_CYCLE; i++) {
        dataset.push(mkRow(i % 2 === 0 ? 'peer' : 'me', i % 2 === 0 ? 'me' : 'peer'));
      }

      // Reabre.
      session = renderHook(() => useInternalComms());
      act(() => { session.result.current.setActivePeerId('peer'); });

      // Espera o refetch consumir todo o histórico acumulado.
      const expectedAfterRefetch = 3 + (c + 1) * OFFLINE_PER_CYCLE + c * LIVE_PER_CYCLE;
      await waitFor(() => expect(session.result.current.messages.length).toBe(expectedAfterRefetch));

      // Burst live via broadcast pelo canal recém-aberto.
      const liveRows: Row[] = [];
      for (let i = 0; i < LIVE_PER_CYCLE; i++) {
        const r = mkRow(i % 2 === 0 ? 'peer' : 'me', i % 2 === 0 ? 'me' : 'peer');
        dataset.push(r);
        liveRows.push(r);
      }
      await act(async () => {
        liveRows.forEach(emitInsert);
        await new Promise((r) => setTimeout(r, 0));
      });

      const expectedAfterLive = expectedAfterRefetch + LIVE_PER_CYCLE;
      await waitFor(() => expect(session.result.current.messages.length).toBe(expectedAfterLive));
    }

    // Invariantes finais.
    const finalIds = session.result.current.messages.map((m) => m.id);
    // 1) Sem duplicatas.
    expect(new Set(finalIds).size).toBe(finalIds.length);
    // 2) Sem perda: contém todas as ids do dataset relevantes ao par.
    const datasetIds = dataset.map((r) => r.id);
    for (const id of datasetIds) expect(finalIds).toContain(id);
    // 3) Ordem cronológica preservada.
    const timestamps = session.result.current.messages.map((m) => m.created_at);
    const sorted = [...timestamps].sort();
    expect(timestamps).toEqual(sorted);
    // 4) Apenas o canal atual está vivo (sem vazamento de assinaturas).
    const aliveChannels = new Set(activeHandlers.filter((h) => h.alive).map((h) => h.channelId));
    expect(aliveChannels.size).toBe(1);
  });

  it('burst simultâneo de 100 broadcasts no mesmo canal não gera duplicata', async () => {
    const session = renderHook(() => useInternalComms());
    act(() => { session.result.current.setActivePeerId('peer'); });
    await waitFor(() => expect(activeHandlers.some((h) => h.alive)).toBe(true));

    const burst: Row[] = [];
    for (let i = 0; i < 100; i++) {
      const r = mkRow('peer', 'me');
      dataset.push(r);
      burst.push(r);
    }
    // Emite todos "ao mesmo tempo" + reemite os primeiros 20 (duplicatas realistas do transporte).
    await act(async () => {
      burst.forEach(emitInsert);
      burst.slice(0, 20).forEach(emitInsert);
      await new Promise((r) => setTimeout(r, 0));
    });

    await waitFor(() => expect(session.result.current.messages.length).toBe(100));
    const ids = session.result.current.messages.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
