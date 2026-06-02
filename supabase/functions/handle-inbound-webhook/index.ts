import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-signature, x-webhook-id",
};

async function verifyHmac(payload: string, signatureHeader: string, secret: string) {
  try {
    const parts = signatureHeader.split(',');
    const t = parts.find(p => p.startsWith('t='))?.split('=')[1];
    const v1 = parts.find(p => p.startsWith('v1='))?.split('=')[1];

    if (!t || !v1) return { valid: false, reason: "Formato de assinatura inválido (esperado t=...,v1=...)" };

    const now = Math.floor(Date.now() / 1000);
    const timestamp = parseInt(t);
    
    // Check if timestamp is within 10 minutes tolerance
    if (isNaN(timestamp) || Math.abs(now - timestamp) > 600) {
      return { valid: false, reason: "Timestamp expirado ou fora da janela de tolerância (10 min)" };
    }

    const message = `${t}.${payload}`;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = new Uint8Array(
      v1.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );

    const isValid = await crypto.subtle.verify(
      "HMAC",
      cryptoKey,
      sigBytes,
      encoder.encode(message)
    );

    return { valid: isValid, reason: isValid ? null : "Hash da assinatura (v1) não confere com o payload" };
  } catch (err) {
    return { valid: false, reason: `Erro ao processar assinatura: ${err.message}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const webhookId = req.headers.get("X-Webhook-ID") || req.headers.get("x-webhook-id");
  const signature = req.headers.get("X-Webhook-Signature") || req.headers.get("x-webhook-signature");
  
  const startTime = Date.now();
  let responseStatus = 200;
  let responseBody = "Success";
  let payload: any = null;

  try {
    if (!webhookId) {
      throw new Error("Missing X-Webhook-ID header");
    }

    // Get webhook config
    const { data: webhook, error: whError } = await supabaseAdmin
      .from("webhooks")
      .select("*")
      .eq("id", webhookId)
      .eq("type", "inbound")
      .single();

    if (whError || !webhook) {
      responseStatus = 404;
      throw new Error("Webhook not found or invalid");
    }

    if (!webhook.is_active) {
      responseStatus = 403;
      throw new Error("Webhook is inactive");
    }

    // Parse payload
    const bodyText = await req.text();
    try {
      payload = JSON.parse(bodyText);
    } catch (e) {
      responseStatus = 400;
      throw new Error("Invalid JSON payload");
    }

    // Verify signature if secret is set
    if (webhook.secret) {
      if (!signature) {
        responseStatus = 401;
        throw new Error("Missing X-Webhook-Signature header for secured webhook");
      }

      const { valid, reason } = await verifyHmac(bodyText, signature, webhook.secret);
      if (!valid) {
        responseStatus = 401;
        throw new Error(reason || "Signature verification failed");
      }
    }

    // Process payload (example: create lead)
    // Here you would add your business logic
    console.log(`Processing inbound webhook ${webhookId}:`, payload);
    
    responseBody = JSON.stringify({
      success: true,
      message: "Webhook received and processed",
      webhook_id: webhookId
    });

  } catch (err) {
    console.error("Inbound webhook error:", err.message);
    responseStatus = responseStatus === 200 ? 500 : responseStatus;
    responseBody = JSON.stringify({
      success: false,
      error: err.message
    });
  } finally {
    const latency = Date.now() - startTime;
    
    // Log the event
    if (webhookId) {
      await supabaseAdmin.from("webhook_logs").insert({
        webhook_id: webhookId,
        event_type: payload?.event || "inbound.webhook",
        url: req.url,
        method: req.method,
        headers: Object.fromEntries(req.headers.entries()),
        payload: payload,
        response_status: responseStatus,
        response_body: responseBody,
        latency_ms: latency,
        direction: 'inbound'
      });
    }

    return new Response(responseBody, {
      status: responseStatus,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
