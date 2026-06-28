// Scheduled auto-importer for Evolution WhatsApp connections.
// Triggered by pg_cron. Iterates over whatsapp_connections where:
//   provider = 'evolution'
//   status   = 'connected'
//   metadata.auto_import_enabled = true
//   metadata.last_import_at older than metadata.auto_import_interval_hours (default 6h)
// For each due connection performs a small batch import (5 chats / 20 msgs each),
// deduplicating messages by their Evolution key.id stored in chat_messages.uaz_msg_id.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function evoFetch(baseUrl: string, token: string, path: string, init: RequestInit = {}) {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: token,
      Authorization: `Bearer ${token}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: connections, error } = await admin
    .from("whatsapp_connections")
    .select("id, owner_id, sub_company_id, provider, status, metadata")
    .eq("provider", "evolution")
    .eq("status", "connected");
  if (error) return json({ error: error.message }, 500);

  const now = Date.now();
  const results: any[] = [];

  for (const conn of connections ?? []) {
    const meta = (conn.metadata as Record<string, any>) ?? {};
    if (!meta.auto_import_enabled) continue;
    const intervalH = Math.max(1, Math.min(168, Number(meta.auto_import_interval_hours) || 6));
    const lastIso = meta.last_import_at || meta.last_auto_import_at;
    const lastMs = lastIso ? Date.parse(lastIso) : 0;
    if (lastMs && (now - lastMs) < intervalH * 3600 * 1000) continue;

    const baseUrlRaw = String(meta.url || "").trim();
    const baseUrl = baseUrlRaw && !/^https?:\/\//i.test(baseUrlRaw) ? `https://${baseUrlRaw}` : baseUrlRaw;
    const token = String(meta.token || "").trim();
    const instance = String(meta.instance || meta.phone_number_id || "").trim();
    if (!baseUrl || !token || !instance) continue;

    let imported = { customers: 0, messages: 0 };
    try {
      const chatsRes = await evoFetch(baseUrl, token, `/chat/findChats/${encodeURIComponent(instance)}`, {
        method: "POST", body: JSON.stringify({ where: {} }),
      });
      const chats: any[] = Array.isArray(chatsRes.data)
        ? chatsRes.data
        : Array.isArray(chatsRes.data?.chats) ? chatsRes.data.chats : [];

      for (const chat of chats.slice(0, 30)) {
        const jid: string = chat.id || chat.remoteJid || chat.remote_jid || "";
        if (!jid || jid.endsWith("@g.us")) continue;
        const phone = jid.replace("@s.whatsapp.net", "").replace("@c.us", "");
        if (!/^\d{6,20}$/.test(phone)) continue;
        const displayName: string = chat.name || chat.pushName || chat.notifyName || `WhatsApp ${phone}`;

        let customerId: string | null = null;
        const existing = await admin.from("customers").select("id")
          .eq("phone", phone).eq("sub_company_id", conn.sub_company_id as any).maybeSingle();
        if (existing.data?.id) {
          customerId = existing.data.id;
        } else {
          const ins = await admin.from("customers").insert({
            name: displayName, phone, channel: "whatsapp",
            owner_id: conn.owner_id, sub_company_id: conn.sub_company_id,
            origin_connection_id: conn.id, created_by: conn.owner_id,
          }).select("id").single();
          if (ins.error || !ins.data) continue;
          customerId = ins.data.id;
          imported.customers++;
        }

        const msgsRes = await evoFetch(baseUrl, token, `/chat/findMessages/${encodeURIComponent(instance)}`, {
          method: "POST",
          body: JSON.stringify({ where: { key: { remoteJid: jid } }, limit: 20 }),
        });
        const msgs: any[] = Array.isArray(msgsRes.data)
          ? msgsRes.data
          : Array.isArray(msgsRes.data?.messages?.records) ? msgsRes.data.messages.records
          : Array.isArray(msgsRes.data?.messages) ? msgsRes.data.messages : [];

        for (const m of msgs) {
          const msgId: string = m.key?.id || m.id || m.messageId;
          if (!msgId || !customerId) continue;
          const fromMe: boolean = !!m.key?.fromMe;
          const text: string =
            m.message?.conversation ||
            m.message?.extendedTextMessage?.text ||
            m.message?.imageMessage?.caption ||
            m.message?.videoMessage?.caption ||
            m.text || m.body || "";
          if (!text) continue;
          const dup = await admin.from("chat_messages").select("id").eq("uaz_msg_id", msgId).maybeSingle();
          if (dup.data) continue;
          const ins = await admin.from("chat_messages").insert({
            customer_id: customerId,
            sender_type: fromMe ? "agent" : "client",
            content: text, uaz_msg_id: msgId, channel: "whatsapp",
            sub_company_id: conn.sub_company_id, connection_id: conn.id,
            metadata: { source: "evolution_auto_import" },
            created_at: m.messageTimestamp ? new Date(Number(m.messageTimestamp) * 1000).toISOString() : undefined,
          });
          if (!ins.error) imported.messages++;
        }
      }

      await admin.from("whatsapp_connections").update({
        metadata: { ...meta, last_import_at: new Date().toISOString(), last_auto_import_at: new Date().toISOString() },
      }).eq("id", conn.id);

      await admin.from("connection_events").insert({
        connection_id: conn.id,
        event_type: "evolution.auto_import",
        status: "success",
        status_detail: `Auto-import: ${imported.customers} contatos, ${imported.messages} mensagens`,
        payload: imported,
        metadata_json: { interval_hours: intervalH },
      });
      results.push({ connection_id: conn.id, ...imported });
    } catch (e) {
      await admin.from("connection_events").insert({
        connection_id: conn.id,
        event_type: "evolution.auto_import",
        status: "error",
        status_detail: (e as Error).message,
        error_message: (e as Error).message,
      });
      results.push({ connection_id: conn.id, error: (e as Error).message });
    }
  }

  return json({ ok: true, processed: results.length, results });
});
