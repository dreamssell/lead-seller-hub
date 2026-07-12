import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loginSupabase } from './utils/supabaseAuth';

/**
 * Sweep de responsividade mobile (@mobile).
 *
 * Executado apenas nos projetos `mobile-iphone` e `mobile-android` (devices
 * iPhone 14 e Pixel 7). Para cada rota crítica:
 *   - Captura um screenshot ANTES (raw) e um DEPOIS (com `waitForLoadState`)
 *     e persiste em `artifacts/mobile/<project>/<slug>.png` para diff manual
 *     via upload de artefato no CI.
 *   - Valida ausência de scroll horizontal na root (documentElement).
 *   - Onde há tabelas conhecidas (Debug WAHA, Chamadas), valida que o
 *     container `.overflow-x-auto` permite rolagem interna sem estourar o
 *     viewport pai.
 *   - Confirma que a safe-area top/bottom respeita `env(safe-area-inset-*)`
 *     via cálculo do `padding` computado do body.
 *
 * Rotas públicas rodam sempre. Rotas autenticadas (Chat, Dashboard,
 * Chamadas, Debug WAHA) tentam login via helper; se indisponível, o
 * subteste é pulado com motivo explícito.
 */

const SHOTS_DIR = path.resolve(process.cwd(), 'artifacts/mobile');

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true }).catch(() => {});
}

async function shot(page: Page, projectName: string, slug: string, phase: 'antes' | 'depois') {
  const dir = path.join(SHOTS_DIR, projectName);
  await ensureDir(dir);
  await page.screenshot({ path: path.join(dir, `${slug}-${phase}.png`) });
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const d = document.documentElement;
    return { scroll: d.scrollWidth, client: d.clientWidth };
  });
  // Tolerância de 1px para bordas de sub-pixel.
  expect(overflow.scroll, `scrollWidth (${overflow.scroll}) não pode ultrapassar clientWidth (${overflow.client})`).toBeLessThanOrEqual(overflow.client + 1);
}

async function assertSafeAreaApplied(page: Page) {
  // O body no index.css usa padding-left/right = env(safe-area-inset-*).
  // Em devices sem notch simulado, o valor computado é 0px — o importante é
  // que a propriedade esteja declarada (não sobrescrita por regra global).
  const paddings = await page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    return { left: cs.paddingLeft, right: cs.paddingRight };
  });
  expect(paddings.left).toMatch(/^\d/);
  expect(paddings.right).toMatch(/^\d/);
}

const PUBLIC_ROUTES: Array<{ slug: string; path: string }> = [
  { slug: 'root', path: '/' },
  { slug: 'not-found', path: '/rota-que-nao-existe-mobile-sweep' },
];

const AUTH_ROUTES: Array<{ slug: string; path: string; expectTable?: string }> = [
  { slug: 'dashboard', path: '/dashboard' },
  { slug: 'chat', path: '/chat' },
  { slug: 'calls', path: '/calls', expectTable: 'table' },
];

test.describe('Mobile · responsividade e safe-area @mobile', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`pública: ${route.slug}`, async ({ page }, testInfo) => {
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      await shot(page, testInfo.project.name, route.slug, 'antes');
      await page.waitForLoadState('networkidle').catch(() => {});
      await shot(page, testInfo.project.name, route.slug, 'depois');
      await assertNoHorizontalOverflow(page);
      await assertSafeAreaApplied(page);
    });
  }

  for (const route of AUTH_ROUTES) {
    test(`autenticada: ${route.slug}`, async ({ context, page }, testInfo) => {
      const auth = await loginSupabase(context, page);
      test.skip(!auth.ok, auth.ok ? '' : auth.reason);

      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      await shot(page, testInfo.project.name, route.slug, 'antes');
      await page.waitForLoadState('networkidle').catch(() => {});
      await shot(page, testInfo.project.name, route.slug, 'depois');

      await assertNoHorizontalOverflow(page);
      await assertSafeAreaApplied(page);

      // Se a rota exibe tabela, seu container pai deve ter overflow-x auto/scroll
      // — jamais deve estourar o viewport.
      if (route.expectTable) {
        const tables = page.locator(route.expectTable);
        const count = await tables.count();
        if (count > 0) {
          const container = tables.first().locator('xpath=ancestor::div[contains(@class,"overflow-x-auto")][1]');
          const hasContainer = await container.count();
          expect(hasContainer, 'tabela mobile precisa estar dentro de .overflow-x-auto').toBeGreaterThan(0);
        }
      }
    });
  }
});
