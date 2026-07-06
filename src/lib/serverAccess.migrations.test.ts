/**
 * Validações estáticas de que o backend (Supabase) expõe a checagem de
 * páginas bloqueadas por hierarquia como funções server-side, cobrindo
 * cenários que o ProtectedRoute do frontend não alcança (edge functions,
 * RPCs, chamadas diretas ao PostgREST).
 *
 * Estas checagens são feitas contra o SQL das migrations — assim o teste
 * roda offline no CI e falha imediatamente se alguém remover ou
 * enfraquecer a defesa em profundidade.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const MIG_DIR = resolve(__dirname, '../../supabase/migrations');
const allSql = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(MIG_DIR, f), 'utf8'))
  .join('\n');

describe('RLS / Server-side · hierarquia de blocked_pages', () => {
  it('função get_my_account_access faz a UNIÃO de blocked_pages da empresa-mãe com a sub-empresa', () => {
    expect(allSql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_my_account_access/);
    // union real (não COALESCE, que só pegaria o primeiro não-nulo)
    expect(allSql).toMatch(/DISTINCT unnest\(\s*COALESCE\([^)]*sub_blocked/);
    expect(allSql).toMatch(/parent_cc/);
  });

  it('expõe current_user_blocked_pages() e can_current_user_access(text) para uso server-side', () => {
    expect(allSql).toMatch(/CREATE OR REPLACE FUNCTION public\.current_user_blocked_pages/);
    expect(allSql).toMatch(/CREATE OR REPLACE FUNCTION public\.can_current_user_access/);
  });

  it('nega execução das funções de acesso para anon (defesa em profundidade)', () => {
    expect(allSql).toMatch(/REVOKE ALL ON FUNCTION public\.current_user_blocked_pages\(\)\s+FROM\s+PUBLIC,\s*anon/);
    expect(allSql).toMatch(/REVOKE ALL ON FUNCTION public\.can_current_user_access\(text\)\s+FROM\s+PUBLIC,\s*anon/);
    expect(allSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.current_user_blocked_pages\(\)\s+TO\s+authenticated/);
    expect(allSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.can_current_user_access\(text\)\s+TO\s+authenticated/);
  });

  it('conta com status=blocked só libera a página profile no servidor', () => {
    // A função can_current_user_access implementa a mesma regra do canAccessPage do frontend.
    expect(allSql).toMatch(/IF r\.status = 'blocked' THEN[\s\S]*RETURN _page = 'profile'/);
  });

  it('empresa (client_companies) tem coluna blocked_pages para bloqueio hierárquico', () => {
    expect(allSql).toMatch(/ALTER TABLE public\.client_companies[\s\S]*ADD COLUMN IF NOT EXISTS blocked_pages/);
  });
});
