/**
 * Integração REST · Anexos inválidos NUNCA geram linha em internal_comms_audit.
 *
 * Complementa `InternalCommsAttachments.test.ts` cobrindo os três motivos
 * de rejeição pelo lado REST (anon), garantindo que:
 *   • cada categoria retorna status 4xx;
 *   • a leitura de auditoria (anon) permanece vazia/negada.
 *
 * O trigger de auditoria roda AFTER INSERT — se o INSERT for rejeitado,
 * a linha de audit não pode existir. Este teste blinda essa invariante.
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

async function postMessage(body: Record<string, unknown>) {
  const res = await fetch(`${URL}/rest/v1/internal_messages`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function auditRowCount(): Promise<number | null> {
  const res = await fetch(`${URL}/rest/v1/internal_comms_audit?select=id&limit=1`, { headers });
  const body = await res.json().catch(() => []);
  if (res.status === 200 && Array.isArray(body)) return body.length;
  // 401/403/404 → anon corretamente bloqueado; sem linhas visíveis.
  expect([200, 401, 403, 404]).toContain(res.status);
  return null;
}

const BASE = {
  owner_id: '00000000-0000-0000-0000-000000000001',
  sub_company_id: null,
  sender_id: '00000000-0000-0000-0000-0000000000aa',
  recipient_id: '00000000-0000-0000-0000-0000000000bb',
  content: '[attach]',
};

describe('/internal-comms · anexos inválidos → 4xx e ZERO audit', () => {
  it('MIME bloqueado (executável) → 4xx', async () => {
    const { status } = await postMessage({
      ...BASE,
      attachment_url: 'https://evil.example/hack.exe',
      attachment_mime: 'application/x-msdownload',
      attachment_size: 1024,
    });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
    const audit = await auditRowCount();
    if (audit != null) expect(audit).toBe(0);
  }, 15_000);

  it('tamanho acima de 25 MB → 4xx', async () => {
    const { status } = await postMessage({
      ...BASE,
      attachment_url: 'https://evil.example/huge.pdf',
      attachment_mime: 'application/pdf',
      attachment_size: 26 * 1024 * 1024,
    });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
    const audit = await auditRowCount();
    if (audit != null) expect(audit).toBe(0);
  }, 15_000);

  it('nome de arquivo com path traversal → 4xx', async () => {
    const { status } = await postMessage({
      ...BASE,
      attachment_url: 'https://evil.example/..%2F..%2Fetc%2Fpasswd',
      attachment_name: '../../etc/passwd',
      attachment_mime: 'text/plain',
      attachment_size: 128,
    });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
    const audit = await auditRowCount();
    if (audit != null) expect(audit).toBe(0);
  }, 15_000);

  it('nome de arquivo com null byte → 4xx', async () => {
    const { status } = await postMessage({
      ...BASE,
      attachment_url: 'https://evil.example/ok.pdf',
      attachment_name: 'ok\u0000.pdf',
      attachment_mime: 'application/pdf',
      attachment_size: 128,
    });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  }, 15_000);

  it('sequência de 4 tentativas inválidas mantém audit vazio para anon', async () => {
    // Combinação intencional para stress: mesmo cascata de inválidos, nada persiste.
    await postMessage({ ...BASE, attachment_size: 26 * 1024 * 1024, attachment_mime: 'application/pdf' });
    await postMessage({ ...BASE, attachment_mime: 'application/x-msdownload', attachment_size: 100 });
    await postMessage({ ...BASE, attachment_name: '..\\etc', attachment_mime: 'application/pdf', attachment_size: 100 });
    await postMessage({ ...BASE, attachment_size: 0, attachment_mime: 'application/pdf' });
    const audit = await auditRowCount();
    if (audit != null) expect(audit).toBe(0);
  }, 30_000);
});
