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
 *   3. O eco da própria mensagem na aba de Ana é entregue e deduplicado por
 *      id (o INSERT-local + o INSERT-realtime não duplicam a bolha).
 *
 * Como não há servidor Realtime em unit-test, encaminhamos payloads entre
 * as duas instâncias através de um barramento em memória. É o mesmo formato
 * que o Postgres Changes entrega, então cobre o contrato do hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ── Barramento realtime compartilhado entre as duas sessões ─────────────────
type Handler = { event: string; filter?: string; cb: (p: any) => void };
const handlersByUser: Record<string, Handler[]> = {};
let currentUserId = '';

function emitInsert(row: any) {
  // Entrega para todo handler cujo filter case (recipient_id ou sender_id).
  Object.values(handlersByUser).flat().forEach((h) => {
    if (h.event !== 'INSERT' || !h.filter) return;
    const [col, val] = h.filter.split('=eq.');
    if ((row as any)[col] === val) h.cb({ new: row });
  });
}

// ── Mock supabase ───────────────────────────────────────────────────────────
const insertedRows: any[] = [];
let msgIdCounter = 0;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (_t: string) => ({
      select: () => ({
        or: () => ({
          order: () => ({ limit: async () => ({ data: [] }) }),
        }),
      }),
      update: () => ({ eq: () => ({ eq: () => ({ is: async () => ({}) }) }) }),
      insert: (row: any) => ({
        select: () => ({
          single: async () => {
            const full = { id: `m${++msgIdCounter}`, created_at: new Date().toISOString(), read_at: null, ...row };
            insertedRows.push(full);
            // Emula postgres_changes broadcast APÓS o insert ter retornado.
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
        subscribe() {
          handlersByUser[currentUserId] = (handlersByUser[currentUserId] || []).concat(captured);
          return obj;
        },
      };
      return obj;
    },
    removeChannel: vi.fn(),
    rpc: vi.fn(async () => ({ data: [], error: null })),
  },
}));

// AuthContext dinâmico — trocamos o `user` por instância.
const authRef = { user: { id: '' }, access: { owner_id: 'owner-x', sub_company_id: null } };
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authRef,
}));

// eslint-disable-next-line import/first
import { useInternalComms } from '@/hooks/useInternalComms';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';
const CARLA = 'user-carla';

function mountSession(userId: string) {
  currentUserId = userId;
  authRef.user = { id: userId };
  return renderHook(() => useInternalComms());
}

beforeEach(() => {
  Object.keys(handlersByUser).forEach((k) => delete handlersByUser[k]);
  insertedRows.length = 0;
  msgIdCounter = 0;
});

describe('Comunicação Interna · realtime entre duas abas simultâneas', () => {
  it('mensagem enviada por Ana aparece imediatamente na aba de Bruno na conversa correta', async () => {
    // Sessão do Bruno: já com conversa aberta com Ana.
    const bruno = mountSession(BRUNO);
    act(() => { bruno.result.current.setActivePeerId(ANA); });
    await waitFor(() => expect(bruno.result.current.activePeerId).toBe(ANA));

    // Sessão da Ana: conversa aberta com Bruno.
    const ana = mountSession(ANA);
    act(() => { ana.result.current.setActivePeerId(BRUNO); });
    await waitFor(() => expect(ana.result.current.activePeerId).toBe(BRUNO));

    // Ana envia — supabase.insert dispara broadcast síncrono via microtask.
    await act(async () => { await ana.result.current.sendMessage('oi Bruno'); });

    await waitFor(() => {
      expect(bruno.result.current.messages.map((m) => m.content)).toContain('oi Bruno');
    });

    // Sem duplicação na aba do remetente.
    const anaContents = ana.result.current.messages.filter((m) => m.content === 'oi Bruno');
    expect(anaContents.length).toBe(1);
  });

  it('mensagem para OUTRO peer não polui a thread ativa (isolamento entre conversas)', async () => {
    const bruno = mountSession(BRUNO);
    act(() => { bruno.result.current.setActivePeerId(ANA); }); // Bruno olhando conversa com Ana
    await waitFor(() => expect(bruno.result.current.activePeerId).toBe(ANA));

    const carla = mountSession(CARLA);
    act(() => { carla.result.current.setActivePeerId(BRUNO); });
    await waitFor(() => expect(carla.result.current.activePeerId).toBe(BRUNO));

    await act(async () => { await carla.result.current.sendMessage('só pra Bruno, não pra Ana'); });

    // A mensagem foi entregue ao Bruno (recipient), mas activePeer é Ana → não deve aparecer na thread.
    // Damos um tick pro microtask rodar.
    await new Promise((r) => setTimeout(r, 0));
    expect(bruno.result.current.messages.find((m) => m.sender_id === CARLA)).toBeUndefined();
  });
});
