import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function signHmac(payload: string, secret: string) {
  const encoder = new TextEncoder();
  const t = Math.floor(Date.now() / 1000).toString();
  const message = `${t}.${payload}`;
  
  const keyData = encoder.encode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(message)
  );

  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `t=${t},v1=${hashHex}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { webhook_id, payload, is_test = false } = await req.json();

    if (!webhook_id) throw new Error("Missing webhook_id");

    const { data: webhook, error: whError } = await supabaseAdmin
      .from("webhooks")
      .select("*")
      .eq("id", webhook_id)
      .single();

    if (whError || !webhook) throw new Error("Webhook not found");

    const bodyText = JSON.stringify(payload);
    const signature = webhook.secret ? await signHmac(bodyText, webhook.secret) : null;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Webhook-ID": webhook.id,
      "X-Webhook-Version": `v${webhook.secret_version || 1}`,
    };

    if (signature) {
      headers["X-Webhook-Signature"] = signature;
    }

    const startTime = Date.now();
    let responseStatus: number;
    let responseBody: string;
    let error_message: string | null = null;

    try {
      const resp = await fetch(webhook.url, {
        method: "POST",
        headers,
        body: bodyText,
      });

      responseStatus = resp.status;
      responseBody = await resp.text();
    } catch (err) {
      responseStatus = 0;
      responseBody = "Network Error";
      error_message = err.message;
    }

    const latency = Date.now() - startTime;
    const isSuccess = responseStatus >= 200 && responseStatus < 300;

    // Log the attempt
    if (!is_test) {
      await supabaseAdmin.from("webhook_logs").insert({
        webhook_id: webhook.id,
        event_type: payload.event || "outbound.event",
        url: webhook.url,
        method: "POST",
        headers: headers,
        payload: payload,
        response_status: responseStatus,
        response_body: responseBody.substring(0, 1000),
        latency_ms: latency,
        direction: 'outbound',
        status: isSuccess ? 'completed' : (webhook.max_retries > 0 ? 'pending_retry' : 'failed'),
        error_message: error_message,
        retry_count: 0
      });
    }

    return new Response(JSON.stringify({
      success: isSuccess,
      status: responseStatus,
      body: responseBody,
      latency,
      signature_preview: signature
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});