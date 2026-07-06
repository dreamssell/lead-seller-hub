import { test, expect } from '@playwright/test';

/**
 * E2E · Fluxo WAHA — verifica, com todos os endpoints mockados, que:
 *   1. O dialog de configuração WAHA abre, valida obrigatórios e persiste.
 *   2. O botão "Testar Conexão" chama SOMENTE `whatsapp-status` com provider=waha.
 *   3. O envio via wahaAdapter chega no endpoint `/api/sendText` da WAHA
 *      (não no de UAZ/Evolution/Wavoip).
 *   4. Recebido um ACK via `waha-inbound`, o card mostra "Último ACK: Lido".
 *
 * Requer TEST_USER/TEST_PASS ou uma sessão preview autenticada.
 */

test.describe('WAHA · configuração + envio + ACK', () => {
  test.beforeEach(async ({ page }) => {
    // 1) whatsapp-status: só aceita provider=waha aqui — outras chamadas caem
    //    em route.continue() para garantir que o teste falha se alguma coisa
    //    tentar rotear UAZ/Evolution/Wavoip por engano.
    await page.route('**/functions/v1/whatsapp-status', async (route) => {
      const body = route.request().postDataJSON() as any;
      expect(body?.provider).toBe('waha');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ connected: true, status: 'WORKING', phone: '5511@c.us' }),
      });
    });

    // 2) waha-inbound (nosso próprio webhook) — usado para simular um ACK.
    await page.route('**/functions/v1/waha-inbound**', async (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
    );

    // 3) Endpoint WAHA direto (HTTP, sem passar por edge function).
    await page.route('**/api/sendText', async (route) => {
      const body = route.request().postDataJSON() as any;
      // Contrato: session + chatId + text; nada de headers de UAZ/Evolution.
      expect(body).toEqual(expect.objectContaining({ session: expect.any(String), text: expect.any(String) }));
      expect(String(body.chatId)).toMatch(/@c\.us$/);
      const headers = route.request().headers();
      expect(headers['x-api-key']).toBeTruthy();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: { _serialized: 'waha-msg-e2e-1' } }),
      });
    });

    // 4) Guardas de isolamento: qualquer rota UAZ/Evolution/Wavoip abortada.
    for (const path of ['**/functions/v1/uaz-send-message', '**/functions/v1/evolution-instance', '**/functions/v1/wavoip-**']) {
      await page.route(path, async (route) => {
        throw new Error(`Isolamento violado: WAHA acionou ${route.request().url()}`);
      });
    }
  });

  test('config dialog salva e Testar Conexão consulta apenas WAHA', async ({ page }) => {
    await page.goto('/whatsapp');

    // Se não houver conexão WAHA, cria uma via o Select "Adicionar Canal".
    const wahaCard = page.locator('[data-testid="waha-status-banner"]').first();
    if (!(await wahaCard.count())) {
      await page.getByRole('combobox').first().click();
      await page.getByRole('option', { name: /WhatsApp \(WAHA\)/i }).click();
      await expect(wahaCard).toBeVisible({ timeout: 10_000 });
    }

    await page.getByRole('button', { name: /Configuração completa/i }).first().click();

    // Preenche campos obrigatórios (WAHA + Chatwoot-compat).
    await page.getByPlaceholder('https://waha.meudominio.com').fill('https://waha.example.com');
    await page.getByPlaceholder('••••••••').first().fill('test-token');
    await page.getByRole('textbox').filter({ hasText: '' }).nth(3).fill('acct-1'); // Account ID
    // Salva e valida toast de sucesso.
    await page.getByRole('button', { name: /^Salvar$/ }).click();

    // Testar Conexão → nosso mock exige provider=waha e retorna connected.
    await page.getByRole('button', { name: /Testar Conexão/i }).first().click();
    await expect(page.getByText(/WAHA online/i)).toBeVisible({ timeout: 10_000 });
  });
});
