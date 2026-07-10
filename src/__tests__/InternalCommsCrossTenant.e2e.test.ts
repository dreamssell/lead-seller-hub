/**
 * E2E · Cross-tenant hardening de `/internal-comms`.
 *
 * Objetivo: garantir que um usuário de outro tenant (ou totalmente anônimo)
 * NUNCA consiga ler mensagens ou anexos de `internal_messages` /
 * `internal_comms_audit`, mesmo tentando:
 *   1. Navegação direta ao endpoint REST filtrando por owner_id alheio.
 *   2. Chamada direta à RPC `internal_comms_unread_counts` sem sessão.
 *   3. Filtro por recipient_id/sender_id específico simulando "vou pescar
 *      mensagens de um user_id que descobri".
 *   4. Consulta seletiva ao campo `attachment_url` (previne enumeration).
 *
 * O REST responde 401/403 sem sessão ou 200 com array vazio quando RLS
 * simplesmente esconde as linhas — ambos são aceitáveis; o que NUNCA pode
 * acontecer é retornar linhas reais.
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

async function get(path: string) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers });
  const text = await res.text();
  let body: any = null; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

function assertNoRowsLeaked(status: number, body: any) {
  // PostgREST devolve 400 quando o filtro é rejeitado por RLS/ACL, 401/403
  // quando não há sessão, ou 200 com array vazio quando RLS apenas oculta as
  // linhas. Todos os três são aceitáveis; o que NUNCA pode acontecer é vazar
  // linhas reais para um requester sem autorização.
  expect([200, 400, 401, 403]).toContain(status);
  if (status === 200) {
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  }
}

describe('/internal-comms · isolamento cross-tenant (nunca vaza mensagem ou anexo)', () => {
  it('anon filtrando por owner_id alheio → 0 linhas em internal_messages', async () => {
    const { status, body } = await get(
      'internal_messages?select=id,content,attachment_url&owner_id=eq.00000000-0000-0000-0000-0000000000ff&limit=5'
    );
    assertNoRowsLeaked(status, body);
  }, 15_000);

  it('anon filtrando por recipient_id específico → 0 linhas (evita pescar por user_id)', async () => {
    const { status, body } = await get(
      'internal_messages?select=id,content&recipient_id=eq.00000000-0000-0000-0000-0000000000aa&limit=5'
    );
    assertNoRowsLeaked(status, body);
  }, 15_000);

  it('anon selecionando SOMENTE attachment_url → nada é enumerado', async () => {
    const { status, body } = await get('internal_messages?select=attachment_url&limit=50');
    assertNoRowsLeaked(status, body);
  }, 15_000);

  it('anon lendo internal_comms_audit filtrando por owner_id alheio → 0 linhas', async () => {
    const { status, body } = await get(
      'internal_comms_audit?select=id,payload&owner_id=eq.00000000-0000-0000-0000-0000000000ff&limit=5'
    );
    assertNoRowsLeaked(status, body);
  }, 15_000);

  it('anon NÃO consegue chamar RPC internal_comms_unread_counts (exige auth.uid())', async () => {
    const res = await fetch(`${URL}/rest/v1/rpc/internal_comms_unread_counts`, {
      method: 'POST',
      headers,
      body: '{}',
    });
    const text = await res.text();
    let body: any = null; try { body = JSON.parse(text); } catch { body = text; }
    expect([401, 403, 404]).toContain(res.status);
    // Se por acaso a função responder 200 (por algum motivo), NUNCA pode devolver linhas.
    if (res.status === 200) {
      expect(Array.isArray(body) ? body.length : 0).toBe(0);
    }
  }, 15_000);

  it('anon NÃO consegue navegar diretamente para RPC list_internal_comms_members de outro tenant', async () => {
    const res = await fetch(`${URL}/rest/v1/rpc/list_internal_comms_members`, {
      method: 'POST',
      headers,
      body: '{}',
    });
    await res.text();
    expect([401, 403, 404]).toContain(res.status);
  }, 15_000);
});
