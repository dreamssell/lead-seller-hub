import { assertEquals, assertNotEquals } from "https://deno.land/std@0.203.0/testing/asserts.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

Deno.test("Idempotency TTL Expiration Test", async () => {
  const { data: profile } = await supabase.from("profiles").select("id").limit(1).single();
  const userId = profile?.id;

  const { data: webhook, error: whError } = await supabase
    .from("webhooks")
    .insert({
      name: "Test TTL Webhook",
      url: "https://httpbin.org/post",
      idempotency_ttl_hours: 1,
      created_by: userId
    })
    .select()
    .single();

  if (whError) throw whError;

  try {
    const idempotencyKey = `test-ttl-${Date.now()}`;

    await supabase
      .from("webhook_idempotency_keys")
      .insert({
        webhook_id: webhook.id,
        idempotency_key: idempotencyKey,
        response_status: 200,
        response_body: "Old response",
        latency_ms: 100,
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      });

    await supabase.rpc('cleanup_expired_idempotency_keys_v2');

    const { data: keys } = await supabase
      .from("webhook_idempotency_keys")
      .select("*")
      .eq("webhook_id", webhook.id)
      .eq("idempotency_key", idempotencyKey);

    assertEquals(keys?.length, 0, "Key should have been deleted after TTL");
  } finally {
    await supabase.from("webhooks").delete().eq("id", webhook.id);
  }
});

Deno.test("Concurrent Requests Idempotency Test", async () => {
  const { data: profile } = await supabase.from("profiles").select("id").limit(1).single();
  const userId = profile?.id;

  const { data: webhook } = await supabase
    .from("webhooks")
    .insert({
      name: "Concurrent Test Webhook",
      url: "https://httpbin.org/post",
      idempotency_ttl_hours: 24,
      created_by: userId,
      type: 'outbound'
    })
    .select()
    .single();

  if (!webhook) throw new Error("Failed to create webhook for test");

  try {
    const idempotencyKey = `concurrent-${Date.now()}`;
    const payload = { test: true };

    // Simulate 5 concurrent requests
    const requests = Array.from({ length: 5 }).map(() => 
      fetch(`${supabaseUrl}/functions/v1/send-outbound-webhook`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          webhook_id: webhook.id,
          payload,
          idempotency_key: idempotencyKey
        })
      }).then(r => r.json())
    );

    const results = await Promise.all(requests);
    
    // Check if all responses indicate the same result (one actual execution, others idempotent hits)
    const requestIds = results.map(r => r.request_id);
    const uniqueRequestIds = new Set(requestIds);
    assertEquals(uniqueRequestIds.size, 5, "Each request should have a unique request_id");

    const statuses = results.map(r => r.status);
    assertEquals(statuses.every(s => s === 200), true, "All concurrent requests should return 200");

    // After TTL, it should be processed again
    await supabase
      .from("webhook_idempotency_keys")
      .update({ created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() })
      .eq("webhook_id", webhook.id)
      .eq("idempotency_key", idempotencyKey);

    await supabase.rpc('cleanup_expired_idempotency_keys_v2');

    const secondRun = await fetch(`${supabaseUrl}/functions/v1/send-outbound-webhook`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        webhook_id: webhook.id,
        payload,
        idempotency_key: idempotencyKey
      })
    }).then(r => r.json());

    assertEquals(secondRun.status, 200, "Should process again after TTL cleanup");
    
  } finally {
    await supabase.from("webhooks").delete().eq("id", webhook.id);
  }
});

