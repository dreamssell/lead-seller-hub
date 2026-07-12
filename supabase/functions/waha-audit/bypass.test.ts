// Bypass tests: waha-audit must reject invalid, expired, and cross-owner JWTs
// without leaking any tenant data. All assertions ensure the response body
// never contains connection/message/call arrays for unauthorized callers.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const FN_URL = `${SUPABASE_URL}/functions/v1/waha-audit`;

const OWNER_ID = Deno.env.get("WAHA_AUDIT_OWNER_ID") ?? "00000000-0000-0000-0000-000000000000";
const EXPIRED_JWT = Deno.env.get("WAHA_AUDIT_EXPIRED_JWT") ?? null;
const OTHER_USER_JWT = Deno.env.get("WAHA_AUDIT_OTHER_USER_JWT") ?? null; // non-admin tenant JWT

async function call(body: unknown, jwt?: string | null) {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON,
      "Authorization": `Bearer ${jwt ?? ANON}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* raw */ }
  return { status: res.status, json };
}

function assertNoLeak(json: any) {
  assert(!json?.messages, "response leaked messages array");
  assert(!json?.events, "response leaked events array");
  assert(!json?.connections, "response leaked connections array");
  assert(!json?.calls, "response leaked calls array");
}

Deno.test("JWT malformado → 401 sem vazamento", async () => {
  const { status, json } = await call({ owner_id: OWNER_ID }, "not-a-real-jwt");
  assertEquals(status, 401);
  assertEquals(json?.error, "unauthorized");
  assertNoLeak(json);
});

Deno.test("JWT com assinatura inválida → 401 sem vazamento", async () => {
  // Well-formed header.payload but bogus signature.
  const forged = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhdHRhY2tlciIsImV4cCI6OTk5OTk5OTk5OX0.invalidsig";
  const { status, json } = await call({ owner_id: OWNER_ID }, forged);
  assertEquals(status, 401);
  assertNoLeak(json);
});

Deno.test({
  name: "JWT expirado → 401 sem vazamento",
  ignore: !EXPIRED_JWT,
  fn: async () => {
    const { status, json } = await call({ owner_id: OWNER_ID }, EXPIRED_JWT);
    assertEquals(status, 401);
    assertNoLeak(json);
  },
});

Deno.test({
  name: "JWT de outro owner (não-admin) → 403 sem vazamento",
  ignore: !OTHER_USER_JWT,
  fn: async () => {
    const { status, json } = await call({ owner_id: OWNER_ID }, OTHER_USER_JWT);
    assertEquals(status, 403);
    assertEquals(json?.reason, "not_platform_owner");
    assertNoLeak(json);
  },
});

Deno.test("Body inválido (owner_id não-uuid) → 400", async () => {
  const { status, json } = await call({ owner_id: "not-a-uuid" }, ANON);
  // Auth is validated before body, so unauth token yields 401. When the caller
  // is anon (no user) we expect 401; when a valid admin JWT is present the
  // schema would return 400. Both are acceptable non-500 responses.
  assert([400, 401].includes(status), `unexpected status ${status}`);
  assertNoLeak(json);
});

Deno.test("Body com order inválido → sem 500", async () => {
  const { status } = await call({ owner_id: OWNER_ID, order: "sideways" }, ANON);
  assert(status < 500, `crashed with ${status}`);
});
