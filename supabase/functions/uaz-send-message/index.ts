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
  let status = "success";
  let message = "Mensagem enviada com sucesso";
  let responseData: any = null;

  try {
    const { customer_id, content, metadata } = await req.json();

    if (!customer_id || !content) {
      throw new Error("Missing customer_id or content");
    }

    // 1. Obter o telefone do cliente
    const { data: customer, error: custError } = await supabaseAdmin
      .from("customers")
      .select("phone")
      .eq("id", customer_id)
      .single();

    if (custError || !customer?.phone) {
      throw new Error("Customer phone not found");
    }

    // 2. Obter credenciais da UAZ
    const { data: conn, error: connError } = await supabaseAdmin
      .from("whatsapp_connections")
      .select("*")
      .eq("provider", "uaz")
      .single();

    if (connError || !conn?.metadata?.token) {
      throw new Error("UAZ connection not configured");
    }

    const uazUrl = conn.metadata.url || "https://api.uazapi.dev";
    const uazToken = conn.metadata.token;
    const phone = customer.phone.includes("@") ? customer.phone : `${customer.phone}@s.whatsapp.net`;

    // 3. Enviar mensagem via UAZ com Retentativas Automáticas
    const maxRetries = 3;
    let attempt = 0;
    let success = false;
    let lastErr: any = null;

    while (attempt < maxRetries && !success) {
      try {
        const res = await fetch(`${uazUrl}/message/text`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${uazToken}`
          },
          body: JSON.stringify({
            number: phone,
            text: content
          })
        });

        responseData = await res.json();
        if (res.ok) {
          success = true;
        } else {
          throw new Error(responseData?.message || `UAZ Error ${res.status}`);
        }
      } catch (err) {
        attempt++;
        lastErr = err;
        if (attempt < maxRetries) {
          // Backoff progressivo: 1s, 2s, 4s
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
        }
      }
    }

    if (!success) {
      throw lastErr || new Error("Failed after retries");
    }

    // 4. Registrar na auditoria
    await supabaseAdmin.from("uaz_audit_logs").insert({
      event_type: 'send_message',
      status: 'success',
      message: `Mensagem enviada para ${phone} na tentativa ${attempt + 1}`,
      payload: { customer_id, phone, content },
      response: responseData,
      latency_ms: Date.now() - startTime
    });

    return new Response(JSON.stringify({ success: true, data: responseData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("UAZ Send Error:", err.message);
    
    // Registrar falha na auditoria
    await supabaseAdmin.from("uaz_audit_logs").insert({
      event_type: 'send_message',
      status: 'error',
      message: `Erro ao enviar mensagem: ${err.message}`,
      response: { error: err.message },
      latency_ms: Date.now() - startTime
    });

    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
