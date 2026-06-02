import { assertEquals } from "https://deno.land/std@0.203.0/testing/asserts.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

Deno.test("Idempotency TTL Expiration Test", async () => {
  // 1. Get a valid user profile ID
  const { data: profile } = await supabase.from("profiles").select("id").limit(1).single();
  const userId = profile?.id;

  // 2. Create a temporary webhook for testing
  const { data: webhook, error: whError } = await supabase
    .from("webhooks")
    .insert({
      name: "Test TTL Webhook",
      url: "https://httpbin.org/post",
      idempotency_ttl_hours: 1, // 1 hour TTL
      created_by: userId
    })
    .select()
    .single();

  if (whError) throw whError;

  try {
    const idempotencyKey = `test-ttl-${Date.now()}`;

    // 2. Insert a "fake" old idempotency key (manually backdated)
    const { error: insertError } = await supabase
      .from("webhook_idempotency_keys")
      .insert({
        webhook_id: webhook.id,
        idempotency_key: idempotencyKey,
        response_status: 200,
        response_body: "Old response",
        latency_ms: 100,
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
      });

    if (insertError) throw insertError;

    // 3. Run cleanup
    const { data: deletedCount, error: rpcError } = await supabase.rpc('cleanup_expired_idempotency_keys_v2');
    if (rpcError) throw rpcError;

    // 4. Verify it was deleted
    const { data: keys } = await supabase
      .from("webhook_idempotency_keys")
      .select("*")
      .eq("webhook_id", webhook.id)
      .eq("idempotency_key", idempotencyKey);

    assertEquals(keys?.length, 0, "Key should have been deleted after TTL");

  } finally {
    // Cleanup test data
    await supabase.from("webhooks").delete().eq("id", webhook.id);
  }
});
