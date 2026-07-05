import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY =
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY")!;

const endpoint = `${SUPABASE_URL}/functions/v1/whatsapp-status`;

async function callStatus(body: Record<string, unknown>) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: res.status, json };
}

// The edge function is designed to always answer 200 with a normalized JSON
// payload — even when the upstream provider is unreachable. These integration
// tests exercise the contract from the outside so that adding WAHA does not
// regress the shape returned for UAZ / Evolution / Wavoip.

Deno.test("whatsapp-status: waha provider is accepted and returns a normalized payload", async () => {
  const { status, json } = await callStatus({
    provider: "waha",
    url: "https://waha.invalid.example",
    token: "fake",
    instance: "default",
  });
  assertEquals(status, 200);
  assertEquals(typeof json.connected, "boolean");
  assertEquals(json.connected, false);
  // Either unconfigured / error / disconnected — never a crash.
  assert(typeof json.status === "string" && json.status.length > 0, "status must be a string");
});

Deno.test("whatsapp-status: waha without URL reports 'unconfigured' — no cross-provider leak", async () => {
  const { status, json } = await callStatus({ provider: "waha", token: "fake" });
  assertEquals(status, 200);
  assertEquals(json.connected, false);
  assertEquals(json.status, "unconfigured");
});

Deno.test("whatsapp-status: unknown provider is still rejected after adding waha", async () => {
  const { status, json } = await callStatus({ provider: "definitely-not-a-provider" });
  assertEquals(status, 200);
  assertEquals(json.connected, false);
  assert(String(json.error || "").toLowerCase().includes("provedor"));
});

Deno.test("whatsapp-status: uaz contract still returns normalized fields", async () => {
  const { status, json } = await callStatus({
    provider: "uaz",
    url: "https://uaz.invalid.example",
    token: "fake",
  });
  assertEquals(status, 200);
  assertEquals(typeof json.connected, "boolean");
  assertEquals(json.connected, false);
});

Deno.test("whatsapp-status: evolution contract untouched by waha addition", async () => {
  const { status, json } = await callStatus({
    provider: "evolution",
    url: "https://evo.invalid.example",
    token: "fake",
    instance: "inst-A",
  });
  assertEquals(status, 200);
  assertEquals(typeof json.connected, "boolean");
  assertEquals(json.connected, false);
});

Deno.test("whatsapp-status: wavoip contract untouched by waha addition", async () => {
  const { status, json } = await callStatus({
    provider: "wavoip",
    url: "https://api.wavoip.com/v1",
    token: "fake",
  });
  assertEquals(status, 200);
  assertEquals(typeof json.connected, "boolean");
});
