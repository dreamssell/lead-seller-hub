import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mirror of waha-inbound's canonicalMsgId: WAHA/UAZ backends echo the same
// WhatsApp message as `true_<jid>_3EB0...` on one path and bare `3EB0...` on
// another. Storing whichever form UAZ returned leaves the inbound webhook
// unable to dedupe (it canonicalises to bare hex), producing a second row and
// a "duplicated conversation" bubble. Always persist the canonical bare id.
function canonicalMsgId(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const parts = raw.split('_');
  const tail = parts[parts.length - 1];
  if (parts.length >= 3 && /^[A-F0-9]{16,}$/i.test(tail)) return tail.toUpperCase();
  return /^[A-F0-9]{16,}$/i.test(raw) ? raw.toUpperCase() : raw;
}



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const startTime = Date.now();
  let responseData: any = null;

  try {
    const { customer_id, content, client_msg_id, connection_id } = await req.json();

    if (!customer_id || !content) {
      throw new Error("Missing customer_id or content");
    }

    // 1. Load settings (Database overrides Environment Variables)
    const { data: settings } = await supabaseAdmin
      .from("uaz_system_settings")
      .select("*")
      .eq("id", "global")
      .single();

    const timeout = Number(Deno.env.get("UAZ_TIMEOUT")) || settings?.request_timeout_ms || 30000;

    // 2. Idempotency Check — if the caller already sent this client_msg_id we
    //    MUST NOT hit UAZ again. UAZ does not accept idempotency keys, so any
    //    retry (network flake, StrictMode double-invoke, user double-click)
    //    would otherwise deliver the same WhatsApp message twice.
    if (client_msg_id) {
      const { data: existing } = await supabaseAdmin
        .from("chat_messages")
        .select("id, uaz_msg_id, metadata")
        .eq("client_msg_id", client_msg_id)
        .maybeSingle();

      if (existing?.uaz_msg_id) {
        return new Response(JSON.stringify({
          success: true,
          duplicated: true,
          data: existing.metadata?.uaz_response ?? { id: existing.uaz_msg_id },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 3. Get Phone & Connection (respect the exact connection the caller picked
    //    so we don't cross tenants when multiple UAZ instances coexist).
    const { data: customer } = await supabaseAdmin.from("customers").select("phone").eq("id", customer_id).single();
    const connQuery = supabaseAdmin.from("whatsapp_connections").select("*").eq("provider", "uaz");
    const { data: conn } = connection_id
      ? await connQuery.eq("id", connection_id).maybeSingle()
      : await connQuery.limit(1).maybeSingle();

    if (!customer?.phone || !conn?.metadata?.token) {
      throw new Error("Configuração incompleta");
    }

    const uazUrl = conn.metadata.url || "https://api.uazapi.dev";
    const uazToken = conn.metadata.token;
    const phone = customer.phone.includes("@") ? customer.phone : `${customer.phone}@s.whatsapp.net`;

    // 4. Send — SINGLE attempt. Retrying a non-idempotent send after a timeout
    //    is what causes recipients to receive the same message twice: UAZ may
    //    have accepted+dispatched the first request even though the HTTP
    //    response never made it back to us. Let the client decide whether to
    //    reissue with the SAME client_msg_id (which will short-circuit at the
    //    idempotency check above).
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let res: Response;
    try {
      res = await fetch(`${uazUrl}/message/text`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${uazToken}`,
          "apikey": uazToken,
        },
        body: JSON.stringify({ number: phone, text: content }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    responseData = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(`UAZ HTTP ${res.status}: ${JSON.stringify(responseData ?? {}).slice(0, 300)}`);
    }

    const uazMsgId = canonicalMsgId(responseData?.data?.key?.id || responseData?.id || responseData?.key?.id || null);

    // 5. Persist — UPSERT on client_msg_id so a caller retry never inserts a
    //    duplicate row, and a caller that already inserted an optimistic row
    //    just gets it updated in place.
    if (client_msg_id) {
      await supabaseAdmin.from("chat_messages").upsert({
        customer_id,
        sender_type: "agent",
        content,
        client_msg_id,
        connection_id: conn.id,
        uaz_msg_id: uazMsgId,
        metadata: { uaz_response: responseData, status: "sent" },
      }, { onConflict: "client_msg_id" });
    } else {
      await supabaseAdmin.from("chat_messages").insert({
        customer_id,
        sender_type: "agent",
        content,
        connection_id: conn.id,
        uaz_msg_id: uazMsgId,
        metadata: { uaz_response: responseData, status: "sent" },
      });
    }

    await supabaseAdmin.from("uaz_audit_logs").insert({
      event_type: 'send_message', status: 'success',
      message: `Enviado para ${phone}`,
      payload: { customer_id, phone, content, client_msg_id },
      response: responseData, latency_ms: Date.now() - startTime
    });

    return new Response(JSON.stringify({ success: true, data: responseData, message_id: uazMsgId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    await supabaseAdmin.from("uaz_audit_logs").insert({
      event_type: 'send_message', status: 'error',
      message: `Erro: ${(err as Error).message}`, response: { error: (err as Error).message },
      latency_ms: Date.now() - startTime
    });
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
