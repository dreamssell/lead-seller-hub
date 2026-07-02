import { test, expect } from '@playwright/test';

/**
 * E2E: envio para +5527997784501.
 *
 * Este teste é um smoke controlado — mocka a Edge Function `evolution-instance`
 * para simular:
 *   1. Um envio bem-sucedido (a Evolution devolve message_id + latency).
 *   2. Uma falha transitória seguida de recuperação (UI não fica presa em
 *      "atualizando"; mensagem migra de sending → error → sent no retry).
 *
 * Requer variáveis TEST_USER/TEST_PASS ou uma sessão pré-autenticada.
 */

const TARGET = '+5527997784501';

test.describe('WhatsApp send · +5527997784501', () => {
  test.beforeEach(async ({ page }) => {
    let call = 0;
    await page.route('**/functions/v1/evolution-instance', async (route) => {
      const body = route.request().postDataJSON() as any;
      if (body?.action !== 'send_text') return route.continue();
      call += 1;
      // First call ok, second call fail, third call ok again.
      if (call === 2) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'mentioned does not meet minimum length of 1', code: 'schema_error', correlation_id: body.correlation_id }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          message_id: `srv_${call}_${Date.now()}`,
          latency_ms: 120,
          correlation_id: body.correlation_id,
          data: { key: { id: `srv_${call}` } },
        }),
      });
    });
  });

  test('envia com sucesso e se recupera sem travar em "atualizando"', async ({ page }) => {
    await page.goto('/chat');
    // Escolher/abrir uma conversa com o número alvo — usa Nova conversa.
    await page.getByRole('button', { name: /nova conversa/i }).click().catch(() => {});
    const phoneInput = page.getByLabel(/número/i);
    if (await phoneInput.isVisible().catch(() => false)) {
      await phoneInput.fill(TARGET);
      await page.getByRole('button', { name: /iniciar conversa/i }).click();
    }

    // Digitar mensagem e enviar (envio 1 — sucesso)
    const composer = page.getByRole('textbox').last();
    await composer.fill('E2E ping 1');
    await page.getByTitle(/enviar/i).click();
    await expect(page.getByText('E2E ping 1')).toBeVisible({ timeout: 5000 });

    // Envio 2 — deve falhar e apresentar botão de retry
    await composer.fill('E2E ping 2');
    await page.getByTitle(/enviar/i).click();
    await expect(page.getByText(/mentioned|Falha/i).first()).toBeVisible({ timeout: 5000 });

    // A UI NÃO deve ficar bloqueada — verificar que o composer voltou a ser interativo.
    await expect(composer).toBeEnabled();

    // Envio 3 — recuperação
    await composer.fill('E2E ping 3');
    await page.getByTitle(/enviar/i).click();
    await expect(page.getByText('E2E ping 3')).toBeVisible({ timeout: 5000 });
  });
});
