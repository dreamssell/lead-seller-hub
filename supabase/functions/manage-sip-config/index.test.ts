/**
 * Backend authorization regression: `manage-sip-config` must reject every
 * caller that is not authenticated OR is not a platform admin, no matter
 * which action they try. This guards against direct API access bypassing
 * the frontend tab-visibility gate.
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

Deno.test({
  name: 'rejects authenticated non-admin users with 403 (requires SIP_NON_ADMIN_JWT env)',
  ignore: !NON_ADMIN_JWT,
  fn: async () => {
    for (const action of ['get', 'upsert', 'delete', 'audit_list']) {
      const { status, body } = await call(
        { Authorization: `Bearer ${NON_ADMIN_JWT}`, apikey: ANON },
        { action, scope: {}, config: { server: 's', username: 'u', password: 'p' } },
      );
      assertEquals(status, 403, `action=${action} body=${body}`);
    }
  },
});
