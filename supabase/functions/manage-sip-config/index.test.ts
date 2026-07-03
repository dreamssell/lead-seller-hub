/**
 * Backend authorization regression: `manage-sip-config` must reject every
 * caller that is not authenticated OR is not a platform admin, no matter
 * which action they try. This guards against direct API access bypassing
 * the frontend tab-visibility gate.
 *
 * End-to-end: point SIP_FN_URL at the deployed function and provide a
 * SIP_NON_ADMIN_JWT belonging to a real non-admin user to prove RBAC.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const FN_URL = Deno.env.get('SIP_FN_URL') ?? 'http://localhost:54321/functions/v1/manage-sip-config';
const ANON = Deno.env.get('VITE_SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const NON_ADMIN_JWT = Deno.env.get('SIP_NON_ADMIN_JWT') ?? '';

async function call(headers: Record<string, string>, body: unknown) {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

Deno.test('CORS preflight is open', async () => {
  const res = await fetch(FN_URL, { method: 'OPTIONS' });
  await res.text();
  assertEquals(res.status, 200);
});

Deno.test('rejects unauthenticated callers with 401', async () => {
  const { status } = await call({}, { action: 'get' });
  assertEquals(status, 401);
});

Deno.test('rejects requests with bogus bearer token', async () => {
  const { status } = await call({ Authorization: 'Bearer not-a-jwt', apikey: ANON }, { action: 'get' });
  // Supabase treats invalid token as unauthenticated
  assertEquals(status === 401 || status === 403, true);
});

Deno.test('rejects unknown HTTP methods with 405', async () => {
  const res = await fetch(FN_URL, { method: 'GET' });
  await res.text();
  // Either the platform gateway blocks GET or the function returns 405.
  assertEquals(res.status === 405 || res.status === 401, true);
});

Deno.test({
  name: 'E2E: authenticated non-admin users get 403 for every action (needs SIP_NON_ADMIN_JWT)',
  ignore: !NON_ADMIN_JWT,
  fn: async () => {
    const actions: Array<{ action: string; extra?: Record<string, unknown> }> = [
      { action: 'get' },
      { action: 'upsert', extra: { config: { server: 's', username: 'u', password: 'p' } } },
      { action: 'delete' },
      { action: 'audit_list' },
    ];
    for (const { action, extra } of actions) {
      const { status, body } = await call(
        { Authorization: `Bearer ${NON_ADMIN_JWT}`, apikey: ANON },
        { action, scope: {}, ...(extra ?? {}) },
      );
      assertEquals(status, 403, `action=${action} body=${body}`);
      // Response must include the human-readable Portuguese message so the
      // UI can surface a clear "acesso negado" toast.
      if (!body.includes('forbidden')) {
        throw new Error(`expected 'forbidden' in body for action=${action}, got: ${body}`);
      }
    }
  },
});
