/**
 * E2E · Realtime entre duas sessões abertas simultaneamente.
 *
 * Simula duas instâncias do hook `useInternalComms` — uma para o remetente
 * (Ana) e outra para o destinatário (Bruno) — compartilhando o mesmo canal
 * de postgres_changes. Garantimos que:
 *   1. Uma mensagem enviada por Ana para Bruno chega imediatamente na aba de
 *      Bruno, na conversa correta (activePeer = Ana), sem depender de
 *      refetch manual.
 *   2. Mensagens destinadas a OUTRO peer (Carla) NÃO aparecem na thread ativa
 *      de Bruno — evita cross-talk entre conversas abertas em paralelo.
 *
 * Como não há servidor Realtime em unit-test, encaminhamos payloads entre as
 * duas instâncias através de um barramento em memória. É o mesmo formato que
 * o Postgres Changes entrega, então cobre o contrato do hook.
 *
 * Isolamento por instância: cada `renderHook` recebe seu próprio `TestAuthCtx`
 * (via wrapper) para não vazar `user.id` entre as duas abas simuladas.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ── Barramento realtime compartilhado entre as duas sessões ─────────────────
type Handler = { event: string; filter?: string; cb: (p: any) => void };
const allHandlers: Handler[] = [];

function emitInsert(row: any) {
  allHandlers.forEach((h) => {
    if (h.event !== 'INSERT' || !h.filter) return;
    const [col, val] = h.filter.split('=eq.');
    if ((row as any)[col] === val) h.cb({ new: row });
  });
}

// ── Mock supabase ───────────────────────────────────────────────────────────
let msgIdCounter = 0;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (_t: string) => ({
      select: () => ({
        or: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }),
      }),
      update: () => ({ eq: () => ({ eq: () => ({ is: async () => ({}) }) }) }),
      insert: (row: any) => ({
        select: () => ({
          single: async () => {
            const full = { id: `m${++msgIdCounter}`, created_at: new Date().toISOString(), read_at: null, ...row };
            queueMicrotask(() => emitInsert(full));
            return { data: full, error: null };
          },
        }),
      }),
    }),
    channel: (_name: string) => {
      const captured: Handler[] = [];
      const obj: any = {
        on(_type: string, cfg: any, cb: any) { captured.push({ event: cfg.event, filter: cfg.filter, cb }); return obj; },
        subscribe() { allHandlers.push(...captured); return obj; },
      };
      return obj;
    },
    removeChannel: vi.fn(),
    rpc: vi.fn(async () => ({ data: [], error: null })),
  },
}));

// AuthContext por-instância via React Context
const TestAuthCtx = React.createContext<any>({ user: null, access: null });
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => React.useContext(TestAuthCtx),
}));

// eslint-disable-next-line import/first
import { useInternalComms } from '@/hooks/useInternalComms';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
const CARLA = 'user-carla';

function mountSession(userId: string) {
  const value = { user: { id: userId }, access: { owner_id: 'owner-x', sub_company_id: null } };
  return renderHook(() => useInternalComms(), {
    wrapper: ({ children }) => React.createElement(TestAuthCtx.Provider, { value }, children as any),
  });
}

beforeEach(() => {
  allHandlers.length = 0;
  msgIdCounter = 0;
});

describe('Comunicação Interna · realtime entre duas abas simultâneas', () => {
  it('mensagem enviada por Ana aparece imediatamente na aba de Bruno na conversa correta', async () => {
    const bruno = mountSession(BRUNO);
    act(() => { bruno.result.current.setActivePeerId(ANA); });
    await waitFor(() => expect(bruno.result.current.activePeerId).toBe(ANA));

    const ana = mountSession(ANA);
    act(() => { ana.result.current.setActivePeerId(BRUNO); });
    await waitFor(() => expect(ana.result.current.activePeerId).toBe(BRUNO));

    await act(async () => {
      await ana.result.current.sendMessage('oi Bruno');
      await new Promise((r) => setTimeout(r, 0));
    });

    await waitFor(() => {
      expect(bruno.result.current.messages.map((m) => m.content)).toContain('oi Bruno');
    });

    // Dedup na aba do remetente (insert local + broadcast realtime = 1 bolha só).
    const anaContents = ana.result.current.messages.filter((m) => m.content === 'oi Bruno');
    expect(anaContents.length).toBe(1);
  });

  it('mensagem para OUTRO peer não polui a thread ativa (isolamento entre conversas)', async () => {
    const bruno = mountSession(BRUNO);
    act(() => { bruno.result.current.setActivePeerId(ANA); });
    await waitFor(() => expect(bruno.result.current.activePeerId).toBe(ANA));

    const carla = mountSession(CARLA);
    act(() => { carla.result.current.setActivePeerId(BRUNO); });
    await waitFor(() => expect(carla.result.current.activePeerId).toBe(BRUNO));

    await act(async () => {
      await carla.result.current.sendMessage('só pra Bruno, não pra Ana');
      await new Promise((r) => setTimeout(r, 0));
    });

    // Bruno está olhando a conversa com Ana — mensagem de Carla NÃO deve entrar na thread.
    expect(bruno.result.current.messages.find((m) => m.sender_id === CARLA)).toBeUndefined();
  });
});
