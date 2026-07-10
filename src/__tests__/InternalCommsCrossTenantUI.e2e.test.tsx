/**
 * E2E · `/internal-comms` — isolamento cross-tenant no cliente autenticado.
 *
 * Complementa `InternalCommsCrossTenant.e2e.test.ts` (que valida a
 * camada REST/anon) simulando um usuário autenticado como Tenant A que
 * tenta ler mensagens do Tenant B por:
 *   1. Navegação direta ao hook com sessão do Tenant A;
 *   2. Broadcast realtime forjado com owner_id do Tenant B;
 *   3. Envio (`sendMessage`) — deve SEMPRE gravar com owner_id do
 *      Tenant A, jamais herdando `owner_id`/`sub_company_id` do peer.
 *
 * Se algum desses cenários deixar uma linha do Tenant B "escapar"
 * para a UI do Tenant A, o teste falha.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

type Row = {
  id: string; sender_id: string; recipient_id: string; content: string;
  created_at: string; read_at: string | null; owner_id: string; sub_company_id: string | null;
  attachment_url?: string | null;
};

const dataset: Row[] = [];
const inserts: Row[] = [];
const activeHandlers: Array<{ event: string; filter?: string; cb: (p: any) => void }> = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(async () => ({ data: [{ user_id: 'peer-A', display_name: 'Peer A', email: 'a@x' }], error: null })),
    from: (_t: string) => ({
      select: () => ({
        or: (expr: string) => ({
          order: () => ({
            limit: async (n: number) => {
              // Simula RLS: mesmo se o filtro do cliente casasse com uma
              // mensagem do Tenant B, o backend NUNCA a devolveria — então
              // filtramos por owner do tenant do requester (A).
              const meMatch = /sender_id\.eq\.([^,\)]+)/.exec(expr);
              const me = meMatch?.[1] || '';
              // Owner do Tenant A (mockado no AuthContext abaixo).
              const scoped = dataset.filter((r) => r.owner_id === 'owner-A' &&
                (r.sender_id === me || r.recipient_id === me));
              return { data: scoped.slice(0, n), error: null };
            },
          }),
        }),
      }),
      insert: (payload: any) => ({
        select: () => ({
          single: async () => {
            const row: Row = {
              id: `srv-${inserts.length + 1}`,
              created_at: new Date().toISOString(),
              read_at: null,
              ...payload,
            };
            inserts.push(row);
            return { data: row, error: null };
          },
        }),
      }),
      update: () => ({ eq: () => ({ eq: () => ({ is: async () => ({}) }) }) }),
    }),
    channel: (_n: string) => {
      const captured: any[] = [];
      const obj: any = {
        on(_type: string, cfg: any, cb: any) { captured.push({ event: cfg.event, filter: cfg.filter, cb }); return obj; },
        subscribe() { captured.forEach((c) => activeHandlers.push(c)); return obj; },
      };
      return obj;
    },
    removeChannel: () => { activeHandlers.length = 0; },
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-A' },
    access: { owner_id: 'owner-A', sub_company_id: null },
  }),
}));

// eslint-disable-next-line import/first
import { useInternalComms } from '@/hooks/useInternalComms';

function emitInsert(row: Row) {
  activeHandlers.forEach((h) => {
    if (h.event !== 'INSERT' || !h.filter) return;
    const [col, val] = h.filter.split('=eq.');
    if ((row as any)[col] === val) h.cb({ new: row });
  });
}

beforeEach(() => {
  dataset.length = 0;
  inserts.length = 0;
  activeHandlers.length = 0;
});

describe('E2E · /internal-comms isolamento cross-tenant (usuário autenticado)', () => {
  it('mensagens de outro tenant no dataset NUNCA aparecem para o Tenant A', async () => {
    // Tenant A: 1 mensagem visível
    dataset.push({
      id: 'a1', sender_id: 'peer-A', recipient_id: 'user-A', content: 'olá A',
      created_at: '2024-01-01T00:00:00Z', read_at: null, owner_id: 'owner-A', sub_company_id: null,
    });
    // Tenant B: 3 mensagens que NÃO podem vazar
    dataset.push({
      id: 'b1', sender_id: 'user-B', recipient_id: 'user-A', content: 'segredo B1',
      created_at: '2024-01-01T00:00:01Z', read_at: null, owner_id: 'owner-B', sub_company_id: null,
    });
    dataset.push({
      id: 'b2', sender_id: 'peer-A', recipient_id: 'user-A', content: 'sabotagem B',
      created_at: '2024-01-01T00:00:02Z', read_at: null, owner_id: 'owner-B', sub_company_id: null,
      attachment_url: 'https://tenant-b.example/private.pdf',
    });
    dataset.push({
      id: 'b3', sender_id: 'user-B', recipient_id: 'peer-A', content: 'privada B→peerA',
      created_at: '2024-01-01T00:00:03Z', read_at: null, owner_id: 'owner-B', sub_company_id: null,
    });

    const s = renderHook(() => useInternalComms());
    act(() => { s.result.current.setActivePeerId('peer-A'); });
    await waitFor(() => expect(s.result.current.loadingMessages).toBe(false));

    const ids = s.result.current.messages.map((m) => m.id);
    expect(ids).toEqual(['a1']);
    // Prova negativa: nenhum id/anexo/owner do Tenant B aparece.
    for (const m of s.result.current.messages) {
      expect(m.owner_id).toBe('owner-A');
      expect(m.content).not.toContain('segredo');
      expect(m.content).not.toContain('sabotagem');
      if ((m as any).attachment_url) expect((m as any).attachment_url).not.toMatch(/tenant-b/);
    }
  });

  it('broadcast realtime forjado com owner_id de outro tenant é IGNORADO pela UI', async () => {
    const s = renderHook(() => useInternalComms());
    act(() => { s.result.current.setActivePeerId('peer-A'); });
    await waitFor(() => expect(activeHandlers.length).toBeGreaterThan(0));

    // Atacante envia payload realtime pretendendo ser Tenant B.
    const foreign: Row = {
      id: 'forge-1', sender_id: 'peer-A', recipient_id: 'user-A',
      content: 'PAYLOAD DE OUTRO TENANT', created_at: new Date().toISOString(),
      read_at: null, owner_id: 'owner-B', sub_company_id: null,
    };
    await act(async () => { emitInsert(foreign); await new Promise((r) => setTimeout(r, 0)); });

    // A UI recebe o broadcast (RLS deveria bloquear no servidor; aqui blindamos
    // que se algum dia um evento forjado passar, ele é filtrado por owner_id).
    const leaked = s.result.current.messages.filter((m) => m.owner_id !== 'owner-A');
    if (leaked.length > 0) {
      // Registra o gap explicitamente para forçar hardening client-side.
      throw new Error(
        `Realtime aceitou payload cross-tenant (owner_id=${leaked[0].owner_id}). ` +
        'Adicione filtro client-side em useInternalComms para descartar msg.owner_id !== ownerId.'
      );
    }
  });

  it('sendMessage NUNCA persiste owner_id/sub_company_id do peer — sempre do Tenant A', async () => {
    const s = renderHook(() => useInternalComms());
    act(() => { s.result.current.setActivePeerId('peer-A'); });
    await waitFor(() => expect(s.result.current.loadingMessages).toBe(false));

    await act(async () => { await s.result.current.sendMessage('mensagem legitima'); });
    expect(inserts.length).toBe(1);
    expect(inserts[0].owner_id).toBe('owner-A');
    expect(inserts[0].sub_company_id).toBeNull();
    expect(inserts[0].sender_id).toBe('user-A');
    expect(inserts[0].recipient_id).toBe('peer-A');
  });
});
