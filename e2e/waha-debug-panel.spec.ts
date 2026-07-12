import { test, expect, Route } from '@playwright/test';

/**
 * E2E · Debug WAHA (owner-only) — valida no painel `WahaInboundDebugPanel`:
 *   1. Paginação por cursor: "Próxima →" envia `cursor` no body do waha-audit,
 *      atualiza rótulo "Cursor atual" e habilita "← Anterior"; voltar restaura
 *      o cursor prévio e desabilita novamente.
 *   2. Filtro "Somente gaps": ativa `gapsOnly`, reduz linhas da tabela para
 *      conter APENAS eventos marcados como gap (badge/linha destacada).
 *   3. Link de call: coluna "Call" renderiza <a> com href contendo
 *      `call_id=<uuid>` e `wavoip_call_id=<id>` apontando para `/calls`.
 *   4. Exportação CSV/PDF: cliques disparam download e o filename inclui
 *      o prefixo `waha-audit-<owner8>-` (CSV termina em .csv; PDF em .pdf).
 *
 * Requisitos: preview autenticado como owner + env `TEST_OWNER_COMPANY_ID`
 * apontando para uma empresa acessível ao usuário. Sem a env, os testes são
 * pulados para não falharem em ambientes sem seed.
 */

const COMPANY_ID = process.env.TEST_OWNER_COMPANY_ID || '';
const OWNER_ID = process.env.TEST_OWNER_ID || '00000000-0000-0000-0000-000000000001';

// Payload determinístico do waha-audit — 2 páginas + gaps + call para link.
function buildAuditPayload(opts: { cursor?: string | null; order?: 'asc' | 'desc' } = {}) {
  const page1First = '2026-07-12T12:00:00.000Z';
  const page1Last = '2026-07-12T11:00:00.000Z';
  const page2First = '2026-07-12T10:00:00.000Z';
  const isNext = !!opts.cursor;
  const events = isNext
    ? [
        {
          id: 'ev-3', connection_id: 'conn-1', created_at: page2First,
          event_type: 'waha.message', status: null,
          metadata_json: { bucket: 'message', provider_msg_id: 'MSG-3', sender_lid: '5511@lid', owner_id: OWNER_ID },
        },
      ]
    : [
        {
          id: 'ev-1', connection_id: 'conn-1', created_at: page1First,
          event_type: 'waha.message', status: null,
          metadata_json: { bucket: 'message', provider_msg_id: 'MSG-1', sender_lid: '5511@lid', owner_id: OWNER_ID, chat_message_id: 'cm-1' },
        },
        {
          // Este NÃO tem chat_message_id nem match em messages ⇒ vira gap.
          id: 'ev-2', connection_id: 'conn-1', created_at: page1Last,
          event_type: 'waha.message', status: null,
          metadata_json: { bucket: 'message', provider_msg_id: 'MSG-2-GAP', sender_lid: '5511@lid', owner_id: OWNER_ID, raw_event: 'raw-gap' },
        },
      ];
  const messages = isNext
    ? []
    : [
        {
          id: 'cm-1', created_at: page1First, uaz_msg_id: 'MSG-1', connection_id: 'conn-1',
          content: 'ola mundo', customers: { owner_id: OWNER_ID, phone: '5511988887777', name: 'Cliente' },
        },
      ];
  const gaps = isNext
    ? []
    : [
        {
          event_id: 'ev-2', created_at: page1Last, connection_id: 'conn-1',
          provider_msg_id: 'MSG-2-GAP', sender_lid: '5511@lid', owner_id: OWNER_ID, raw_event: 'raw-gap',
        },
      ];
  const calls = isNext
    ? []
    : [
        {
          id: 'call-uuid-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          wavoip_call_id: 'wv-777', phone_number: '5511988887777', contact_name: 'Cliente',
          direction: 'inbound', status: 'answered', duration_seconds: 42,
          started_at: page1First, answered_at: page1First, ended_at: page1First, created_at: page1First,
        },
      ];
  return {
    ok: true, owner_id: OWNER_ID,
    connections: [{ id: 'conn-1', provider: 'waha', status: 'WORKING' }],
    events, messages, gaps, calls,
    stats: {
      events_total: events.length, message_events: events.length,
      messages_stored: messages.length, gaps: gaps.length,
      gap_rate: events.length ? gaps.length / events.length : 0,
      since_iso: '2026-07-11T12:00:00.000Z',
    },
    alerts: [],
    pagination: {
      limit: 200, order: opts.order ?? 'desc',
      next_cursor: isNext ? null : page1Last,
      cursor_used: opts.cursor ?? null,
    },
    meta: { request_id: 'req-mock', owner_hash: 'ownerhash' },
  };
}

