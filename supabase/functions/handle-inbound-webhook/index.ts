import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-signature, x-webhook-id",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const webhookId = req.headers.get("X-Webhook-ID") || req.headers.get("x-webhook-id");
  
  const startTime = Date.now();
  let responseStatus = 200;
  let responseBody = "Success";
  let payload: any = null;

  try {
    const bodyText = await req.text();
    payload = JSON.parse(bodyText);

    const eventType = payload.event || "unknown";
    const remoteJid = payload.data?.key?.remoteJid || payload.data?.from;
    const messageText = payload.data?.message?.conversation || payload.data?.text || payload.data?.body;
    const uazMsgId = payload.data?.key?.id || payload.data?.id;
    
    if ((eventType === "messages.upsert" || eventType === "message") && uazMsgId) {
      // 1. Verificar idempotência: se a mensagem já existe
      const { data: existing } = await supabaseAdmin
        .from("chat_messages")
        .select("id")
        .eq("uaz_msg_id", uazMsgId)
        .maybeSingle();

      if (existing) {
        console.log(`Mensagem duplicada ignorada: ${uazMsgId}`);
        return new Response(JSON.stringify({ success: true, duplicated: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (remoteJid && messageText) {
        const phone = remoteJid.replace("@s.whatsapp.net", "").replace("@g.us", "");
        
        let { data: customer } = await supabaseAdmin
          .from("customers")
          .select("id")
          .eq("phone", phone)
          .maybeSingle();

        if (!customer) {
          const { data: newCustomer, error: custError } = await supabaseAdmin
            .from("customers")
            .insert({
              name: `WhatsApp ${phone}`,
              phone: phone,
              created_by: "00000000-0000-0000-0000-000000000000"
            })
            .select()
            .single();
          
          if (custError) throw custError;
          customer = newCustomer;
        }

        if (customer) {
          const { error: msgError } = await supabaseAdmin
            .from("chat_messages")
            .insert({
              customer_id: customer.id,
              sender_type: "client",
              content: messageText,
              uaz_msg_id: uazMsgId,
              metadata: { raw: payload.data }
            });
            
          if (msgError) throw msgError;
        }
      }
    }

    responseBody = JSON.stringify({ success: true });

    await supabaseAdmin.from("uaz_audit_logs").insert({
      event_type: 'webhook',
      status: 'success',
      message: `Evento [${eventType}] processado com sucesso para [${remoteJid}]`,
      payload,
      latency_ms: Date.now() - startTime
    });

  } catch (err) {
    console.error("UAZ Webhook error:", err.message);
    responseStatus = 500;
    responseBody = JSON.stringify({ error: err.message });

    await supabaseAdmin.from("uaz_audit_logs").insert({
      event_type: 'webhook',
      status: 'error',
      message: `Falha no processamento: ${err.message}`,
      payload,
      response: { error: err.message },
      latency_ms: Date.now() - startTime
    });
  } finally {
    if (webhookId) {
       await supabaseAdmin.from("webhook_logs").insert({
        webhook_id: webhookId,
        event_type: payload?.event || "uaz.webhook",
        payload: payload,
        response_status: responseStatus,
        direction: 'inbound'
      });
    }

    return new Response(responseBody, {
      status: responseStatus,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
