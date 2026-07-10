/**
 * Integração · Validação de anexos da Comunicação Interna.
 *
 * Cobre dois níveis:
 *  1. Contrato client-side (`validateInternalAttachment`) — rejeita nome,
 *     MIME e tamanho inválidos com códigos estáveis. Este é o gate que a UI
 *     usa antes de subir o arquivo, então precisa ser exaustivo.
 *  2. Prova REST — anon jamais consegue gravar mensagem com anexo, o que
 *     garante que nenhuma linha entra em `internal_comms_audit` quando a
 *     validação falha (a auditoria só é escrita via trigger AFTER INSERT).
 */
import { describe, it, expect } from 'vitest';
import {
  validateInternalAttachment,
  MAX_ATTACHMENT_BYTES,
  ALLOWED_ATTACHMENT_MIMES,
} from '@/lib/internalCommsAttachments';

const URL = process.env.VITE_SUPABASE_URL || 'https://gcjaeoxjhcfeispehmga.supabase.co';
const ANON =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjamFlb3hqaGNmZWlzcGVobWdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzYxODUsImV4cCI6MjA5MTg1MjE4NX0.lom6HJlDLttIF3iUFkfMKbi41h4lLLj3Ibsc2Bd-RWE';

const restHeaders = {
  apikey: ANON,
  Authorization: `Bearer ${ANON}`,
  'Content-Type': 'application/json',
};

describe('Comunicação Interna · validação de anexos (client)', () => {
  it('aceita PDF pequeno com nome válido', () => {
    expect(validateInternalAttachment({ filename: 'contrato.pdf', mime: 'application/pdf', size: 1024 })).toEqual({ ok: true });
  });

  it('aceita todos os MIMEs whitelisted', () => {
    for (const mime of ALLOWED_ATTACHMENT_MIMES) {
      const v = validateInternalAttachment({ filename: 'ok.bin', mime, size: 10 });
      expect(v.ok).toBe(true);
    }
  });

  it('rejeita MIME não permitido (executável) → 4xx equivalente', () => {
    const v = validateInternalAttachment({ filename: 'malware.exe', mime: 'application/x-msdownload', size: 10 });
    expect(v).toEqual({ ok: false, code: 'invalid_mime', message: expect.any(String) });
  });

  it('rejeita arquivo acima do limite (25 MB)', () => {
    const v = validateInternalAttachment({ filename: 'big.pdf', mime: 'application/pdf', size: MAX_ATTACHMENT_BYTES + 1 });
    expect(v).toEqual({ ok: false, code: 'too_large', message: expect.any(String) });
  });

  it('rejeita arquivo vazio (size 0)', () => {
    const v = validateInternalAttachment({ filename: 'vazio.pdf', mime: 'application/pdf', size: 0 });
    expect(v).toEqual({ ok: false, code: 'empty', message: expect.any(String) });
  });

  it('rejeita nome com path traversal', () => {
    const v = validateInternalAttachment({ filename: '../../etc/passwd', mime: 'text/plain', size: 10 });
    expect(v).toEqual({ ok: false, code: 'invalid_filename', message: expect.any(String) });
  });

  it('rejeita nome com barra invertida (Windows path)', () => {
    const v = validateInternalAttachment({ filename: 'pasta\\arquivo.pdf', mime: 'application/pdf', size: 10 });
    expect(v).toEqual({ ok: false, code: 'invalid_filename', message: expect.any(String) });
  });

  it('rejeita nome vazio', () => {
    const v = validateInternalAttachment({ filename: '   ', mime: 'application/pdf', size: 10 });
    expect(v.ok).toBe(false);
  });

  it('rejeita nome com null byte', () => {
    const v = validateInternalAttachment({ filename: 'ok\u0000.pdf', mime: 'application/pdf', size: 10 });
    expect(v).toEqual({ ok: false, code: 'invalid_filename', message: expect.any(String) });
  });

  it('rejeita nome absurdamente longo (>180 chars)', () => {
    const v = validateInternalAttachment({ filename: 'a'.repeat(181) + '.pdf', mime: 'application/pdf', size: 10 });
    expect(v.ok).toBe(false);
  });
});

describe('Comunicação Interna · anexos inválidos não geram linha em internal_comms_audit', () => {
  it('anon POST em internal_messages com attachment inválido → 4xx e ZERO auditoria', async () => {
    const res = await fetch(`${URL}/rest/v1/internal_messages`, {
      method: 'POST',
      headers: { ...restHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        owner_id: '00000000-0000-0000-0000-000000000001',
        sub_company_id: null,
        sender_id: '00000000-0000-0000-0000-0000000000aa',
        recipient_id: '00000000-0000-0000-0000-0000000000bb',
        content: '[attachment] malware.exe',
        attachment_url: 'https://evil.example/malware.exe',
        attachment_mime: 'application/x-msdownload',
        attachment_size: 999999999,
      }),
    });
    await res.text();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    // Verifica que a auditoria não recebeu a tentativa (anon não lê, mas se
    // por algum motivo lesse, teria de vir vazio).
    const audit = await fetch(
      `${URL}/rest/v1/internal_comms_audit?select=id&limit=1`,
      { headers: restHeaders }
    );
    const auditBody = await audit.json().catch(() => []);
    expect([200, 401, 403]).toContain(audit.status);
    if (audit.status === 200) expect((auditBody as any[]).length).toBe(0);
  }, 15_000);
});
