// Integration tests for waha-audit edge function.
// Validate strict owner-scope: only the platform owner (admin) can query, and only
// for owner_ids that match a real tenant. Also exercises cursor + order params.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ??
  Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY")!;
const FN_URL = `${SUPABASE_URL}/functions/v1/waha-audit`;

// Optional creds — when provided, we can exercise the happy path.
const OWNER_JWT = Deno.env.get("WAHA_AUDIT_OWNER_JWT") ?? null;
const OWNER_ID = Deno.env.get("WAHA_AUDIT_OWNER_ID") ?? null;
const OTHER_OWNER_ID = Deno.env.get("WAHA_AUDIT_OTHER_OWNER_ID") ??
  "00000000-0000-0000-0000-000000000000";

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
  try { json = JSON.parse(text); } catch { /* keep raw */ }
  return { status: res.status, json, text };
}

Deno.test("CORS preflight succeeds", async () => {
  const res = await fetch(FN_URL, { method: "OPTIONS" });
  await res.text();
  assertEquals(res.status, 200);
  assert(res.headers.get("access-control-allow-origin"));
});

Deno.test("rejects non-POST", async () => {
  const res = await fetch(FN_URL, {
    method: "GET",
    headers: { "apikey": ANON, "Authorization": `Bearer ${ANON}` },
  });
  await res.text();
  assertEquals(res.status, 405);
});

Deno.test("returns 401 when Authorization header is missing", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": ANON },
    body: JSON.stringify({ owner_id: OTHER_OWNER_ID }),
  });
  const json = await res.json().catch(() => null);
  assertEquals(res.status, 401);
  assert(json?.error, "should include structured error");
});

Deno.test("returns 401 with only the anon key (no user claims)", async () => {
  const { status, json } = await call({ owner_id: OTHER_OWNER_ID });
  assertEquals(status, 401);
  assertEquals(json?.error, "unauthorized");
});

Deno.test("cursor/order params are accepted (schema-safe) even on unauth path", async () => {
  // Auth is checked before body parsing succeeds against DB, so we still expect
  // 401 — but the request must not crash the function (no 500).
  const { status } = await call({
    owner_id: OTHER_OWNER_ID,
    cursor: new Date().toISOString(),
    order: "asc",
    limit: 25,
  });
  assert(status === 401 || status === 403, `unexpected status ${status}`);
});

// ---------------- Authenticated paths (opt-in) ----------------
// These tests run only when a real owner JWT is provided via env.
// They confirm:
//   - Non-admin JWT → 403 forbidden
//   - Admin JWT + missing owner_id → 400
//   - Admin JWT + foreign owner_id → 404 owner_not_found (never leaks data)
//   - Admin JWT + own owner_id → 200 with pagination echo (limit/order/next_cursor)

const authGate = { ignore: !OWNER_JWT || !OWNER_ID };

Deno.test({
  name: "admin without owner_id → 400 missing_owner_id",
  ...authGate,
  fn: async () => {
    const { status, json } = await call({}, OWNER_JWT);
    assertEquals(status, 400);
    assertEquals(json?.error, "missing_owner_id");
  },
});

Deno.test({
  name: "admin with foreign owner_id → 404 owner_not_found (no data leak)",
  ...authGate,
  fn: async () => {
    const { status, json } = await call(
      { owner_id: "00000000-0000-0000-0000-000000000000" },
      OWNER_JWT,
    );
    assertEquals(status, 404);
    assertEquals(json?.error, "owner_not_found");
    assert(!json?.messages && !json?.events, "must not leak arrays");
  },
});

Deno.test({
  name: "admin with own owner_id → 200 and scope-correct payload",
  ...authGate,
  fn: async () => {
    const { status, json } = await call(
      { owner_id: OWNER_ID, limit: 10, order: "desc" },
      OWNER_JWT,
    );
    assertEquals(status, 200);
    assertEquals(json?.owner_id, OWNER_ID);
    assertEquals(json?.pagination?.order, "desc");
    assertEquals(json?.pagination?.limit, 10);
    for (const c of json?.connections ?? []) {
      assertEquals(c.owner_id, OWNER_ID, "connection outside owner scope");
    }
    for (const m of json?.messages ?? []) {
      assertEquals(m.customers?.owner_id, OWNER_ID, "message outside owner scope");
    }
    for (const call of json?.calls ?? []) {
      assertEquals(call.owner_id, OWNER_ID, "call outside owner scope");
    }
  },
});

Deno.test({
  name: "admin cursor pagination returns strictly older rows (desc)",
  ...authGate,
  fn: async () => {
    const first = await call(
      { owner_id: OWNER_ID, limit: 5, order: "desc" },
      OWNER_JWT,
    );
    assertEquals(first.status, 200);
    const cursor = first.json?.pagination?.next_cursor;
    if (!cursor) return; // not enough data — skip silently
    const second = await call(
      { owner_id: OWNER_ID, limit: 5, order: "desc", cursor },
      OWNER_JWT,
    );
    assertEquals(second.status, 200);
    for (const ev of second.json?.events ?? []) {
      assert(ev.created_at < cursor, `event ${ev.id} not older than cursor`);
    }
  },
});

Deno.test({
  name: "admin ascending order returns rows in chronological order",
  ...authGate,
  fn: async () => {
    const { status, json } = await call(
      { owner_id: OWNER_ID, limit: 10, order: "asc" },
      OWNER_JWT,
    );
    assertEquals(status, 200);
    const events = json?.events ?? [];
    for (let i = 1; i < events.length; i++) {
      assert(
        events[i - 1].created_at <= events[i].created_at,
        "events not ascending by created_at",
      );
    }
  },
});
