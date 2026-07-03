// Integration tests for create-sub-company-user edge function.
// Validates the structured error contract used by the sub-company creation UI.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ??
  Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY")!;
const FN_URL = `${SUPABASE_URL}/functions/v1/create-sub-company-user`;

async function call(body: unknown, auth?: string, method: string = "POST") {
  const res = await fetch(FN_URL, {
    method,
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON,
      "Authorization": `Bearer ${auth ?? ANON}`,
    },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep raw */ }
  return { status: res.status, json, text };
}

Deno.test("CORS preflight succeeds", async () => {
  const res = await fetch(FN_URL, { method: "OPTIONS" });
  await res.text();
  assertEquals(res.status, 200);
  assert(res.headers.get("access-control-allow-origin"));
});

Deno.test("rejects non-POST methods with 405 method_not_allowed", async () => {
  const { status, json } = await call({}, undefined, "GET");
  assertEquals(status, 405);
  assertEquals(json?.code, "method_not_allowed");
});

Deno.test("rejects invalid JSON body with 400 invalid_json", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON,
      "Authorization": `Bearer ${ANON}`,
    },
    body: "not-json",
  });
  const json = await res.json();
  assertEquals(res.status, 400);
  assertEquals(json?.code, "invalid_json");
});

Deno.test("rejects missing required fields with 400 missing_fields", async () => {
  const { status, json } = await call({});
  assertEquals(status, 400);
  assertEquals(json?.code, "missing_fields");
});

Deno.test("rejects invalid email format with 400 invalid_email", async () => {
  const { status, json } = await call({
    sub_company_id: "00000000-0000-0000-0000-000000000000",
    email: "not-an-email",
    name: "Alguém",
    password: "abcdef",
  });
  assertEquals(status, 400);
  assertEquals(json?.code, "invalid_email");
});

Deno.test("rejects weak password with 400 weak_password", async () => {
  const { status, json } = await call({
    sub_company_id: "00000000-0000-0000-0000-000000000000",
    email: "valid@test.com",
    name: "Alguém",
    password: "12",
  });
  assertEquals(status, 400);
  assertEquals(json?.code, "weak_password");
});

Deno.test("rejects anon caller with 401 unauthenticated", async () => {
  const { status, json } = await call({
    sub_company_id: "00000000-0000-0000-0000-000000000000",
    email: "valid@test.com",
    name: "Alguém",
    password: "abcdef",
  });
  assertEquals(status, 401);
  assertEquals(json?.code, "unauthenticated");
});
