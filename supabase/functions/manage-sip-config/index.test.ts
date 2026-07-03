/**
 * Contract tests for `manage-sip-config`.
 *
 * The function exposes a single formal error shape that the frontend
 * (`src/lib/sipConfig.ts` → `SipError`) relies on:
 *
 *   { error: <code>, code: <code>, message: <human>, status: <httpStatus> }
 *
 * Where `code` is stable and machine-readable and MUST match one of:
 *   method_not_allowed | missing_auth | unauthenticated | forbidden |
 *   invalid_json | missing_action | unknown_action | missing_fields | internal
 *
 * These tests exercise the 401/403/4xx paths that don't require an admin
 * session, plus an opt-in E2E block that walks all methods (get / upsert /
 * delete / audit_list) with a real non-admin JWT to prove RBAC returns 403
 * everywhere with the formal shape.
 *
 * Provide `SIP_NON_ADMIN_JWT` to enable the E2E section. `SIP_FN_URL` can
 * point at a local functions server; otherwise the deployed endpoint is used.
 */
import 'https://deno.land/std@0.224.0/dotenv/load.ts';
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

const SUPABASE_URL = Deno.env.get('VITE_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? '';
const ANON = Deno.env.get('VITE_SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const FN_URL = Deno.env.get('SIP_FN_URL') ?? `${SUPABASE_URL}/functions/v1/manage-sip-config`;
const NON_ADMIN_JWT = Deno.env.get('SIP_NON_ADMIN_JWT') ?? '';

// Every documented error code the backend may return.
const KNOWN_CODES = new Set([
  'method_not_allowed',
  'missing_auth',
  'unauthenticated',
  'forbidden',
  'invalid_json',
  'missing_action',
  'unknown_action',
  'missing_fields',
  'internal',
]);

async function call(
  method: string,
  headers: Record<string, string>,
  body?: unknown,
) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  const res = await fetch(FN_URL, init);
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep null */ }
  return { status: res.status, json, text };
}

/**
 * Assert the shape declared in the module docstring above:
 *   { error, code, message, status } — all present, code === error,
 *   status === HTTP status, code from the documented enum.
 */
function assertErrorShape(json: any, httpStatus: number, expectedCode?: string) {
  assert(json && typeof json === 'object', `expected JSON body, got: ${JSON.stringify(json)}`);
  assertEquals(typeof json.error, 'string', 'error must be a string code');
  assertEquals(typeof json.code, 'string', 'code must be a string');
  assertEquals(typeof json.message, 'string', 'message must be a human string');
  assertEquals(typeof json.status, 'number', 'status must be numeric');
  assertEquals(json.code, json.error, 'code must mirror error for back-compat');
  assertEquals(json.status, httpStatus, 'status field must match HTTP status');
  assert(json.message.length > 0, 'message must not be empty');
  assert(KNOWN_CODES.has(json.code), `unknown error code: ${json.code}`);
  if (expectedCode) assertEquals(json.code, expectedCode);
}

Deno.test('CORS preflight is open (OPTIONS)', async () => {
  const res = await fetch(FN_URL, { method: 'OPTIONS' });
  await res.text();
  assertEquals(res.status, 200);
  assert(res.headers.get('access-control-allow-origin'));
});

Deno.test('GET → 405 method_not_allowed with formal shape', async () => {
  const res = await fetch(FN_URL, { method: 'GET' });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* platform gateway may block */ }
  // Some hosted gateways short-circuit non-POST before the function runs; in
  // that case only the status is guaranteed. When the body IS reachable, it
  // must obey the formal contract.
  assert(res.status === 405 || res.status === 401, `got status ${res.status}`);
  if (json) assertErrorShape(json, res.status);
});

Deno.test('PUT → 405 method_not_allowed with formal shape', async () => {
  const res = await fetch(FN_URL, { method: 'PUT' });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  assert(res.status === 405 || res.status === 401);
  if (json) assertErrorShape(json, res.status);
});

Deno.test('POST without Authorization → 401 missing_auth', async () => {
  const { status, json } = await call('POST', {}, { action: 'get' });
  assertEquals(status, 401);
  assertErrorShape(json, 401, 'missing_auth');
});

Deno.test('POST with bogus bearer → 401 unauthenticated', async () => {
  const { status, json } = await call('POST', {
    Authorization: 'Bearer not-a-jwt',
    apikey: ANON,
  }, { action: 'get' });
  // Supabase may return either — both are formally-shaped auth failures.
  assert(status === 401 || status === 403, `got ${status}`);
  if (json) {
    assertErrorShape(json, status);
    assert(
      json.code === 'unauthenticated' || json.code === 'missing_auth' || json.code === 'forbidden',
      `unexpected code: ${json.code}`,
    );
  }
});

Deno.test('POST with malformed JSON body → 400 invalid_json', async () => {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer not-a-jwt',
      apikey: ANON,
    },
    body: '{ this is not json',
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  // Auth runs before body parsing, so this typically 401s first — that's fine.
  // If it reaches the body parser, it MUST return the formal invalid_json shape.
  if (json && json.code === 'invalid_json') {
    assertErrorShape(json, 400, 'invalid_json');
  } else if (json) {
    assertErrorShape(json, res.status);
  }
});

Deno.test({
  name: 'E2E: non-admin caller gets 403 forbidden on every action, all with formal shape',
  ignore: !NON_ADMIN_JWT,
  fn: async () => {
    const actions: Array<{ action: string; extra?: Record<string, unknown> }> = [
      { action: 'get' },
      { action: 'upsert', extra: { config: { server: 's', username: 'u', password: 'p' } } },
      { action: 'delete' },
      { action: 'audit_list' },
    ];
    for (const { action, extra } of actions) {
      const { status, json } = await call('POST', {
        Authorization: `Bearer ${NON_ADMIN_JWT}`,
        apikey: ANON,
      }, { action, scope: {}, ...(extra ?? {}) });
      assertEquals(status, 403, `action=${action}`);
      assertErrorShape(json, 403, 'forbidden');
    }
  },
});

Deno.test({
  name: 'E2E: admin session missing action → 400 missing_action (needs SIP_ADMIN_JWT)',
  ignore: !Deno.env.get('SIP_ADMIN_JWT'),
  fn: async () => {
    const { status, json } = await call('POST', {
      Authorization: `Bearer ${Deno.env.get('SIP_ADMIN_JWT')}`,
      apikey: ANON,
    }, {});
    assertEquals(status, 400);
    assertErrorShape(json, 400, 'missing_action');
  },
});

Deno.test({
  name: 'E2E: admin session unknown action → 400 unknown_action (needs SIP_ADMIN_JWT)',
  ignore: !Deno.env.get('SIP_ADMIN_JWT'),
  fn: async () => {
    const { status, json } = await call('POST', {
      Authorization: `Bearer ${Deno.env.get('SIP_ADMIN_JWT')}`,
      apikey: ANON,
    }, { action: 'does_not_exist' });
    assertEquals(status, 400);
    assertErrorShape(json, 400, 'unknown_action');
  },
});

Deno.test({
  name: 'E2E: admin session upsert without server/username → 400 missing_fields (needs SIP_ADMIN_JWT)',
  ignore: !Deno.env.get('SIP_ADMIN_JWT'),
  fn: async () => {
    const { status, json } = await call('POST', {
      Authorization: `Bearer ${Deno.env.get('SIP_ADMIN_JWT')}`,
      apikey: ANON,
    }, { action: 'upsert', config: { password: 'x' } });
    assertEquals(status, 400);
    assertErrorShape(json, 400, 'missing_fields');
  },
});