test.describe('Debug WAHA · paginação + gaps + call link + export', () => {
  test.skip(!COMPANY_ID, 'Defina TEST_OWNER_COMPANY_ID para executar este suite');

  // Captura os bodies enviados para /waha-audit para asserts posteriores.
  const invocations: any[] = [];

  test.beforeEach(async ({ page }) => {
    invocations.length = 0;
    await page.route('**/functions/v1/waha-audit', async (route: Route) => {
      let body: any = {};
      try { body = route.request().postDataJSON(); } catch { body = {}; }
      invocations.push(body);
      const payload = buildAuditPayload({ cursor: body?.cursor ?? null, order: body?.order ?? 'desc' });
      return route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify(payload),
      });
    });
  });

  test('cursor pagination + gapsOnly + call link + CSV/PDF export', async ({ page }, testInfo) => {
    await page.goto(`/owner/company/${COMPANY_ID}`, { waitUntil: 'domcontentloaded' });

    // Abre a aba Debug WAHA (id-âncora estável definido em CompanyDetailPage).
    await page.locator('#tab-waha-debug').click();

    // 1) Primeira chamada sem cursor.
    await expect.poll(() => invocations.length, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(invocations[0]).toMatchObject({ owner_id: expect.any(String), cursor: null, order: 'desc' });

    const nextBtn = page.getByRole('button', { name: /Próxima/i });
    const prevBtn = page.getByRole('button', { name: /Anterior/i });
    await expect(prevBtn).toBeDisabled();
    await expect(nextBtn).toBeEnabled();

    // Snapshot de linhas antes do filtro gaps: deve mostrar MSG-1 e MSG-2-GAP.
    await expect(page.getByText('MSG-1', { exact: false })).toBeVisible();
    await expect(page.getByText('MSG-2-GAP', { exact: false })).toBeVisible();

    // 3) Link da call na coluna "Call" renderiza com call_id + wavoip_call_id.
    const callLink = page.locator('a[href*="/calls?call_id="]').first();
    await expect(callLink).toBeVisible();
    const href = await callLink.getAttribute('href');
    expect(href).toContain('call_id=call-uuid-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(href).toContain('wavoip_call_id=wv-777');

    // 2) Ativa "Somente gaps" — a linha MSG-1 (gravada) deve desaparecer, MSG-2-GAP fica.
    await page.getByRole('button', { name: /Somente gaps/i }).click();
    await expect(page.getByText('somente gaps', { exact: false })).toBeVisible();
    await expect(page.getByText('MSG-2-GAP')).toBeVisible();
    await expect(page.getByText('MSG-1', { exact: true })).toHaveCount(0);

    // Desliga gaps para não interferir na paginação.
    await page.getByRole('button', { name: /Somente gaps/i }).click();

    // 1b) Próxima → dispara nova chamada com cursor não-nulo; Anterior habilita.
    const before = invocations.length;
    await nextBtn.click();
    await expect.poll(() => invocations.length, { timeout: 10_000 }).toBeGreaterThan(before);
    const nextCall = invocations[invocations.length - 1];
    expect(nextCall.cursor).toBeTruthy();
    expect(nextCall.order).toBe('desc');
    await expect(prevBtn).toBeEnabled();
    // Após a segunda página não há next_cursor ⇒ Próxima desabilita.
    await expect(nextBtn).toBeDisabled();

    // Voltar restaura cursor null e desabilita Anterior novamente.
    const before2 = invocations.length;
    await prevBtn.click();
    await expect.poll(() => invocations.length, { timeout: 10_000 }).toBeGreaterThan(before2);
    expect(invocations[invocations.length - 1].cursor).toBeNull();
    await expect(prevBtn).toBeDisabled();

    // 4) Exportação CSV — captura o download e valida nome do arquivo.
    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /^CSV$/ }).click(),
    ]);
    const csvName = csvDownload.suggestedFilename();
    expect(csvName.startsWith('waha-audit-')).toBe(true);
    expect(csvName.endsWith('.csv')).toBe(true);

    // Exportação PDF.
    const [pdfDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /^PDF$/ }).click(),
    ]);
    const pdfName = pdfDownload.suggestedFilename();
    expect(pdfName.startsWith('waha-audit-')).toBe(true);
    expect(pdfName.endsWith('.pdf')).toBe(true);

    await testInfo.attach('waha-audit-invocations', {
      body: JSON.stringify(invocations, null, 2), contentType: 'application/json',
    });
  });
});
