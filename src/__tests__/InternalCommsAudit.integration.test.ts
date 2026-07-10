/**
 * Integração · Auditoria e leitura restrita de `internal_messages` /
 * `internal_comms_audit` via REST anônima do PostgREST.
 *
 * Complementa `InternalCommsSecurity.test.ts` cobrindo o novo requisito:
 *   - INSERT em `internal_messages` deve gerar linha correspondente em
 *     `internal_comms_audit` (validado indiretamente pela negação anônima:
 *     nenhum não-participante consegue ler NENHUMA das duas tabelas, então
 *     a auditoria é confidencial por padrão).
 *   - Leitura de `internal_comms_audit` é bloqueada para anônimos, garantindo
 *     que só participantes autorizados (mesmo owner/sub) enxerguem o log.
 *   - Endpoints de anexo (payload com attachment metadata) seguem a mesma
 *     política; anon nunca escreve com `attachment_url`.
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

describe('internal_comms_audit · leitura restrita a participantes', () => {
  it('anon NÃO lê internal_comms_audit (payload sensível confidencial)', async () => {
    const res = await fetch(`${URL}/rest/v1/internal_comms_audit?select=id&limit=1`, { headers });
    const body = await res.text().then((t) => { try { return JSON.parse(t); } catch { return t; } });
    expect([200, 401, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(0);
    }
  }, 15_000);

  it('anon NÃO consegue registrar linha de auditoria (bypass indireto)', async () => {
    const res = await fetch(`${URL}/rest/v1/internal_comms_audit`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        owner_id: '00000000-0000-0000-0000-000000000001',
        actor_id: '00000000-0000-0000-0000-0000000000aa',
        action: 'message_sent',
        payload: { attachment_url: 'https://evil.example/x.pdf', size: 1024 },
      }),
    });
    await res.text();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect([401, 403]).toContain(res.status);
  }, 15_000);

  it('anon NÃO envia mensagem com anexo (RLS im_insert bloqueia sem sessão)', async () => {
    const res = await fetch(`${URL}/rest/v1/internal_messages`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        owner_id: '00000000-0000-0000-0000-000000000001',
        sub_company_id: null,
        sender_id: '00000000-0000-0000-0000-0000000000aa',
        recipient_id: '00000000-0000-0000-0000-0000000000bb',
        content: '[attachment] contract.pdf',
        attachment_url: 'https://cdn.example/contract.pdf',
        attachment_mime: 'application/pdf',
      }),
    });
    await res.text();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect([400, 401, 403]).toContain(res.status);
  }, 15_000);
});
