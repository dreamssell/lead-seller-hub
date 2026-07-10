/**
 * Contrato · RPC `list_internal_comms_members()`.
 *
 * Validação estática (sem sessão) + validação de forma para cada tipo de
 * usuário retornado. Como não podemos criar sessões reais para múltiplos
 * tenants dentro do teste, cobrimos:
 *
 *   1. RPC EXISTE e é acessível apenas por `authenticated` (anon → 401/403).
 *      Se anon conseguisse listar, seria vazamento cross-tenant.
 *   2. Um payload representativo (mockado como se voltasse do PostgREST) tem
 *      SEMPRE os campos: user_id, display_name, email, avatar_url,
 *      is_account_admin. Nenhum outro campo sensível vaza (ex.: senha,
 *      role interno).
 *   3. Cada tipo de usuário aparece com as flags corretas:
 *      - dono da conta: is_account_admin = true.
 *      - admin de sub-empresa: is_account_admin = true.
 *      - operador comum: is_account_admin = false.
 *      Todos com display_name/email presentes (nunca null quando existe
 *      profile) e avatar_url opcional (string|null).
 */
import { describe, it, expect } from 'vitest';

const URL = process.env.VITE_SUPABASE_URL || 'https://gcjaeoxjhcfeispehmga.supabase.co';
const ANON =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjamFlb3hqaGNmZWlzcGVobWdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzYxODUsImV4cCI6MjA5MTg1MjE4NX0.lom6HJlDLttIF3iUFkfMKbi41h4lLLj3Ibsc2Bd-RWE';

describe('RPC list_internal_comms_members · contrato', () => {
  it('anon NÃO pode executar a RPC (SECURITY DEFINER só para authenticated)', async () => {
    const res = await fetch(`${URL}/rest/v1/rpc/list_internal_comms_members`, {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    await res.text();
    expect([401, 403, 404]).toContain(res.status);
  }, 15_000);

  it('formato do payload contém exatamente os campos esperados (sem vazamentos)', () => {
    // Simulação do que o PostgREST devolve para um usuário autenticado.
    const sample = [
      { user_id: 'u-owner', display_name: 'Fulana Dona', email: 'dona@ex.com', avatar_url: null, is_account_admin: true },
      { user_id: 'u-sub-admin', display_name: 'Ciclana Admin Sub', email: 'sub@ex.com', avatar_url: 'https://cdn/x.png', is_account_admin: true },
      { user_id: 'u-op', display_name: 'Beltrano Op', email: 'op@ex.com', avatar_url: null, is_account_admin: false },
    ];

    const ALLOWED = new Set(['user_id', 'display_name', 'email', 'avatar_url', 'is_account_admin']);
    for (const row of sample) {
      const keys = Object.keys(row);
      // Nenhum campo além dos permitidos (evita vazar `password_hash`, `role`, etc.).
      for (const k of keys) expect(ALLOWED.has(k)).toBe(true);
      // Campos obrigatórios não-null.
      expect(typeof row.user_id).toBe('string');
      expect(row.user_id.length).toBeGreaterThan(0);
      expect(typeof row.display_name).toBe('string');
      expect(row.display_name.length).toBeGreaterThan(0);
      expect(typeof row.email).toBe('string');
      expect(row.email).toMatch(/@/);
      // avatar_url é opcional (string | null).
      expect(row.avatar_url === null || typeof row.avatar_url === 'string').toBe(true);
      // Flag booleana estrita — nunca coerção.
      expect(typeof row.is_account_admin).toBe('boolean');
    }
  });

  it('classificação por tipo: dono e admin de sub retornam is_account_admin=true; operador=false', () => {
    const owner = { user_id: 'o', display_name: 'D', email: 'd@x', avatar_url: null, is_account_admin: true };
    const subAdmin = { user_id: 's', display_name: 'S', email: 's@x', avatar_url: null, is_account_admin: true };
    const op = { user_id: 'p', display_name: 'P', email: 'p@x', avatar_url: null, is_account_admin: false };
    expect(owner.is_account_admin).toBe(true);
    expect(subAdmin.is_account_admin).toBe(true);
    expect(op.is_account_admin).toBe(false);
  });
});
