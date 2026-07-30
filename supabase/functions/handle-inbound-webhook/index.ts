import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-signature, x-webhook-id",
};

const normalizePhone = (value: unknown) => String(value || "").replace(/@s\.whatsapp\.net|@c\.us|@g\.us/gi, "").replace(/\D/g, "");

// Mirrors canonicalMsgId in uaz-send-message / waha-inbound. WhatsApp echoes
// the same message id in two shapes: `true_<jid>_<HEX>` (fromMe echo) and bare
// `<HEX>`. Persisting one form while uaz-send-message stored the other breaks
// dedup and shows the sender a duplicated bubble even though the recipient
// only received one message. Always canonicalise to the bare uppercase hex.
const canonicalMsgId = (raw: unknown): string | null => {
  if (!raw || typeof raw !== "string") return null;
  const parts = raw.split("_");
  const tail = parts[parts.length - 1];
  if (parts.length >= 3 && /^[A-F0-9]{16,}$/i.test(tail)) return tail.toUpperCase();
  return /^[A-F0-9]{16,}$/i.test(raw) ? raw.toUpperCase() : raw;
};

const extractMessageText = (data: any) => {
  const msg = data?.message || {};
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    data?.text ||
    data?.body ||
    data?.messageText ||
    ""
  );
};

const getConnectionPhone = (conn: any) => normalizePhone(
  conn?.phone_number ||
  conn?.metadata?.phone ||
  conn?.metadata?.phone_number ||
  conn?.metadata?.number ||
  conn?.metadata?.owner ||
  conn?.metadata?.wuid ||
  conn?.metadata?.me?.id ||
  conn?.metadata?.me?.jid
);

const applyNullableScope = (query: any, column: string, value: string | null | undefined) => (
  value ? query.eq(column, value) : query.is(column, null)
);

const extractStatusMessageId = (data: any) => (
  data?.key?.id ||
  data?.id ||
  data?.messageId ||
  data?.message_id ||
  data?.status?.id ||
  data?.status?.messageId ||
  data?.statuses?.[0]?.id ||
  data?.statuses?.[0]?.messageId
);

