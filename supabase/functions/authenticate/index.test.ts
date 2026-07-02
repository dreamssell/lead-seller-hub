import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FN_URL = `${SUPABASE_URL}/functions/v1/authenticate`;

// Optional env for a real end-to-end login. When not present, we still validate
// input handling, CORS and error shape (all statically assertible).
const TEST_EMAIL = Deno.env.get("TEST_LOGIN_EMAIL");
const TEST_PASSWORD = Deno.env.get("TEST_LOGIN_PASSWORD");
const TEST_API_KEY = Deno.env.get("TEST_PLATFORM_API_KEY");

const PLATFORM_URL_DEFAULT = "https://connecto-center.lovable.app";

async function callFn(body: unknown, extraHeaders: Record<string, string> = {}) {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep null */ }
  return { res, text, json };
}

Deno.test("CORS preflight responds with allow-origin", async () => {
  const res = await fetch(FN_URL, { method: "OPTIONS" });
  await res.text();
  assertEquals(res.status, 200);
  assert(res.headers.get("access-control-allow-origin"));
});

Deno.test("missing fields returns 400", async () => {
  const { res, json } = await callFn({ email: "only@example.com" });
  assertEquals(res.status, 400);
  assert(json?.error);
});

Deno.test("invalid api_key returns 403", async () => {
  const { res, json } = await callFn({
    email: "someone@example.com",
    password: "irrelevant",
    api_key: "definitely-not-a-real-key",
  });
  assertEquals(res.status, 403);
  assertEquals(json?.success, false);
});

Deno.test({
  name: "full login flow returns session + callback redirect URL",
  ignore: !TEST_EMAIL || !TEST_PASSWORD || !TEST_API_KEY,
  fn: async () => {
    const { res, json } = await callFn({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      api_key: TEST_API_KEY,
    });
    assertEquals(res.status, 200);
    assertEquals(json?.success, true);
    assert(json.session?.access_token, "access_token missing");
    assert(json.session?.refresh_token, "refresh_token missing");

    // Redirect URL must point at /auth/callback with both tokens.
    const url = new URL(json.redirectUrl);
    assertEquals(url.pathname, "/auth/callback");
    assertEquals(url.searchParams.get("access_token"), json.session.access_token);
    assertEquals(url.searchParams.get("refresh_token"), json.session.refresh_token);

    // Must be an https URL and not the broken hub.leadseller.com.br default.
    assertEquals(url.protocol, "https:");
    assert(url.origin !== "https://hub.leadseller.com.br", "redirect still points at broken default");
    assertStringIncludes(url.origin, PLATFORM_URL_DEFAULT.replace("https://", "").split(".")[1] ?? "lovable");

    // Callback route must exist and load (SPA fallback = 200 with HTML).
    const cb = await fetch(json.redirectUrl, { redirect: "manual" });
    const body = await cb.text();
    assert(cb.status === 200, `callback returned ${cb.status}`);
    assertStringIncludes(body.toLowerCase(), "<div id=\"root\"");
  },
});
