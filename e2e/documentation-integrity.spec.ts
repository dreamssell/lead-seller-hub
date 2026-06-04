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
    // Criar um contexto novo sem nenhum dado persistido
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] }
    });
    const page = await context.newPage();

    const correlationId = 'test-e2e-' + Date.now();
    // Iniciar com polling ativo (default)
    await page.goto(`/cadastros?correlation_id=${correlationId}&entity=contacts&polling=true`);
    
    // Localizar botão de pausa
    const pauseButton = page.getByRole('button', { name: /pausar/i });
    await expect(pauseButton).toBeVisible();
    
    // Pausar
    await pauseButton.click();
    await expect(page.url()).toContain('polling=false');
    await expect(page.getByRole('button', { name: /retomar/i })).toBeVisible();

    // Navegar para outra rota (simulando clique na sidebar)
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);

    // Voltar usando o link que contém o estado na URL (ou simulando o retorno do usuário)
    await page.goto(`/cadastros?correlation_id=${correlationId}&entity=contacts&polling=false`);
    
    // Verificar se o estado de pausa persiste (botão de retomar visível)
    await expect(page.getByRole('button', { name: /retomar/i })).toBeVisible();
    
    await context.close();
  });
});
