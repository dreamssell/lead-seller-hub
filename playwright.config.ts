import { defineConfig, devices } from '@playwright/test';

/**
 * Configuração multi-browser + multi-dispositivo para os suites E2E.
 *
 * Projetos desktop (chromium/firefox/webkit) rodam todos os specs.
 * Projetos mobile (iPhone 14 e Pixel 7) são restritos aos specs de
 * responsividade e a fluxos de auditoria que precisam validar viewport
 * pequeno (grep tag @mobile) para não estourar o wall time do CI.
 *
 * Sobrescreva a URL base via PLAYWRIGHT_BASE_URL em ambientes de preview.
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
    // Desktop — todos os specs.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    // Mobile — apenas specs marcadas @mobile.
    {
      name: 'mobile-iphone',
      grep: /@mobile/,
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'mobile-android',
      grep: /@mobile/,
      use: { ...devices['Pixel 7'] },
    },
  ],
});
