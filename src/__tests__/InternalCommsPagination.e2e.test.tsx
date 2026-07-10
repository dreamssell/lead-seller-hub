/**
 * E2E · Ordenação cronológica e entrega incremental de mensagens antigas.
 *
 * Cenário: usuário abre a conversa com um colega que já possui muitas
 * mensagens antigas no histórico. Precisamos garantir:
 *   1. `useInternalComms` devolve as mensagens em ordem cronológica
 *      crescente (created_at ASC) — a UI depende disso para renderizar as
 *      bolhas na ordem certa.
 *   2. Mensagens que chegam via realtime DEPOIS do fetch inicial são
 *      anexadas ao final (entrega incremental, sem reordenar histórico).
 *   3. O limite de carga inicial (batch) é respeitado — não puxa a coleção
 *      inteira de uma vez, evitando travar a aba em conversas com milhares
 *      de mensagens.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ── Mock supabase com dataset ordenável ────────────────────────────────────
type Row = { id: string; sender_id: string; recipient_id: string; content: string; created_at: string; read_at: null; owner_id: string; sub_company_id: null };
let dataset: Row[] = [];
let lastLimit = 0;
const rtHandlers: Array<{ event: string; filter?: string; cb: (p: any) => void }> = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(async () => ({ data: [], error: null })),
    from: (_t: string) => ({
      select: () => ({
        or: () => ({
          order: (_col: string, opts: any) => ({
            limit: async (n: number) => {
              lastLimit = n;
              const sorted = [...dataset].sort((a, b) =>
                opts?.ascending === false
                  ? b.created_at.localeCompare(a.created_at)
                  : a.created_at.localeCompare(b.created_at)
              );
              return { data: sorted.slice(0, n), error: null };
            },
          }),
        }),
      }),
      update: () => ({ eq: () => ({ eq: () => ({ is: async () => ({}) }) }) }),
      insert: (row: any) => ({
        select: () => ({
          single: async () => {
            const full: Row = { id: `new-${Date.now()}`, created_at: new Date().toISOString(), read_at: null, ...row };
            return { data: full, error: null };
          },
        }),
      }),
    }),
    channel: () => {
      const obj: any = {
        on(_type: string, cfg: any, cb: any) { rtHandlers.push({ event: cfg.event, filter: cfg.filter, cb }); return obj; },
        subscribe() { return obj; },
      };
      return obj;
    },
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me' }, access: { owner_id: 'owner-x', sub_company_id: null } }),
}));

// eslint-disable-next-line import/first
import { useInternalComms } from '@/hooks/useInternalComms';

function makeHistory(peerId: string, meId: string, count: number): Row[] {
  const base = Date.parse('2024-01-01T00:00:00.000Z');
  return Array.from({ length: count }).map((_, i) => ({
    id: `h${i}`,
    sender_id: i % 2 === 0 ? peerId : meId,
    recipient_id: i % 2 === 0 ? meId : peerId,
    content: `msg #${i}`,
    created_at: new Date(base + i * 60_000).toISOString(),
    read_at: null,
    owner_id: 'owner-x',
    sub_company_id: null,
  }));
}

function emitInsert(row: Row) {
  rtHandlers.forEach((h) => {
    if (h.event !== 'INSERT' || !h.filter) return;
    const [col, val] = h.filter.split('=eq.');
    if ((row as any)[col] === val) h.cb({ new: row });
  });
}

beforeEach(() => { dataset = []; lastLimit = 0; rtHandlers.length = 0; });

describe('/internal-comms · ordenação cronológica e carga incremental', () => {
  it('carrega histórico em ordem crescente por created_at', async () => {
    dataset = makeHistory('peer', 'me', 20);
    // Embaralha o dataset para provar que a ordenação vem do fetch, não do storage.
    dataset.sort(() => Math.random() - 0.5);

    const { result } = renderHook(() => useInternalComms());
    act(() => { result.current.setActivePeerId('peer'); });

    await waitFor(() => expect(result.current.messages.length).toBe(20));
    const times = result.current.messages.map((m) => m.created_at);
    const sorted = [...times].sort();
    expect(times).toEqual(sorted);
    expect(result.current.messages[0].content).toBe('msg #0');
    expect(result.current.messages[19].content).toBe('msg #19');
  });

  it('respeita limite máximo de carga inicial (não puxa coleção inteira)', async () => {
    dataset = makeHistory('peer', 'me', 5000);

    const { result } = renderHook(() => useInternalComms());
    act(() => { result.current.setActivePeerId('peer'); });

    await waitFor(() => expect(result.current.messages.length).toBeGreaterThan(0));
    // Contrato atual do hook: batch inicial ≤ 500. Se subir esse teto,
    // o teste força uma discussão consciente (não silenciosa) sobre custo.
    expect(lastLimit).toBeLessThanOrEqual(500);
    expect(result.current.messages.length).toBeLessThanOrEqual(500);
  });

  it('mensagens novas via realtime são anexadas ao FINAL, sem reordenar histórico', async () => {
    dataset = makeHistory('peer', 'me', 5);
    const { result } = renderHook(() => useInternalComms());
    act(() => { result.current.setActivePeerId('peer'); });

    await waitFor(() => expect(result.current.messages.length).toBe(5));
    const beforeIds = result.current.messages.map((m) => m.id);

    const later: Row = {
      id: 'live-1', sender_id: 'peer', recipient_id: 'me',
      content: 'chegou agora', created_at: new Date().toISOString(),
      read_at: null, owner_id: 'owner-x', sub_company_id: null,
    };
    await act(async () => { emitInsert(later); await new Promise((r) => setTimeout(r, 0)); });

    const after = result.current.messages;
    expect(after.length).toBe(6);
    // Histórico permanece intacto no início:
    expect(after.slice(0, 5).map((m) => m.id)).toEqual(beforeIds);
    // Nova mensagem no final:
    expect(after[after.length - 1].content).toBe('chegou agora');
  });
});
