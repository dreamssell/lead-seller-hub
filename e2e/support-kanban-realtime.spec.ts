import { test, expect } from '@playwright/test';
import { loginSupabase } from './utils/supabaseAuth';

/**
 * E2E: alteração de status e responsável no card do Kanban da Central de Suporte
 * deve refletir instantaneamente na caixa seletora, sem recarregar a página,
 * e o histórico deve receber o novo registro via realtime.
 */
test('kanban master: status e responsável mudam sem reload e aparecem no histórico', async ({ context, page }) => {
  const auth = await loginSupabase(context, page);
  test.skip(!auth.ok, `Sem sessão master disponível: ${(auth as any).reason ?? 'n/a'}`);

  await page.goto('http://localhost:8080/suporte/master', { waitUntil: 'domcontentloaded' });

  // Aguarda algum card do Kanban aparecer
  const firstCard = page.locator('[data-testid^="support-card-"]').first();
  await firstCard.waitFor({ state: 'visible', timeout: 15_000 });

  const cardId = (await firstCard.getAttribute('data-testid'))!.replace('support-card-', '');
  const statusTrigger = page.getByTestId(`status-select-${cardId}`);
  const assigneeTrigger = page.getByTestId(`assignee-select-${cardId}`);

  const initialStatus = (await statusTrigger.innerText()).trim();
  const initialAssignee = (await assigneeTrigger.innerText()).trim();

  // Sem reload em todo o teste — monitoramos que não houve navegação
  let navigated = false;
  page.on('framenavigated', () => { navigated = true; });

  // ---- Mudar status ----
  await statusTrigger.click();
  const options = page.getByRole('option');
  const optionCount = await options.count();
  let picked: string | null = null;
  for (let i = 0; i < optionCount; i++) {
    const label = (await options.nth(i).innerText()).trim();
    if (label && label !== initialStatus) {
      picked = label;
      await options.nth(i).click();
      break;
    }
  }
  expect(picked, 'Não havia opção alternativa de status').not.toBeNull();

  // A caixa seletora deve refletir a nova opção imediatamente (update otimista)
  await expect(statusTrigger).toContainText(picked!, { timeout: 3_000 });

  // ---- Mudar responsável ----
  await assigneeTrigger.click();
  const assigneeOpts = page.getByRole('option');
  const aCount = await assigneeOpts.count();
  let pickedA: string | null = null;
  for (let i = 0; i < aCount; i++) {
    const label = (await assigneeOpts.nth(i).innerText()).trim();
    if (label && label !== initialAssignee) {
      pickedA = label;
      await assigneeOpts.nth(i).click();
      break;
    }
  }
  expect(pickedA, 'Não havia opção alternativa de responsável').not.toBeNull();
  await expect(assigneeTrigger).toContainText(pickedA!, { timeout: 3_000 });

  // Garante que não recarregamos a página
  expect(navigated).toBe(false);

  // ---- Verifica histórico via realtime abrindo o detalhe do ticket ----
  await page.goto(`http://localhost:8080/suporte/${cardId}`, { waitUntil: 'domcontentloaded' });
  const history = page.getByTestId('status-history-list');
  await expect(history).toBeVisible({ timeout: 10_000 });
  await expect(history).toContainText(picked!);
});
