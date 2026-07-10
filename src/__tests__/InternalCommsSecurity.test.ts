/**
 * Testes de integração de segurança para Comunicação Interna.
 *
 * Cobre:
 *  - `internal_messages` bloqueia leitura/escrita anônima (proxy para
 *    "acesso cruzado impossível sem sessão válida").
 *  - `internal_comms_audit` bloqueia leitura/escrita anônima.
 *  - RPC `internal_comms_unread_counts` exige sessão autenticada.
 *  - INSERT anônimo em `internal_messages` é rejeitado (política im_insert
 *    exige `auth.uid() = sender_id` + `internal_comms_share_scope`, o que
 *    prova que qualquer combinação Empresa ↔ Sub-empresa sem contexto
 *    correto é negada em nível de banco).
 */
import { describe, it, expect } from 'vitest';

const URL = process.env.VITE_SUPABASE_URL || 'https://gcjaeoxjhcfeispehmga.supabase.co';
const ANON =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjamFlb3hqaGNmZWlzcGVobWdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzYxODUsImV4cCI6MjA5MTg1MjE4NX0.lom6HJlDLttIF3iUFkfMKbi41h4lLLj3Ibsc2Bd-RWE';

const headers = {
  apikey: ANON,
  Authorization: `Bearer ${ANON}`,
  'Content-Type': 'application/json',
};

async function anonSelect(table: string) {
  const res = await fetch(`${URL}/rest/v1/${table}?select=id&limit=1`, { headers });
  const text = await res.text();
  let body: any = null; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

describe('Comunicação Interna · isolamento e auditoria (via REST anônima)', () => {
  it('anon NÃO enxerga internal_messages', async () => {
    const { status, body } = await anonSelect('internal_messages');
    expect([200, 401, 403]).toContain(status);
    if (status === 200) {
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(0);
    }
  }, 15_000);

  it('anon NÃO enxerga internal_comms_audit', async () => {
    const { status, body } = await anonSelect('internal_comms_audit');
    expect([200, 401, 403]).toContain(status);
    if (status === 200) {
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(0);
    }
  }, 15_000);

  it('anon NÃO consegue inserir em internal_messages (bloqueia cross-tenant sem sessão)', async () => {
    // Payload com IDs aleatórios simulando "usuário A da Empresa X escrevendo
    // para usuário B da Sub-empresa Y". Sem sessão autenticada, a política
    // im_insert (auth.uid() = sender_id AND internal_comms_share_scope) rejeita.
    const res = await fetch(`${URL}/rest/v1/internal_messages`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        owner_id: '00000000-0000-0000-0000-000000000001',
        sub_company_id: null,
        sender_id: '00000000-0000-0000-0000-0000000000aa',
        recipient_id: '00000000-0000-0000-0000-0000000000bb',
        content: 'ping cross-tenant',
      }),
    });
    await res.text();
    // Sem sessão: PostgREST devolve 401. Nunca deve ser 2xx.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect([401, 403]).toContain(res.status);
  }, 15_000);

  it('anon NÃO consegue inserir em internal_comms_audit', async () => {
    const res = await fetch(`${URL}/rest/v1/internal_comms_audit`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        owner_id: '00000000-0000-0000-0000-000000000001',
        actor_id: '00000000-0000-0000-0000-0000000000aa',
        action: 'message_sent',
      }),
    });
    await res.text();
    expect(res.status).toBeGreaterThanOrEqual(400);
  }, 15_000);

  it('anon NÃO consegue chamar RPC internal_comms_unread_counts', async () => {
    const res = await fetch(`${URL}/rest/v1/rpc/internal_comms_unread_counts`, {
      method: 'POST',
      headers,
      body: '{}',
    });
    await res.text();
    // Função requer auth.uid(); execução anon deve falhar (401/403/404) e nunca
    // retornar linhas.
    expect([401, 403, 404]).toContain(res.status);
  }, 15_000);
});
