import { defineConfig, devices } from '@playwright/test';

/**
 * Configuração multi-browser para os suites E2E. Cada projeto executa o mesmo
 * conjunto de specs em Chromium, Firefox e WebKit para maximizar cobertura de
 * regressões dependentes de engine (renderização de PDF, downloads, etc.).
 *
 * A base URL default é o preview local do Vite (porta 8080). Sobrescreva via
 * PLAYWRIGHT_BASE_URL nos ambientes de CI/preview.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'playwright-report/results.json' }]]
    : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
