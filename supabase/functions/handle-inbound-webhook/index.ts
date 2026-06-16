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

  const url = new URL(req.url);
  const qConnectionId = url.searchParams.get("connection_id");
  const qSubCompanyId = url.searchParams.get("sub_company_id");
  const qChannel = url.searchParams.get("channel") || "whatsapp";
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
    const msgId = payload.data?.key?.id || payload.data?.id;
    const senderName = payload.data?.pushName || payload.data?.notifyName;

    // ---------- Resolve scope (owner + sub_company + channel + connection) ----------
    let ownerId: string | null = null;
    let subCompanyId: string | null = qSubCompanyId;
    let connectionId: string | null = qConnectionId;
    let channel = qChannel;

    if (connectionId) {
      const { data: conn } = await supabaseAdmin
        .from("whatsapp_connections")
        .select("id, owner_id, sub_company_id, provider, role")
        .eq("id", connectionId)
        .maybeSingle();
      if (conn) {
        ownerId = ownerId || conn.owner_id;
        subCompanyId = subCompanyId || conn.sub_company_id;
        if (conn.provider) channel = channel || (conn.provider === "uaz" || conn.provider === "evolution" ? "whatsapp" : conn.provider);
      }
    }

    if (!ownerId && webhookId) {
      const { data: wh } = await supabaseAdmin
        .from("webhooks")
        .select("created_by")
        .eq("id", webhookId)
        .maybeSingle();
      if (wh) ownerId = wh.created_by;
    }

    // ---------- Lookup routing rule ----------
    let routing: any = null;
    if (ownerId) {
      const { data: rs } = await supabaseAdmin
        .from("channel_routing")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("channel", channel)
        .eq("enabled", true)
        .order("sub_company_id", { ascending: false, nullsFirst: false });
      routing = (rs || []).find((r: any) => r.sub_company_id === subCompanyId) || (rs || [])[0] || null;
    }

    if ((eventType === "messages.upsert" || eventType === "message" || eventType === "messages.received") && msgId) {
      // Idempotency
      const { data: existing } = await supabaseAdmin
        .from("chat_messages")
        .select("id")
        .eq("uaz_msg_id", msgId)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ success: true, duplicated: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (remoteJid && messageText) {
        const phone = String(remoteJid).replace("@s.whatsapp.net", "").replace("@g.us", "");

        // Find or create customer scoped by sub_company
        let { data: customer } = await supabaseAdmin
          .from("customers")
          .select("id, sub_company_id, owner_id")
          .eq("phone", phone)
          .eq("sub_company_id", subCompanyId as any)
          .maybeSingle();

        if (!customer) {
          const { data: newCustomer, error: custError } = await supabaseAdmin
            .from("customers")
            .insert({
              name: senderName || `${channel} ${phone}`,
              phone,
              channel,
              owner_id: ownerId,
              sub_company_id: subCompanyId,
              origin_connection_id: connectionId,
              created_by: ownerId || "00000000-0000-0000-0000-000000000000",
            })
            .select()
            .single();
          if (custError) throw custError;
          customer = newCustomer;

          // ---------- Auto-create Lead in configured funnel ----------
          if (routing?.pipeline_id) {
            await supabaseAdmin.from("leads").insert({
              name: senderName || `${channel} ${phone}`,
              phone,
              source: `inbound:${channel}`,
              status: "new",
              owner_id: ownerId,
              sub_company_id: subCompanyId,
              channel,
              origin_connection_id: connectionId,
              pipeline_id: routing.pipeline_id,
              stage_id: routing.stage_id,
              customer_id: customer.id,
              created_by: ownerId || "00000000-0000-0000-0000-000000000000",
              notes: `Lead criado automaticamente via ${channel}. Primeira mensagem: "${messageText.substring(0, 200)}"`,
            });
          }
        }

        if (customer) {
          await supabaseAdmin.from("chat_messages").insert({
            customer_id: customer.id,
            sender_type: "client",
            content: messageText,
            uaz_msg_id: msgId,
            channel,
            sub_company_id: subCompanyId,
            connection_id: connectionId,
            metadata: { raw: payload.data, routing_applied: !!routing },
          });
        }
      }
    }

    responseBody = JSON.stringify({ success: true, routing_applied: !!routing, channel });

    await supabaseAdmin.from("uaz_audit_logs").insert({
      event_type: 'webhook',
      status: 'success',
      message: `Evento [${eventType}] processado para [${remoteJid}] canal=${channel} sub=${subCompanyId || 'global'}`,
      payload,
      latency_ms: Date.now() - startTime
    });

  } catch (err) {
    console.error("Inbound Webhook error:", (err as Error).message);
    responseStatus = 500;
    responseBody = JSON.stringify({ error: (err as Error).message });

    await supabaseAdmin.from("uaz_audit_logs").insert({
      event_type: 'webhook',
      status: 'error',
      message: `Falha no processamento: ${(err as Error).message}`,
      payload,
      response: { error: (err as Error).message },
      latency_ms: Date.now() - startTime
    });
  } finally {
    if (webhookId) {
      await supabaseAdmin.from("webhook_logs").insert({
        webhook_id: webhookId,
        event_type: payload?.event || "inbound.webhook",
        payload: payload,
        response_status: responseStatus,
        direction: 'inbound'
      });
    }
  }

  return new Response(responseBody, {
    status: responseStatus,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
