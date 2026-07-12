import { test, expect, Route, Download } from '@playwright/test';
import fs from 'node:fs/promises';
// pdf-parse ships CJS; the default export is the parser function.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;

/**
 * E2E · Debug WAHA (owner-only). Cobre:
 *   1. Paginação por cursor: primeira página tem "← Anterior" DESABILITADO e
 *      body sem cursor com order=desc. "Próxima →" envia cursor não-nulo e
 *      mantém order; "Anterior" restaura cursor null e desabilita novamente.
 *   2. Alternar ordem (desc ↔ asc) reseta cursor e envia order novo no body.
 *   3. Filtro "Somente gaps" reduz linhas e mantém apenas eventos de gap.
 *   4. Link da coluna Call abre /calls?call_id=…&wavoip_call_id=…
 *   5. Exportação CSV/PDF: filename inclui `waha-audit-<owner8>-` e o PDF
 *      contém título, subtítulo com filtros e headers de coluna esperados.
 *   6. Cenário vazio: sem events/messages/gaps, CSV vem apenas com BOM (sem
 *      linhas de dados) e o PDF ainda tem título/subtítulo/KPIs válidos.
 *
 * Executa apenas com TEST_OWNER_COMPANY_ID definido. Caso contrário todo o
 * suite é pulado com uma mensagem clara — mesma env é validada no workflow
 * `.github/workflows/waha-debug-e2e.yml` para falhar cedo no CI.
 */

const COMPANY_ID = process.env.TEST_OWNER_COMPANY_ID || '';
const OWNER_ID = process.env.TEST_OWNER_ID || '00000000-0000-0000-0000-000000000001';

const PAGE1_FIRST = '2026-07-12T12:00:00.000Z';
const PAGE1_LAST = '2026-07-12T11:00:00.000Z';
const PAGE2_FIRST = '2026-07-12T10:00:00.000Z';
const CALL_UUID = 'call-uuid-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function buildAuditPayload(opts: { cursor?: string | null; order?: 'asc' | 'desc' } = {}) {
  const isNext = !!opts.cursor;
  const events = isNext
    ? [
        {
          id: 'ev-3', connection_id: 'conn-1', created_at: PAGE2_FIRST,
          event_type: 'waha.message', status: null,
          metadata_json: { bucket: 'message', provider_msg_id: 'MSG-3', sender_lid: '5511@lid', owner_id: OWNER_ID },
        },
      ]
    : [
        {
          id: 'ev-1', connection_id: 'conn-1', created_at: PAGE1_FIRST,
          event_type: 'waha.message', status: null,
          metadata_json: { bucket: 'message', provider_msg_id: 'MSG-1', sender_lid: '5511@lid', owner_id: OWNER_ID, chat_message_id: 'cm-1' },
        },
        {
          id: 'ev-2', connection_id: 'conn-1', created_at: PAGE1_LAST,
          event_type: 'waha.message', status: null,
          metadata_json: { bucket: 'message', provider_msg_id: 'MSG-2-GAP', sender_lid: '5511@lid', owner_id: OWNER_ID, raw_event: 'raw-gap' },
        },
      ];
  const messages = isNext
    ? []
    : [
        {
          id: 'cm-1', created_at: PAGE1_FIRST, uaz_msg_id: 'MSG-1', connection_id: 'conn-1',
          content: 'ola mundo', customers: { owner_id: OWNER_ID, phone: '5511988887777', name: 'Cliente' },
        },
      ];
  const gaps = isNext
    ? []
    : [
        {
          event_id: 'ev-2', created_at: PAGE1_LAST, connection_id: 'conn-1',
          provider_msg_id: 'MSG-2-GAP', sender_lid: '5511@lid', owner_id: OWNER_ID, raw_event: 'raw-gap',
        },
      ];
  const calls = isNext
    ? []
    : [
        {
          id: CALL_UUID, wavoip_call_id: 'wv-777', phone_number: '5511988887777', contact_name: 'Cliente',
          direction: 'inbound', status: 'answered', duration_seconds: 42,
          started_at: PAGE1_FIRST, answered_at: PAGE1_FIRST, ended_at: PAGE1_FIRST, created_at: PAGE1_FIRST,
        },
      ];
  return {
    ok: true, owner_id: OWNER_ID,
    connections: [{ id: 'conn-1', provider: 'waha', status: 'WORKING', owner_id: OWNER_ID }],
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
      next_cursor: isNext ? null : PAGE1_LAST,
      cursor_used: opts.cursor ?? null,
    },
    meta: { request_id: 'req-mock', owner_hash: 'ownerhash' },
  };
}

