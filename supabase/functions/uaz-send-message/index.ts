import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const startTime = Date.now();
  let responseData: any = null;

  try {
    const { customer_id, content, client_msg_id } = await req.json();

    if (!customer_id || !content) {
      throw new Error("Missing customer_id or content");
    }

    // 1. Load settings (Database overrides Environment Variables)
    const { data: settings } = await supabaseAdmin
      .from("uaz_system_settings")
      .select("*")
      .eq("id", "global")
      .single();

    const backoffBase = Number(Deno.env.get("UAZ_BACKOFF_BASE")) || settings?.backoff_base_delay || 500;
    const maxRetries = Number(Deno.env.get("UAZ_MAX_RETRIES")) || settings?.backoff_max_retries || 3;
    const timeout = Number(Deno.env.get("UAZ_TIMEOUT")) || settings?.request_timeout_ms || 30000;

    // 2. Idempotency Check
    if (client_msg_id) {
      const { data: existing } = await supabaseAdmin
        .from("chat_messages")
        .select("*")
        .eq("client_msg_id", client_msg_id)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ success: true, duplicated: true, data: existing.metadata?.uaz_response }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 3. Get Phone & Connection
    const { data: customer } = await supabaseAdmin.from("customers").select("phone").eq("id", customer_id).single();
    const { data: conn } = await supabaseAdmin.from("whatsapp_connections").select("*").eq("provider", "uaz").single();

    if (!customer?.phone || !conn?.metadata?.token) {
      throw new Error("Configuração incompleta");
    }

    const uazUrl = conn.metadata.url || "https://api.uazapi.dev";
    const uazToken = conn.metadata.token;
    const phone = customer.phone.includes("@") ? customer.phone : `${customer.phone}@s.whatsapp.net`;

    // 4. Send with Backoff
    let attempt = 0;
    let success = false;
    let lastErr: any = null;

    while (attempt < maxRetries && !success) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const res = await fetch(`${uazUrl}/message/text`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json", 
            "Authorization": `Bearer ${uazToken}`,
            "apikey": uazToken
          },
          body: JSON.stringify({ number: phone, text: content }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        responseData = await res.json();
        
        if (res.ok) success = true;
        else if (res.status === 429 || res.status >= 500) throw new Error(`Retryable ${res.status}`);
        else {
           attempt = maxRetries;
           throw new Error(`Permanent ${res.status}`);
        }
      } catch (err) {
        attempt++;
        lastErr = err;
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * backoffBase;
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    if (!success) throw lastErr;

    // 5. Persist & Audit
    await supabaseAdmin.from("chat_messages").insert({
      customer_id, sender_type: "agent", content, client_msg_id,
      uaz_msg_id: responseData?.data?.key?.id || responseData?.id,
      metadata: { uaz_response: responseData }
    });

    await supabaseAdmin.from("uaz_audit_logs").insert({
      event_type: 'send_message', status: 'success',
      message: `Enviado para ${phone} (Attempt ${attempt + 1})`,
      payload: { customer_id, phone, content, client_msg_id },
      response: responseData, latency_ms: Date.now() - startTime
    });

    return new Response(JSON.stringify({ success: true, data: responseData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    await supabaseAdmin.from("uaz_audit_logs").insert({
      event_type: 'send_message', status: 'error',
      message: `Erro: ${err.message}`, response: { error: err.message },
      latency_ms: Date.now() - startTime
    });
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
