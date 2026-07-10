/**
 * Integração · manage-account-user Edge Function
 * Contrato de códigos canônicos retornados quando o limite de assentos
 * ou o plano são inválidos.
 *
 * Parte 1 — Contrato de fonte: garante que a Edge Function contém, no
 * caminho `action=create`, as três respostas 409/400 exigidas com os
 * códigos canônicos consumidos pela UI:
 *   • plan_seat_limit_reached  (409)
 *   • seat_additions_blocked   (409)
 *   • plan_slug_invalid        (400)
 * Também garante que o `update` reaproveita esses códigos ao mapear
 * erros do trigger `enforce_member_seat_limit`.
 *
 * Parte 2 — Contrato de UI: cada código tem uma mensagem canônica em
 * `MANAGE_USER_ERROR_MESSAGES` com o e-mail comercial oficial.
 *
 * Parte 3 (opcional) — Smoke runtime: se o ambiente expuser
 * `EDGE_INVOKE_TOKEN` (Bearer de um caller válido), o teste também
 * invoca a função e valida que a resposta preserva o `code` canônico.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MANAGE_USER_ERROR_MESSAGES } from '@/lib/manageAccountUserErrors';
import { SEAT_UPSELL_EMAIL } from '@/lib/seatLimitCopy';

const EDGE_SRC = readFileSync('supabase/functions/manage-account-user/index.ts', 'utf8');

describe('manage-account-user · contrato de códigos canônicos', () => {
  it('action=create chama get_member_seat_usage ANTES de criar o auth user', () => {
    // Bypass-proof: a checagem server-side ocorre antes da criação real.
    const iRpc = EDGE_SRC.indexOf('get_member_seat_usage');
    const iCreate = EDGE_SRC.indexOf('adminClient.auth.admin.createUser');
    const iUpdateExisting = EDGE_SRC.indexOf('adminClient.auth.admin.updateUserById');
    expect(iRpc).toBeGreaterThan(-1);
    // O RPC precisa aparecer antes de qualquer chamada de mutação em auth.admin.
    const firstAuthMutation = Math.min(
      ...[iCreate, iUpdateExisting].filter((n) => n >= 0),
    );
    expect(iRpc).toBeLessThan(firstAuthMutation);
  });

  it('bloqueio pré-criação retorna 409 com "seat_additions_blocked"', () => {
    expect(EDGE_SRC).toMatch(/"seat_additions_blocked"/);
    // Payload correto — status 409 + código exato.
    expect(EDGE_SRC).toMatch(/pausados manualmente[\s\S]{0,80}409,\s*\n\s*"seat_additions_blocked"/);
  });

  it('bloqueio pré-criação retorna 409 com "plan_seat_limit_reached" incluindo plan/used/max', () => {
    expect(EDGE_SRC).toMatch(/code:\s*"plan_seat_limit_reached"/);
    expect(EDGE_SRC).toMatch(/plan_slug:\s*planSlug/);
    expect(EDGE_SRC).toMatch(/max_users:\s*maxUsers/);
    expect(EDGE_SRC).toMatch(/current_users:\s*currentUsers/);
    // Status HTTP: 409 (Conflict) para limite excedido.
    expect(EDGE_SRC).toMatch(/current_users:\s*currentUsers,?\s*\n\s*\},\s*409\)/);
  });

  it('erros propagados do trigger do banco são mapeados para os MESMOS 3 códigos', () => {
    // O bloco catch do upsertScopedAccess mapeia raw error → código canônico.
    expect(EDGE_SRC).toMatch(/\/plan_seat_limit_reached\/i/);
    expect(EDGE_SRC).toMatch(/\/seat_additions_blocked\/i/);
    expect(EDGE_SRC).toMatch(/\/plan_slug_invalid\/i/);
    // plan_slug_invalid é 400 (payload inválido), não 409.
    expect(EDGE_SRC).toMatch(/400,\s*\n\s*"plan_slug_invalid"/);
  });

  it('mensagens do trigger mencionam comercial@leadseller.com.br (consistência de copy)', () => {
    const errorBlocks = EDGE_SRC.match(/comercial@leadseller\.com\.br/g) || [];
    // Esperado: mensagens em pré-checagem + mapeamento do trigger + update →
    // pelo menos 4 ocorrências no arquivo garantem cobertura de todos os caminhos.
    expect(errorBlocks.length).toBeGreaterThanOrEqual(4);
  });

  it('UI expõe cada código canônico em MANAGE_USER_ERROR_MESSAGES com o e-mail oficial', () => {
    for (const code of ['plan_seat_limit_reached', 'seat_additions_blocked', 'plan_slug_invalid'] as const) {
      const msg = MANAGE_USER_ERROR_MESSAGES[code];
      expect(msg, `missing UI message for ${code}`).toBeTruthy();
      expect(msg).toContain(SEAT_UPSELL_EMAIL);
    }
  });

  it('SEAT_UPSELL_EMAIL é a fonte única e coincide com o hard-coded da Edge', () => {
    expect(SEAT_UPSELL_EMAIL).toBe('comercial@leadseller.com.br');
  });
});

// ── Smoke opcional (roda apenas se houver token de invocação) ────────────────
const EDGE_URL = process.env.EDGE_FN_URL || process.env.VITE_SUPABASE_URL;
const EDGE_TOKEN = process.env.EDGE_INVOKE_TOKEN;
const runtime = EDGE_URL && EDGE_TOKEN ? describe : describe.skip;

runtime('manage-account-user · smoke runtime (limite excedido)', () => {
  it('retorna 409 e code canônico ao tentar criar acima do limite', async () => {
    const base = (EDGE_URL as string).replace(/\/$/, '');
    const url = base.includes('functions/v1')
      ? `${base}/manage-account-user`
      : `${base}/functions/v1/manage-account-user`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${EDGE_TOKEN}`,
      },
      body: JSON.stringify({
        action: 'create',
        email: `seat-test-${Date.now()}@example.invalid`,
        name: 'Seat Test',
        password: 'temporary-password-123',
        allowed_pages: ['dashboard'],
        is_account_admin: false,
        role_label: 'Atendente',
        access_level: 'atendimento',
        pipeline_ids: [],
      }),
    });
    const data = await res.json().catch(() => ({}));
    // A conta usada no smoke DEVE estar propositalmente cheia para o teste passar.
    // Caso o backend responda outra coisa, aceitamos apenas os códigos canônicos.
    expect([409, 400]).toContain(res.status);
    expect([
      'plan_seat_limit_reached',
      'seat_additions_blocked',
      'plan_slug_invalid',
    ]).toContain(data?.code);
  });
});