const normalizeDeliveryStatus = (value: unknown): string | null => {
  const status = String(value || "").toLowerCase();
  if (!status) return null;
  if (/read|played/.test(status)) return "read";
  if (/deliver|delivery|server_ack|device_ack/.test(status)) return "delivered";
  if (/sent|pending|ack/.test(status)) return "sent";
  if (/error|fail|reject/.test(status)) return "error";
  return null;
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
  // The webhook identity can arrive via header (legacy) OR via query string /
  // trailing path segment, so the public URL alone is enough for tools like
  // n8n/Zapier/Make that cannot easily add custom headers.
  const pathId = url.pathname.split("/").filter(Boolean).pop() || "";
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pathId);
  const webhookId =
    req.headers.get("X-Webhook-ID") ||
    req.headers.get("x-webhook-id") ||
    url.searchParams.get("webhook_id") ||
    url.searchParams.get("wh") ||
    (isUuid ? pathId : null);

  const startTime = Date.now();
  let responseStatus = 200;
  let responseBody = "Success";
  let payload: any = null;

  try {
    const bodyText = await req.text();
    payload = JSON.parse(bodyText);

    const eventType = payload.event || "unknown";
    const remoteJid = payload.data?.key?.remoteJid || payload.data?.remoteJid || payload.data?.from;
    const messageText = extractMessageText(payload.data);
    const rawMsgId = payload.data?.key?.id || payload.data?.id;
    const msgId = canonicalMsgId(rawMsgId);
    const senderName = payload.data?.pushName || payload.data?.notifyName;
    const fromMe = Boolean(payload.data?.key?.fromMe ?? payload.data?.fromMe ?? false);

    // ---------- Resolve scope (owner + sub_company + channel + connection) ----------
    let ownerId: string | null = null;
    let subCompanyId: string | null = qSubCompanyId;
    let connectionId: string | null = qConnectionId;
    let channel = qChannel;
    let connectionPhone = "";

    if (connectionId) {
      const { data: conn } = await supabaseAdmin
        .from("whatsapp_connections")
        .select("id, owner_id, sub_company_id, provider, role, phone_number, metadata")
        .eq("id", connectionId)
        .maybeSingle();
      if (conn) {
        ownerId = ownerId || conn.owner_id;
        subCompanyId = subCompanyId || conn.sub_company_id;
        connectionPhone = getConnectionPhone(conn);
        if (conn.provider) channel = channel || (conn.provider === "uaz" || conn.provider === "evolution" ? "whatsapp" : conn.provider);
      }
    }

    let webhookRow: any = null;
    if (webhookId) {
      const { data: wh } = await supabaseAdmin
        .from("webhooks")
        .select("id, name, created_by, owner_id, sub_company_id")
        .eq("id", webhookId)
        .maybeSingle();
      webhookRow = wh || null;
      if (wh) {
        ownerId = ownerId || wh.owner_id || wh.created_by;
        subCompanyId = subCompanyId ?? wh.sub_company_id ?? null;
      }
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

    // ---------- Generic CRM lead payload (Holmes / DealerSpace / n8n / Zapier) ----------
    // Any payload that is not a WhatsApp/Evolution message event but carries
    // lead-ish fields is persisted in public.leads so it feeds "Captura de Leads".
    const isMessageEvent = /^(messages?\.|presence|send\.message|status|chats?\.|contacts?\.)/i.test(String(eventType)) ||
      Boolean(payload?.data?.key?.remoteJid || payload?.data?.message);
    const leadCandidate = payload?.lead || payload?.data?.lead || (!isMessageEvent ? (payload?.data && typeof payload.data === "object" && !Array.isArray(payload.data) ? { ...payload, ...payload.data } : payload) : null);
    const pick = (obj: any, keys: string[]) => {
      for (const k of keys) {
        const v = obj?.[k];
        if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
      }
      return null;
    };

    if (!isMessageEvent && leadCandidate && typeof leadCandidate === "object") {
      const leadName = pick(leadCandidate, ["name", "nome", "full_name", "fullName", "cliente", "customer_name", "contact_name"]);
      const leadEmail = pick(leadCandidate, ["email", "e-mail", "mail"]);
      const leadPhoneRaw = pick(leadCandidate, ["phone", "telefone", "celular", "whatsapp", "phone_number", "mobile"]);
      const leadPhone = leadPhoneRaw ? normalizePhone(leadPhoneRaw) : null;

      if (leadName || leadEmail || leadPhone) {
        const source = pick(leadCandidate, ["source", "origem", "origin", "utm_source"]) || webhookRow?.name || "webhook";
        const status = pick(leadCandidate, ["status", "situacao", "stage"]) || "novo";
        const valueRaw = pick(leadCandidate, ["estimated_value", "valor", "value", "amount", "ticket"]);
        const estimatedValue = valueRaw ? Number(String(valueRaw).replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")) : 0;
        const leadChannel = pick(leadCandidate, ["channel", "canal"]) || channel || "webhook";

        let pipelineId: string | null = routing?.pipeline_id || null;
        let stageId: string | null = routing?.stage_id || null;
        if (!pipelineId && ownerId) {
          const { data: pl } = await supabaseAdmin
            .from("pipelines")
            .select("id")
            .eq("owner_id", ownerId)
            .order("created_at", { ascending: true })
            .limit(1);
          pipelineId = pl?.[0]?.id || null;
        }
        if (pipelineId && !stageId) {
          const { data: st } = await supabaseAdmin
            .from("pipeline_stages")
            .select("id")
            .eq("pipeline_id", pipelineId)
            .order("position", { ascending: true })
            .limit(1);
          stageId = st?.[0]?.id || null;
        }

        const { data: insertedLead, error: leadError } = await supabaseAdmin
          .from("leads")
          .insert({
            name: leadName || leadEmail || leadPhone,
            email: leadEmail,
            phone: leadPhone,
            source,
            status,
            channel: leadChannel,
            estimated_value: Number.isFinite(estimatedValue) ? estimatedValue : 0,
            owner_id: ownerId,
            sub_company_id: subCompanyId,
            pipeline_id: pipelineId,
            stage_id: stageId,
            created_by: ownerId || "00000000-0000-0000-0000-000000000000",
            notes: `Lead recebido via webhook${webhookRow?.name ? ` "${webhookRow.name}"` : ""}.`,
          })
          .select("id")
          .maybeSingle();

        if (leadError) throw leadError;

        responseBody = JSON.stringify({ success: true, lead_id: insertedLead?.id, source, owner_id: ownerId });
        responseStatus = 200;
        await supabaseAdmin.from("webhook_logs").insert({
          webhook_id: webhookId,
          event_type: String(eventType),
          payload,
          response_status: 200,
          direction: "inbound",
        }).then(() => {}, () => {});
        return new Response(responseBody, { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }


    // ---------- Presence updates (online/typing/recording/offline) ----------
    if (eventType === "presence.update" || eventType === "presence") {
      const presList: any[] = Array.isArray(payload.data?.presences)
        ? payload.data.presences
        : payload.data?.id
          ? [{ id: payload.data.id, presences: payload.data.presences || payload.data.presence }]
          : [];
      const jidRoot = payload.data?.id || remoteJid;
      const presObj = payload.data?.presences || payload.data?.presence;

      // Evolution shape: data: { id: '55@s.whatsapp.net', presences: { '55@s.whatsapp.net': { lastKnownPresence: 'available' } } }
      let parsedPresence: string | null = null;
      if (presObj && typeof presObj === 'object') {
        const inner = presObj[jidRoot] || Object.values(presObj)[0];
        parsedPresence = (inner as any)?.lastKnownPresence || (inner as any)?.presence || null;
      } else if (typeof presObj === 'string') {
        parsedPresence = presObj;
      }

      if (jidRoot && parsedPresence) {
        const phone = normalizePhone(jidRoot);
        if (connectionPhone && normalizePhone(phone) === connectionPhone) {
          responseBody = JSON.stringify({ success: true, skipped: "own_presence" });
          return new Response(responseBody, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const now = new Date().toISOString();
        const updates: any = { presence: parsedPresence, presence_updated_at: now };
        if (parsedPresence === 'available' || parsedPresence === 'composing' || parsedPresence === 'recording') {
          updates.last_seen_at = now;
        }
        let presenceQuery = supabaseAdmin.from("customers").update(updates).eq("phone", phone);
        if (ownerId) presenceQuery = presenceQuery.eq("owner_id", ownerId);
        presenceQuery = applyNullableScope(presenceQuery, "sub_company_id", subCompanyId);
        await presenceQuery;
      }
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
        // In Evolution/Baileys, key.remoteJid is the other participant for both
        // inbound and fromMe=true outbound events. Always use remoteJid as the
        // customer phone and fromMe only to decide sender_type. This prevents
        // native WhatsApp outbound messages from appearing as if the lead sent
        // them to themselves.
        const phone = normalizePhone(remoteJid);
        if (!phone || (connectionPhone && phone === connectionPhone)) {
          responseBody = JSON.stringify({ success: true, skipped: "own_number_or_empty_phone", phone });
          return new Response(responseBody, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const senderType = fromMe ? "agent" : "client";

        // Find or create customer scoped by owner + sub-company. Never use
        // maybeSingle() over an unconstrained phone lookup: existing legacy
        // duplicates can make PostgREST return "multiple rows" and the old
        // flow would create yet another contact.
        let customerQuery = supabaseAdmin
          .from("customers")
          .select("id, sub_company_id, owner_id")
          .eq("phone", phone)
          .order("updated_at", { ascending: false })
          .limit(1);
        if (ownerId) customerQuery = customerQuery.eq("owner_id", ownerId);
        customerQuery = applyNullableScope(customerQuery, "sub_company_id", subCompanyId);
        let { data: customerRows } = await customerQuery;
        let customer = (customerRows || [])[0] || null;

        if (!customer) {
          const { data: newCustomer, error: custError } = await supabaseAdmin
            .from("customers")
            .insert({
              name: fromMe ? `${channel} ${phone}` : (senderName || `${channel} ${phone}`),
              phone,
              channel,
              owner_id: ownerId,
              sub_company_id: subCompanyId,
              origin_connection_id: connectionId,
              created_by: ownerId || "00000000-0000-0000-0000-000000000000",
              last_seen_at: new Date().toISOString(),
              presence: 'available',
              presence_updated_at: new Date().toISOString(),
            })
            .select()
            .single();
          if (custError) {
            // If a concurrent webhook/import inserted the same number first,
            // re-read deterministically instead of creating another contact.
            let retryQuery = supabaseAdmin
              .from("customers")
              .select("id, sub_company_id, owner_id")
              .eq("phone", phone)
              .order("updated_at", { ascending: false })
              .limit(1);
            if (ownerId) retryQuery = retryQuery.eq("owner_id", ownerId);
            retryQuery = applyNullableScope(retryQuery, "sub_company_id", subCompanyId);
            const { data: retryRows } = await retryQuery;
            customer = (retryRows || [])[0] || null;
            if (!customer) throw custError;
          } else {
            customer = newCustomer;
          }

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
        } else {
          // Receber mensagem implica que o contato está/estava online — atualiza last_seen e presence
          await supabaseAdmin
            .from("customers")
            .update({ last_seen_at: new Date().toISOString(), presence: 'available', presence_updated_at: new Date().toISOString() })
            .eq("id", customer.id);
        }

        if (customer) {
          // fromMe echo: if the app already inserted an optimistic outbound row
          // (client_msg_id present, uaz_msg_id still null), backfill it in
          // place instead of creating a second bubble for the sender.
          if (fromMe) {
            const { data: pending } = await supabaseAdmin
              .from("chat_messages")
              .select("id")
              .eq("customer_id", customer.id)
              .eq("sender_type", "agent")
              .eq("content", messageText)
              .is("uaz_msg_id", null)
              .order("created_at", { ascending: false })
              .limit(1);
            const pendingRow = (pending || [])[0];
            if (pendingRow) {
              await supabaseAdmin
                .from("chat_messages")
                .update({ uaz_msg_id: msgId, metadata: { raw: payload.data, from_me: true, direction: "outbound_native", status: "sent" } })
                .eq("id", pendingRow.id);
              responseBody = JSON.stringify({ success: true, backfilled: true });
              return new Response(responseBody, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
          }
          await supabaseAdmin.from("chat_messages").insert({
            customer_id: customer.id,
            sender_type: senderType,
            content: messageText,
            uaz_msg_id: msgId,
            channel,
            sub_company_id: subCompanyId,
            connection_id: connectionId,
            metadata: { raw: payload.data, routing_applied: !!routing, from_me: fromMe, direction: fromMe ? "outbound_native" : "inbound", status: fromMe ? "sent" : "read" },
          });
        }
      }
    }

    if (/messages\.(update|ack)|message\.(update|ack)|send\.message|status/i.test(eventType)) {
      const statusMsgId = canonicalMsgId(extractStatusMessageId(payload.data));
      const deliveryStatus = normalizeDeliveryStatus(
        payload.data?.status ||
        payload.data?.ack ||
        payload.data?.deliveryStatus ||
        payload.data?.messageStatus ||
        payload.data?.statuses?.[0]?.status
      );
      if (statusMsgId && deliveryStatus) {
        const { data: existing } = await supabaseAdmin
          .from("chat_messages")
          .select("metadata")
          .eq("uaz_msg_id", statusMsgId)
          .maybeSingle();
        const updates: any = {
          metadata: {
            ...(existing?.metadata || {}),
            delivery_status: deliveryStatus,
            status: deliveryStatus,
            confirmed_at: new Date().toISOString(),
            raw_status: payload.data,
          },
        };
        await supabaseAdmin
          .from("chat_messages")
          .update(updates)
          .eq("uaz_msg_id", statusMsgId);
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
