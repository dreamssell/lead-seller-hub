/**
 * Checks de RLS ao vivo: chamamos a REST API do Supabase como cliente
 * anônimo e conferimos que nenhuma tabela sensível vaza dados. Isso
 * complementa o ProtectedRoute (UI) provando que, se alguém montar uma
 * requisição fora da app, o backend continua negando.
 *
 * Tabelas cobertas: as usadas pelo CEODashboardPage + tabelas com PII/
 * credenciais + tabelas que participam do controle de páginas bloqueadas.
 */
import { describe, it, expect } from 'vitest';

const URL = process.env.VITE_SUPABASE_URL || 'https://gcjaeoxjhcfeispehmga.supabase.co';
const ANON =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjamFlb3hqaGNmZWlzcGVobWdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzYxODUsImV4cCI6MjA5MTg1MjE4NX0.lom6HJlDLttIF3iUFkfMKbi41h4lLLj3Ibsc2Bd-RWE';

async function anonSelect(table: string) {
  const res = await fetch(`${URL}/rest/v1/${table}?select=id&limit=1`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

const SENSITIVE_TABLES = [
  // Dashboard do dono (CEODashboardPage)
  'leads', 'customers', 'tasks', 'products', 'profiles', 'audit_logs',
  // Controle de acesso / hierarquia de blocked_pages
  'client_companies', 'sub_companies', 'user_account_access', 'user_roles',
  // PII / credenciais
  'api_keys', 'chat_messages', 'signature_documents',
  // Pipelines
  'pipelines', 'pipeline_stages',
];

describe('RLS · anon NÃO deve enxergar tabelas sensíveis via REST', () => {
  it.each(SENSITIVE_TABLES)('anon SELECT em %s retorna vazio (ou negado)', async (table) => {
    const { status, body } = await anonSelect(table);
    // Aceitamos 200 (RLS filtra tudo) ou 401/403 (política nega). NUNCA linhas com dados.
    expect([200, 401, 403]).toContain(status);
    if (status === 200) {
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(0);
    }
  }, 15_000);

  it('anon NÃO pode executar can_current_user_access (função protegida)', async () => {
    const res = await fetch(`${URL}/rest/v1/rpc/can_current_user_access`, {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ _page: 'reports' }),
    });
    // Deve ser 401/403 (execute revogado do anon).
    expect([401, 403, 404]).toContain(res.status);
  }, 15_000);

  it('anon NÃO pode executar current_user_blocked_pages()', async () => {
    const res = await fetch(`${URL}/rest/v1/rpc/current_user_blocked_pages`, {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    expect([401, 403, 404]).toContain(res.status);
  }, 15_000);
});
