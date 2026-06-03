import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

Deno.test("uaz-healthcheck returns metrics", async () => {
  const res = await fetch(`${supabaseUrl}/functions/v1/uaz-healthcheck`, {
    headers: { "Authorization": `Bearer ${supabaseKey}` }
  });
  
  const data = await res.json();
  assertEquals(res.status, 200);
  assertEquals(typeof data.status, "string");
  assertEquals(typeof data.latency_ms, "number");
});

Deno.test("uaz-healthcheck simulation: failures", async () => {
  // Insert a few manual error logs to simulate failure rate
  await supabase.from("uaz_audit_logs").insert([
    { event_type: 'webhook', status: 'error', message: 'Test failure 1', latency_ms: 1500 },
    { event_type: 'webhook', status: 'error', message: 'Test failure 2', latency_ms: 2000 }
  ]);

  const res = await fetch(`${supabaseUrl}/functions/v1/uaz-healthcheck`, {
    headers: { "Authorization": `Bearer ${supabaseKey}` }
  });
  
  const data = await res.json();
  // Failure rate should be > 0 now
  assertEquals(data.failure_rate > 0, true);
});
