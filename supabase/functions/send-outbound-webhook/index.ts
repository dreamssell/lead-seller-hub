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

async function sendSlackAlert(url: string, message: string) {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
  } catch (err) {
    console.error("Erro ao enviar alerta Slack:", err.message);
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

  try {
    const { webhook_id, payload, is_test = false, idempotency_key = null, request_id = crypto.randomUUID() } = await req.json();

    if (!webhook_id) throw new Error("Missing webhook_id");

    const { data: webhook, error: whError } = await supabaseAdmin
      .from("webhooks")
      .select("*")
      .eq("id", webhook_id)
      .single();

    if (whError || !webhook) throw new Error("Webhook not found");

    const bodyText = JSON.stringify(payload);
    const signature = webhook.secret ? await signHmac(bodyText, webhook.secret) : null;
    let finalIdempotencyKey = idempotency_key;
    const missingBehavior = webhook.idempotency_missing_behavior || 'generate';
    
    if (!finalIdempotencyKey) {
      if (missingBehavior === 'generate') {
        finalIdempotencyKey = crypto.randomUUID();
      } else if (missingBehavior === 'fail') {
        throw new Error("Missing idempotency_key and behavior is set to fail");
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Webhook-ID": webhook.id,
      "X-Webhook-Version": `v${webhook.secret_version || 1}`,
    };

    if (finalIdempotencyKey) {
      const headerName = webhook.idempotency_header || 'X-Idempotency-Key';
      headers[headerName] = finalIdempotencyKey;
      // Also send the standard one for compatibility unless explicitly changed
      if (headerName !== 'Idempotency-Key') {
        headers['Idempotency-Key'] = finalIdempotencyKey;
      }
    }

    if (signature) {
      headers["X-Webhook-Signature"] = signature;
    }

    const startTime = Date.now();
    let responseStatus: number;
    let responseBody: string;
    let error_message: string | null = null;

    const timeoutSeconds = webhook.timeout_seconds || 30;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

    try {
      const resp = await fetch(webhook.url, {
        method: "POST",
        headers,
        body: bodyText,
        signal: controller.signal
      });

      responseStatus = resp.status;
      responseBody = await resp.text();
    } catch (err) {
      if (err.name === 'AbortError') {
        responseStatus = 408; // Request Timeout
        responseBody = "Request Timeout";
        error_message = `A requisição excedeu o tempo limite de ${timeoutSeconds}s`;
      } else {
        responseStatus = 0;
        responseBody = "Network Error";
        error_message = err.message;
      }
    } finally {
      clearTimeout(timeoutId);
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
        retry_count: 0,
        timeout_limit: timeoutSeconds
      });

      // Check for consecutive failures/timeouts
      if (!isSuccess && (responseStatus === 408 || responseStatus === 0)) {
        const { count } = await supabaseAdmin
          .from("webhook_logs")
          .select("*", { count: "exact", head: true })
          .eq("webhook_id", webhook.id)
          .in("response_status", [0, 408])
          .order("created_at", { ascending: false })
          .limit(webhook.alert_threshold || 3);
        
        if (count && count >= (webhook.alert_threshold || 3)) {
          if (webhook.alert_slack_url) {
            await sendSlackAlert(
              webhook.alert_slack_url, 
              `🚨 *Alerta de Webhook:* O webhook "${webhook.name}" falhou consecutivamente por timeout (${count} vezes).`
            );
          }
        }
      }
    }

    return new Response(JSON.stringify({
      success: isSuccess,
      status: responseStatus,
      body: responseBody,
      latency,
      signature_preview: signature,
      error: error_message,
      idempotency_key: finalIdempotencyKey
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