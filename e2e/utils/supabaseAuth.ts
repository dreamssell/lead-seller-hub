import type { BrowserContext, Page } from '@playwright/test';

/**
 * Helper de sessão Supabase para specs autenticadas.
 *
 * Estratégia:
 *   1. Se `LOVABLE_BROWSER_SUPABASE_SESSION_JSON` estiver injetado (sandbox
 *      gerenciado), restaura sessão via localStorage + cookies e navega para
 *      a rota protegida.
 *   2. Caso contrário, se `TEST_USER_EMAIL` + `TEST_USER_PASSWORD` estiverem
 *      definidos, chama supabase.auth.signInWithPassword direto no browser
 *      usando a URL/ANON KEY vindas do env (VITE_SUPABASE_URL /
 *      VITE_SUPABASE_ANON_KEY).
 *   3. Caso nenhum caminho esteja disponível, retorna `{ ok: false, reason }`
 *      para o spec chamar `test.skip(...)` com contexto útil no relatório.
 */
export type AuthResult =
  | { ok: true; via: 'injected' | 'password' }
  | { ok: false; reason: string };

const BASE = 'http://localhost:8080';

export async function loginSupabase(context: BrowserContext, page: Page): Promise<AuthResult> {
  const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const cookiesJson = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;

  if (sessionJson && storageKey) {
    if (cookiesJson) {
      try {
        const cookies = JSON.parse(cookiesJson) as Array<Record<string, unknown>>;
        for (const c of cookies) (c as any).url = BASE;
        await context.addCookies(cookies as any);
      } catch {
        /* cookies opcionais; continua com localStorage */
      }
    }
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(
      ([key, value]) => window.localStorage.setItem(key as string, value as string),
      [storageKey, sessionJson],
    );
    return { ok: true, via: 'injected' };
  }

  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  const supaUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (email && password && supaUrl && anonKey) {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const res = await page.evaluate(
      async ({ url, key, mail, pwd }) => {
        const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
          body: JSON.stringify({ email: mail, password: pwd }),
        });
        if (!r.ok) return { ok: false as const, status: r.status, body: await r.text() };
        const json = await r.json();
        const projectRef = new URL(url).host.split('.')[0];
        const storageKey = `sb-${projectRef}-auth-token`;
        // Formato aceito pelo supabase-js v2.
        const persisted = {
          access_token: json.access_token,
          refresh_token: json.refresh_token,
          expires_in: json.expires_in,
          expires_at: json.expires_at,
          token_type: json.token_type,
          user: json.user,
        };
        window.localStorage.setItem(storageKey, JSON.stringify(persisted));
        return { ok: true as const, storageKey };
      },
      { url: supaUrl, key: anonKey, mail: email, pwd: password },
    );
    if (!res.ok) return { ok: false, reason: `signInWithPassword falhou (HTTP ${res.status})` };
    return { ok: true, via: 'password' };
  }

  return {
    ok: false,
    reason:
      'Sessão Supabase indisponível: defina LOVABLE_BROWSER_SUPABASE_SESSION_JSON+STORAGE_KEY (sandbox) ou TEST_USER_EMAIL/TEST_USER_PASSWORD/VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY (CI).',
  };
}
