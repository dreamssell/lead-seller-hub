import { test, expect } from '@playwright/test';

test.describe('Webhook Polling Persistence', () => {
  test('should persist polling state when navigating away and back', async ({ page }) => {
    // 1. Navegar para a página com um correlation_id específico
    await page.goto('/cadastros?correlation_id=test-corr-123&entity=contacts');
    
    // 2. Verificar se o modal está aberto e o polling está ativo por padrão
    const pauseButton = page.getByRole('button', { name: /pausar/i });
    await expect(pauseButton).toBeVisible();
    
    // 3. Pausar o polling
    await pauseButton.click();
    const resumeButton = page.getByRole('button', { name: /retomar/i });
    await expect(resumeButton).toBeVisible();
    
    // Verificar se a URL foi atualizada com polling=false
    expect(page.url()).toContain('polling=false');
    
    // 4. Navegar para outra rota interna (ex: Dashboard)
    await page.click('nav >> text=Dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
    
    // 5. Voltar para a página original
    await page.click('nav >> text=Cadastros');
    
    // 6. Verificar se o estado de pausa foi mantido
    await expect(page.getByRole('button', { name: /retomar/i })).toBeVisible();
    expect(page.url()).toContain('polling=false');
  });

  test('should cleanup expired highlight from URL', async ({ page }) => {
    // Simular um highlight_card que não existe ou expirado injetando dados no localStorage antes
    await page.addInitScript(() => {
      window.localStorage.setItem('kanban_highlighted_card', 'non-existent-card');
      window.localStorage.setItem('kanban_highlighted_time', (Date.now() - 2000000).toString());
    });

    await page.goto('/cadastros?entity=contacts&viewMode=kanban&highlight_card=non-existent-card');
    
    // Verificar se o parâmetro foi removido da URL após a inicialização (limpeza automática)
    await page.waitForTimeout(2000); // Esperar o useEffect de limpeza
    expect(page.url()).not.toContain('highlight_card=');
  });
});
