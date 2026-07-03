// Integration tests for manage-account-user edge function.
// These call the deployed function via HTTP and validate that failure paths
// return machine-readable JSON errors (used by the TeamPage toast layer).
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ??
  Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY")!;
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
  try {
    json = JSON.parse(text);
  } catch { /* keep raw */ }
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
  const { json } = await call({
    action: "create",
    email: "",
    name: "",
    password: "123",
  });
  assert(typeof json?.error === "string");
});

Deno.test("CORS preflight succeeds", async () => {
  const res = await fetch(FN_URL, { method: "OPTIONS" });
  await res.text();
  assertEquals(res.status, 200);
  assert(res.headers.get("access-control-allow-origin"));
});

// ─── Email change is restricted to the platform owner (app_role='admin') ────
// The unauth path is the strongest guarantee we can assert without seeded
// credentials: any request that carries an email in `update` MUST be rejected
// before it ever reaches the auth admin API when the caller has no session.
Deno.test(
  "update with email field is rejected 401 when caller is not authenticated",
  async () => {
    const { status, json } = await call({
      action: "update",
      user_id: "00000000-0000-0000-0000-000000000000",
      email: "novo@test.com",
      name: "Alguém",
    });
    assertEquals(status, 401);
    assertEquals(json?.code, "unauthenticated");
  },
);

// Opt-in E2E: set TEAM_NON_OWNER_JWT to a valid signed-in JWT for a
// non-platform-owner account admin and TEAM_TARGET_USER_ID to a user in
// their scope. The function must respond 403 with code=email_change_forbidden.
const NON_OWNER_JWT = Deno.env.get("TEAM_NON_OWNER_JWT");
const TARGET_USER_ID = Deno.env.get("TEAM_TARGET_USER_ID");
Deno.test({
  name:
    "update with email field is rejected 403 email_change_forbidden for non-owner admin",
  ignore: !NON_OWNER_JWT || !TARGET_USER_ID,
  fn: async () => {
    const { status, json } = await call(
      {
        action: "update",
        user_id: TARGET_USER_ID,
        email: `changed+${Date.now()}@test.com`,
        name: "Nome Existente",
      },
      NON_OWNER_JWT,
    );
    assertEquals(status, 403);
    assertEquals(json?.code, "email_change_forbidden");
    assert(
      /dono da plataforma/i.test(String(json?.error || "")),
      "should return PT-BR platform-owner message",
    );
  },
});