function buildEmptyPayload(opts: { order?: 'asc' | 'desc' } = {}) {
  return {
    ok: true, owner_id: OWNER_ID,
    connections: [{ id: 'conn-1', provider: 'waha', status: 'WORKING', owner_id: OWNER_ID }],
    events: [], messages: [], gaps: [], calls: [],
    stats: { events_total: 0, message_events: 0, messages_stored: 0, gaps: 0, gap_rate: 0, since_iso: '2026-07-11T12:00:00.000Z' },
    alerts: [],
    pagination: { limit: 200, order: opts.order ?? 'desc', next_cursor: null, cursor_used: null },
    meta: { request_id: 'req-empty', owner_hash: 'ownerhash' },
  };
}

async function downloadToBuffer(dl: Download): Promise<Buffer> {
  const path = await dl.path();
  if (!path) throw new Error('download.path() unavailable');
  return fs.readFile(path);
}

test.describe('Debug WAHA · paginação + gaps + call link + export', () => {
  test.skip(!COMPANY_ID, 'Defina TEST_OWNER_COMPANY_ID para executar este suite');

  const invocations: any[] = [];
  let currentBuilder: (body: any) => any = (body) =>
    buildAuditPayload({ cursor: body?.cursor ?? null, order: body?.order ?? 'desc' });

  test.beforeEach(async ({ page }) => {
    invocations.length = 0;
    currentBuilder = (body) =>
      buildAuditPayload({ cursor: body?.cursor ?? null, order: body?.order ?? 'desc' });
    await page.route('**/functions/v1/waha-audit', async (route: Route) => {
      let body: any = {};
      try { body = route.request().postDataJSON(); } catch { body = {}; }
      invocations.push(body);
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(currentBuilder(body)),
      });
    });
  });

  test('cursor pagination + ordem + gapsOnly + call link + CSV/PDF export (conteúdo)', async ({ page }, testInfo) => {
    await page.goto(`/owner/company/${COMPANY_ID}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#tab-waha-debug').click();

    // 1) Primeira chamada — cursor null, order desc, Prev DESABILITADO.
    await expect.poll(() => invocations.length, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(invocations[0]).toMatchObject({ owner_id: expect.any(String), cursor: null, order: 'desc' });

    const nextBtn = page.getByRole('button', { name: /Próxima/i });
    const prevBtn = page.getByRole('button', { name: /Anterior/i });
    await expect(prevBtn, 'Prev deve começar desabilitado na primeira página').toBeDisabled();
    await expect(nextBtn).toBeEnabled();

    await expect(page.getByText('MSG-1', { exact: false })).toBeVisible();
    await expect(page.getByText('MSG-2-GAP', { exact: false })).toBeVisible();

    // Link da call
    const callLink = page.locator('a[href*="/calls?call_id="]').first();
    await expect(callLink).toBeVisible();
    const href = await callLink.getAttribute('href');
    expect(href).toContain(`call_id=${CALL_UUID}`);
    expect(href).toContain('wavoip_call_id=wv-777');

    // Filtro Somente gaps
    await page.getByRole('button', { name: /Somente gaps/i }).click();
    await expect(page.getByText('somente gaps', { exact: false })).toBeVisible();
    await expect(page.getByText('MSG-2-GAP')).toBeVisible();
    await expect(page.getByText('MSG-1', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: /Somente gaps/i }).click();

    // 2) Próxima → cursor não-nulo, mesma ordem, Prev habilita, Next desabilita.
    const before = invocations.length;
    await nextBtn.click();
    await expect.poll(() => invocations.length, { timeout: 10_000 }).toBeGreaterThan(before);
    const nextCall = invocations[invocations.length - 1];
    expect(nextCall.cursor, 'cursor da 2ª página deve ser o next_cursor devolvido').toBe(PAGE1_LAST);
    expect(nextCall.order).toBe('desc');
    await expect(prevBtn).toBeEnabled();
    await expect(nextBtn).toBeDisabled();

    // Voltar → cursor null, Prev desabilita.
    const before2 = invocations.length;
    await prevBtn.click();
    await expect.poll(() => invocations.length, { timeout: 10_000 }).toBeGreaterThan(before2);
    expect(invocations[invocations.length - 1].cursor).toBeNull();
    await expect(prevBtn).toBeDisabled();

    // 3) Alternar ordenação: reseta cursor e envia order novo.
    const before3 = invocations.length;
    await page.getByRole('button', { name: /Mais recentes|Mais antigos/i }).click();
    await expect.poll(() => invocations.length, { timeout: 10_000 }).toBeGreaterThan(before3);
    const afterToggle = invocations[invocations.length - 1];
    expect(afterToggle.order).toBe('asc');
    expect(afterToggle.cursor).toBeNull();
    // Volta para desc para exportar em estado conhecido.
    await page.getByRole('button', { name: /Mais recentes|Mais antigos/i }).click();

    // 4) CSV filename com owner8.
    const owner8 = OWNER_ID.slice(0, 8);
    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /^CSV$/ }).click(),
    ]);
    const csvName = csvDownload.suggestedFilename();
    expect(csvName.startsWith(`waha-audit-${owner8}-`)).toBe(true);
    expect(csvName.endsWith('.csv')).toBe(true);
    const csvBuf = await downloadToBuffer(csvDownload);
    const csvText = csvBuf.toString('utf8');
    // Header do CSV (primeira linha) contém colunas do exportRows.
    expect(csvText).toMatch(/webhook_at.*message_id.*is_gap/);
    expect(csvText).toContain('MSG-1');
    expect(csvText).toContain('MSG-2-GAP');

    // 5) PDF filename + conteúdo (título, subtítulo com filtros e headers de coluna).
    const [pdfDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /^PDF$/ }).click(),
    ]);
    const pdfName = pdfDownload.suggestedFilename();
    expect(pdfName.startsWith(`waha-audit-${owner8}-`)).toBe(true);
    expect(pdfName.endsWith('.pdf')).toBe(true);

    const pdfBuf = await downloadToBuffer(pdfDownload);
    const parsed = await pdfParse(pdfBuf);
    const text = parsed.text;
    expect(text).toContain('Auditoria WAHA');
    expect(text).toContain('pipeline inbound');
    expect(text).toMatch(/Owner .*ordem=desc/);
    expect(text).toMatch(/filtros: msg=—|filtros: msg=-/);
    // KPIs
    expect(text).toContain('Webhooks msg');
    expect(text).toContain('Gravados');
    // Colunas
    expect(text).toContain('message_id');
    expect(text).toContain('is_gap');
    // Linhas
    expect(text).toContain('MSG-1');
    expect(text).toContain('MSG-2-GAP');

    await testInfo.attach('waha-audit-invocations', {
      body: JSON.stringify(invocations, null, 2), contentType: 'application/json',
    });
    await testInfo.attach('pdf-text', { body: text, contentType: 'text/plain' });
  });

  test('cenário vazio: CSV só com BOM e PDF válido com headers/KPIs mas sem linhas', async ({ page }, testInfo) => {
    currentBuilder = (body) => buildEmptyPayload({ order: body?.order ?? 'desc' });

    await page.goto(`/owner/company/${COMPANY_ID}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#tab-waha-debug').click();
    await expect.poll(() => invocations.length, { timeout: 15_000 }).toBeGreaterThan(0);

    // UI reflete estado vazio.
    await expect(page.getByText(/Nenhum evento WAHA/i)).toBeVisible();
    const nextBtn = page.getByRole('button', { name: /Próxima/i });
    const prevBtn = page.getByRole('button', { name: /Anterior/i });
    await expect(prevBtn).toBeDisabled();
    await expect(nextBtn).toBeDisabled();

    // CSV vazio = apenas BOM (\uFEFF), sem linhas de dados.
    const [csvDl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /^CSV$/ }).click(),
    ]);
    const csvBuf = await downloadToBuffer(csvDl);
    const csvStr = csvBuf.toString('utf8');
    expect(csvStr.charCodeAt(0)).toBe(0xFEFF);
    // Sem \n = sem linhas separadoras de dados.
    expect(csvStr.replace(/^\uFEFF/, '')).toBe('');

    // PDF ainda tem título, subtítulo e KPIs (mesmo com todos zero).
    const [pdfDl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /^PDF$/ }).click(),
    ]);
    const pdfBuf = await downloadToBuffer(pdfDl);
    const parsed = await pdfParse(pdfBuf);
    const text = parsed.text;
    expect(text).toContain('Auditoria WAHA');
    expect(text).toContain('Webhooks msg');
    expect(text).toContain('Gravados');
    // Nenhuma linha real de dados: os IDs mockados NÃO aparecem.
    expect(text).not.toContain('MSG-1');
    expect(text).not.toContain('MSG-2-GAP');

    await testInfo.attach('pdf-empty-text', { body: text, contentType: 'text/plain' });
  });

  test('erro 500 no waha-audit: UI mostra mensagem, exports ficam desabilitados e nenhum arquivo é gerado', async ({ page }) => {
    // Override o mock padrão do beforeEach: sempre retorna 500.
    await page.unroute('**/functions/v1/waha-audit');
    await page.route('**/functions/v1/waha-audit', async (route: Route) => {
      let body: any = {};
      try { body = route.request().postDataJSON(); } catch { body = {}; }
      invocations.push(body);
      return route.fulfill({
        status: 500, contentType: 'application/json',
        body: JSON.stringify({ error: 'internal_error', message: 'boom' }),
      });
    });

    await page.goto(`/owner/company/${COMPANY_ID}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#tab-waha-debug').click();
    await expect.poll(() => invocations.length, { timeout: 15_000 }).toBeGreaterThan(0);

    // Mensagem de erro renderizada de forma amigável.
    await expect(page.getByText(/^Erro:/)).toBeVisible();

    // Todos os botões de exportação ficam desabilitados enquanto data === null.
    for (const name of [/^CSV$/, /^PDF$/, /CSV consolidado/, /PDF consolidado/]) {
      await expect(page.getByRole('button', { name })).toBeDisabled();
    }

    // Paginação bloqueada (sem next_cursor e sem stack).
    await expect(page.getByRole('button', { name: /Próxima/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Anterior/i })).toBeDisabled();

    // Clicar no botão desabilitado (force) não dispara download algum: aguardamos
    // por 1.5s e o waitForEvent deve estourar timeout.
    let downloadFired = false;
    page.on('download', () => { downloadFired = true; });
    await page.getByRole('button', { name: /^CSV$/ }).click({ force: true }).catch(() => {});
    await page.getByRole('button', { name: /^PDF$/ }).click({ force: true }).catch(() => {});
    await page.waitForTimeout(1500);
    expect(downloadFired, 'nenhum arquivo deve ser gerado após erro 500').toBe(false);
  });

  test('intercepta body do waha-audit: order/cursor mudam exatamente no toggle de Prev/Next e asc/desc', async ({ page }) => {
    await page.goto(`/owner/company/${COMPANY_ID}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#tab-waha-debug').click();

    // #1 primeira request: cursor=null, order=desc.
    await expect.poll(() => invocations.length, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(invocations[0].cursor).toBeNull();
    expect(invocations[0].order).toBe('desc');

    const nextBtn = page.getByRole('button', { name: /Próxima/i });
    const prevBtn = page.getByRole('button', { name: /Anterior/i });

    // #2 Next → cursor vira o next_cursor da resposta anterior; order preservado.
    const n1 = invocations.length;
    await nextBtn.click();
    await expect.poll(() => invocations.length, { timeout: 10_000 }).toBeGreaterThan(n1);
    const afterNext = invocations[invocations.length - 1];
    expect(afterNext.cursor).toBe(PAGE1_LAST);
    expect(afterNext.order).toBe('desc');

    // #3 Prev → cursor volta a null; order preservado.
    const n2 = invocations.length;
    await prevBtn.click();
    await expect.poll(() => invocations.length, { timeout: 10_000 }).toBeGreaterThan(n2);
    const afterPrev = invocations[invocations.length - 1];
    expect(afterPrev.cursor).toBeNull();
    expect(afterPrev.order).toBe('desc');

    // #4 Toggle ordem → order=asc + cursor RESETADO para null.
    const n3 = invocations.length;
    await page.getByRole('button', { name: /Mais recentes|Mais antigos/i }).click();
    await expect.poll(() => invocations.length, { timeout: 10_000 }).toBeGreaterThan(n3);
    const afterAsc = invocations[invocations.length - 1];
    expect(afterAsc.order).toBe('asc');
    expect(afterAsc.cursor).toBeNull();

    // #5 Toggle novamente → order=desc + cursor ainda null.
    const n4 = invocations.length;
    await page.getByRole('button', { name: /Mais recentes|Mais antigos/i }).click();
    await expect.poll(() => invocations.length, { timeout: 10_000 }).toBeGreaterThan(n4);
    const afterDesc = invocations[invocations.length - 1];
    expect(afterDesc.order).toBe('desc');
    expect(afterDesc.cursor).toBeNull();
  });
});
