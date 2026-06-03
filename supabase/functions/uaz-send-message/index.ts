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

    // 1. Idempotência: verificar se a mensagem já foi enviada com este client_msg_id
    if (client_msg_id) {
      const { data: existing } = await supabaseAdmin
        .from("chat_messages")
        .select("*")
        .eq("client_msg_id", client_msg_id)
        .maybeSingle();

      if (existing) {
        console.log(`Mensagem já enviada (idempotência): ${client_msg_id}`);
        return new Response(JSON.stringify({ success: true, duplicated: true, data: existing.metadata?.uaz_response }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 2. Obter o telefone do cliente
    const { data: customer, error: custError } = await supabaseAdmin
      .from("customers")
      .select("phone")
      .eq("id", customer_id)
      .single();

    if (custError || !customer?.phone) {
      throw new Error("Customer phone not found");
    }

    // 3. Obter credenciais da UAZ
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

    // 4. Enviar mensagem via UAZ com Retentativas Automáticas (Backoff Progressivo)
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
          // Tratar erros transitórios (ex: 429, 5xx)
          if (res.status === 429 || res.status >= 500) {
            throw new Error(`Transient Error ${res.status}: ${JSON.stringify(responseData)}`);
          } else {
            // Erros permanentes (ex: 401, 400) não devem ser retentados
            attempt = maxRetries;
            throw new Error(`Permanent Error ${res.status}: ${JSON.stringify(responseData)}`);
          }
        }
      } catch (err) {
        attempt++;
        lastErr = err;
        if (attempt < maxRetries) {
          // Backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt) * 500;
          console.log(`Retrying in ${delay}ms (Attempt ${attempt})...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    if (!success) throw lastErr;

    // 5. Salvar mensagem no banco com client_msg_id para idempotência
    const { error: dbError } = await supabaseAdmin.from("chat_messages").insert({
      customer_id,
      sender_type: "agent",
      content,
      client_msg_id,
      uaz_msg_id: responseData?.data?.key?.id || responseData?.id,
      metadata: { uaz_response: responseData }
    });

    if (dbError) {
      console.error("Error saving message after UAZ success:", dbError);
    }

    await supabaseAdmin.from("uaz_audit_logs").insert({
      event_type: 'send_message',
      status: 'success',
      message: `Mensagem enviada para ${phone} na tentativa ${attempt + 1}`,
      payload: { customer_id, phone, content, client_msg_id },
      response: responseData,
      latency_ms: Date.now() - startTime
    });

    return new Response(JSON.stringify({ success: true, data: responseData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("UAZ Send Error:", err.message);
    
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
