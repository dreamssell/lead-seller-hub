import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-signature, x-webhook-id",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const webhookId = req.headers.get("X-Webhook-ID") || req.headers.get("x-webhook-id");
  
  let responseStatus = 200;
  let responseBody = "Success";
  let payload: any = null;

  try {
    const bodyText = await req.text();
    payload = JSON.parse(bodyText);

    // Identificar se é um evento da UAZ
    // A UAZ costuma enviar o evento no campo 'event' ou similar
    const eventType = payload.event || "unknown";
    const remoteJid = payload.data?.key?.remoteJid || payload.data?.from; // Depende do payload da UAZ
    const messageText = payload.data?.message?.conversation || payload.data?.text || payload.data?.body;
    
    console.log(`Recebido evento UAZ [${eventType}] de [${remoteJid}]`);

    if (eventType === "messages.upsert" || eventType === "message") {
      if (remoteJid && messageText) {
        const phone = remoteJid.replace("@s.whatsapp.net", "").replace("@g.us", "");
        
        // 1. Encontrar ou criar o cliente pelo telefone
        let { data: customer } = await supabaseAdmin
          .from("customers")
          .select("id")
          .eq("phone", phone)
          .maybeSingle();

        if (!customer) {
          // Criar um cliente genérico se não existir
          // Precisamos de um created_by válido se houver RLS estrito. 
          // Como é service_role, podemos tentar pegar o admin ou deixar nulo se a coluna permitir.
          const { data: newCustomer, error: custError } = await supabaseAdmin
            .from("customers")
            .insert({
              name: `WhatsApp ${phone}`,
              phone: phone,
              created_by: "00000000-0000-0000-0000-000000000000" // Placeholder ou ID de admin real
            })
            .select()
            .single();
          
          if (custError) console.error("Erro ao criar cliente:", custError);
          customer = newCustomer;
        }

        if (customer) {
          // 2. Registrar a mensagem
          const { error: msgError } = await supabaseAdmin
            .from("chat_messages")
            .insert({
              customer_id: customer.id,
              sender_type: "client",
              content: messageText,
              metadata: { 
                uaz_id: payload.data?.key?.id,
                raw: payload.data
              }
            });
            
          if (msgError) console.error("Erro ao registrar mensagem:", msgError);
        }
      }
    }

    responseBody = JSON.stringify({ success: true });

  } catch (err) {
    console.error("UAZ Webhook error:", err.message);
    responseStatus = 500;
    responseBody = JSON.stringify({ error: err.message });
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
