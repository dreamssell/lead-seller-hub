// Integration tests for manage-account-user edge function.
// These call the deployed function via HTTP and validate that failure paths
// return machine-readable JSON errors (used by the TeamPage toast layer).
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const FN_URL = `${SUPABASE_URL}/functions/v1/manage-account-user`;

async function call(body: unknown, auth?: string) {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON,
      "Authorization": `Bearer ${auth ?? ANON}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep raw */ }
  return { status: res.status, json, text };
}

Deno.test("returns 401 with JSON body when caller is not authenticated (anon key)", async () => {
  const { status, json } = await call({ action: "list" });
  assertEquals(status, 401);
  assert(json?.error, "response should include an 'error' field");
});

Deno.test("returns JSON error when action is missing", async () => {
  // Even without auth we should get a structured JSON error (not an HTML 500).
  const { json } = await call({});
  assert(typeof json?.error === "string", "should return string error");
});

Deno.test("returns JSON error when create payload is invalid", async () => {
  const { json } = await call({ action: "create", email: "", name: "", password: "123" });
  assert(typeof json?.error === "string");
});

Deno.test("CORS preflight succeeds", async () => {
  const res = await fetch(FN_URL, { method: "OPTIONS" });
  await res.text();
  assertEquals(res.status, 200);
  assert(res.headers.get("access-control-allow-origin"));
});
