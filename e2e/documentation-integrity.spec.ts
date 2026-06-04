import { test, expect } from '@playwright/test';

test.describe('Documentation Page Integrity & Polling', () => {
  
  test('should display all documentation sections correctly', async ({ page }) => {
    // Navegar para a página de documentação
    await page.goto('/documentation');
    
    // 1. Validar REST API (padrão)
    await expect(page.getByText('Endpoints REST')).toBeVisible();
    await expect(page.getByText('/v1/authenticate')).toBeVisible();
    
    // 2. Mudar para MCP Server
    await page.getByRole('tab', { name: 'MCP Server' }).click();
    await expect(page.getByText('Model Context Protocol (MCP)')).toBeVisible();
    await expect(page.getByText('get_leads')).toBeVisible();
    
    // 3. Mudar para Webhooks
    await page.getByRole('tab', { name: 'Webhooks' }).click();
    await expect(page.getByText('Webhooks de Saída')).toBeVisible();
    await expect(page.getByText('lead.created')).toBeVisible();
    
    // 4. Mudar para Console
    await page.getByRole('tab', { name: 'Console' }).click();
    await expect(page.getByPlaceholder(/Digite um comando/i)).toBeVisible();
  });

  test('should persist polling state via URL without localStorage', async ({ browser }) => {
    // Criar um contexto novo sem nenhum dado persistido para garantir que o localStorage não influencie
    const context = await browser.newContext();
    const page = await context.newPage();

    const correlationId = 'test-e2e-' + Date.now();
    // 1. Iniciar com polling pausado (via URL)
    await page.goto(`/cadastros?correlation_id=${correlationId}&entity=contacts&polling=false`);
    
    // 2. Verificar se o modal está aberto e o botão "Retomar" está visível (indicando que está pausado)
    await expect(page.getByRole('button', { name: /retomar/i })).toBeVisible();
    await expect(page.url()).toContain('polling=false');

    // 3. Retomar o polling
    await page.getByRole('button', { name: /retomar/i }).click();
    await expect(page.getByRole('button', { name: /pausar/i })).toBeVisible();
    await expect(page.url()).toContain('polling=true');

    // 4. Navegar para outra rota (simulando clique na sidebar)
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);

    // 5. Voltar para a página original informando polling=true na URL
    await page.goto(`/cadastros?correlation_id=${correlationId}&entity=contacts&polling=true`);
    
    // 6. Verificar se o estado "Pausar" permanece (polling ativo)
    await expect(page.getByRole('button', { name: /pausar/i })).toBeVisible();
    
    await context.close();
  });

});
