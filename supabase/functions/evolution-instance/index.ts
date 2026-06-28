// Evolution API instance manager: create instance, fetch QR, check state, logout, delete.
// Designed to be called from the client (verify_jwt = false by Lovable default; we still
// validate the user JWT and ownership of the whatsapp_connections row).

import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Action = "create" | "qr" | "state" | "logout" | "delete" | "test" | "set_webhook" | "import_chats" | "set_auto_import";

interface Body {
  action: Action;
  connection_id: string;
  url?: string;
  token?: string;
  instance?: string;
  // import_chats options:
  max_chats?: number;
  messages_per_chat?: number;
  offset?: number;
  batch_size?: number;
  include_groups?: boolean;
  dry_run?: boolean;
  download_media?: boolean;
  run_id?: string;            // continuation of an existing audit run
  // set_auto_import options:
  enabled?: boolean;
  interval_hours?: number;
}

const MEDIA_BUCKET = "whatsapp-media";


async function evoFetch(
  baseUrl: string,
  token: string,
  path: string,
  init: RequestInit = {},
) {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: token,
    Authorization: `Bearer ${token}`,
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

/**
 * Fetch with exponential backoff on transient failures (network, 5xx, 429).
 * 4xx (except 429) returns immediately — they are deterministic errors.
 */
async function evoFetchRetry(
  baseUrl: string,
  token: string,
  path: string,
  init: RequestInit = {},
  attempts = 4,
) {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await evoFetch(baseUrl, token, path, init);
      const transient = r.status === 429 || r.status === 0 || (r.status >= 500 && r.status <= 599);
      if (!transient) return r;
      lastErr = new Error(`HTTP ${r.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (i < attempts - 1) {
      const delay = Math.min(8000, 400 * Math.pow(2, i)) + Math.floor(Math.random() * 250);
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("evolution request failed");
}

function inboundWebhookUrl(connectionId: string): string {
  const base = Deno.env.get("SUPABASE_URL")!.replace(/\/$/, "");
  return `${base}/functions/v1/handle-inbound-webhook?connection_id=${connectionId}&channel=whatsapp`;
}

async function registerWebhook(
  baseUrl: string,
  token: string,
  instance: string,
  connectionId: string,
) {
  const webhookUrl = inboundWebhookUrl(connectionId);
  const events = [
    "MESSAGES_UPSERT",
    "MESSAGES_UPDATE",
    "SEND_MESSAGE",
    "CONNECTION_UPDATE",
    "CONTACTS_UPSERT",
    "CHATS_UPSERT",
  ];
  // Evolution v2 expects nested { webhook: {...} }; v1 accepts flat. Send both.
  const body = {
    webhook: {
      url: webhookUrl,
      enabled: true,
      webhookByEvents: false,
      webhook_by_events: false,
      events,
    },
    url: webhookUrl,
    enabled: true,
    webhookByEvents: false,
    events,
  };
  const r = await evoFetch(baseUrl, token, `/webhook/set/${encodeURIComponent(instance)}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`webhook set failed: HTTP ${r.status}`);
  return r.data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: userData, error: userErr } = await admin.auth.getUser(
    authHeader.replace("Bearer ", ""),
  );
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const userId = userData.user.id;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const { action, connection_id } = body;
  if (!action || !connection_id) return json({ error: "missing_fields" }, 400);

  // Load the connection and verify the caller can see it (master, sub-company admin, or shared user).
  const { data: conn, error: connErr } = await admin
    .from("whatsapp_connections")
    .select("*")
    .eq("id", connection_id)
    .maybeSingle();

  if (connErr || !conn) return json({ error: "connection_not_found" }, 404);

  // Platform admin always allowed.
  const { data: isPlatformAdmin } = await admin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });

  // Authorization: a sub-company user may ONLY touch connections that belong to
  // their own sub_company_id. The master owner sees everything they own.
  let allowed = isPlatformAdmin === true || conn.owner_id === userId;

  // Orphan connection (owner_id null) — claim it for the caller so it stops being
  // unmanageable. This typically happens when the row was created by an older flow
  // that never persisted the owner. Only the platform admin or, if absent, the
  // caller themselves can adopt it.
  if (!allowed && !conn.owner_id) {
    allowed = true;
    await admin
      .from("whatsapp_connections")
      .update({ owner_id: userId })
      .eq("id", connection_id)
      .is("owner_id", null);
    conn.owner_id = userId;
  }

  if (!allowed && conn.owner_id) {
    const { data: accessRows } = await admin
      .from("user_account_access")
      .select("user_id, sub_company_id, is_account_admin")
      .eq("user_id", userId)
      .eq("owner_id", conn.owner_id);

    const rows = accessRows ?? [];
    if (rows.length > 0) {
      // Account admin (no sub-company scope) sees all of the owner's connections.
      const isAdmin = rows.some((r) => r.is_account_admin && !r.sub_company_id);
      if (isAdmin) {
        allowed = true;
      } else if (conn.sub_company_id) {
        // Sub-company user: must have an access row for this exact sub_company_id.
        allowed = rows.some((r) => r.sub_company_id === conn.sub_company_id);
      } else {
        // Master-level (no sub_company_id) connection — only account admins above could see it.
        allowed = false;
      }
    }
  }
  if (!allowed) {
    return json(
      {
        error: "forbidden",
        hint: "Esta instância pertence a outra sub-empresa.",
      },
      403,
    );
  }

  const meta = (conn.metadata as Record<string, any>) ?? {};
  const rawUrl = (body.url ?? meta.url ?? "").trim();
  const baseUrl = rawUrl && !/^https?:\/\//i.test(rawUrl) ? `https://${rawUrl}` : rawUrl;
  const token = (body.token ?? meta.token ?? "").trim();
  const instance =
    (body.instance ?? meta.instance ?? meta.phone_number_id ?? "").trim();

  if (!baseUrl || !token) {
    return json({ error: "missing_credentials", hint: "Informe URL e API Key da Evolution." }, 400);
  }
  if (!instance && action !== "delete") {
    return json({ error: "missing_instance", hint: "Defina o nome da instância." }, 400);
  }

  const logEvent = async (
    event_type: string,
    status: "success" | "error" | "info",
    detail?: string,
    payload?: Record<string, unknown>,
  ) => {
    try {
      await admin.from("connection_events").insert({
        connection_id,
        event_type,
        status,
        status_detail: detail ?? null,
        error_message: status === "error" ? detail ?? null : null,
        payload: payload ?? null,
        metadata_json: { actor_user_id: userId, action, instance },
      });
    } catch (e) {
      console.error("[evolution-instance] log failed", e);
    }
  };

  try {
    if (action === "create") {
      // Idempotent: if it already exists Evolution returns 403/409 — we then just connect.
      const created = await evoFetch(baseUrl, token, "/instance/create", {
        method: "POST",
        body: JSON.stringify({
          instanceName: instance,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
        }),
      });

      // Persist credentials onto the connection so subsequent calls work without overrides.
      await admin
        .from("whatsapp_connections")
        .update({
          metadata: { ...meta, url: baseUrl, token, instance },
          status: "connecting",
        })
        .eq("id", connection_id);

      const qrPayload =
        created.data?.qrcode || created.data?.instance?.qrcode || created.data || {};
      const qrOk = !!(qrPayload?.base64 || qrPayload?.qr);
      await logEvent(
        "evolution.create",
        created.ok || created.status === 403 || created.status === 409 ? "success" : "error",
        created.ok
          ? "Instância criada"
          : created.status === 403 || created.status === 409
            ? "Instância já existia — reconectando"
            : `Evolution respondeu ${created.status}`,
        { http_status: created.status, has_qr: qrOk },
      );
      // Best-effort: register the inbound webhook so messages start arriving
      // in this platform as soon as the phone is paired. Failures here must not
      // break the QR flow — they are logged for visibility.
      try {
        await registerWebhook(baseUrl, token, instance, connection_id);
        await logEvent("evolution.webhook_set", "success", "Webhook registrado na Evolution");
      } catch (e) {
        await logEvent("evolution.webhook_set", "error", (e as Error).message);
      }

      return json({
        ok: true,
        already_existed: !created.ok && (created.status === 403 || created.status === 409),
        status: created.status,
        qr: qrPayload?.base64 || qrPayload?.qr || null,
        pairing_code: qrPayload?.pairingCode || qrPayload?.code || null,
        raw: created.data,
      });
    }

    if (action === "qr") {
      const r = await evoFetch(baseUrl, token, `/instance/connect/${encodeURIComponent(instance)}`);
      const payload = r.data?.qrcode || r.data || {};
      return json({
        ok: r.ok,
        status: r.status,
        qr: payload?.base64 || payload?.qr || r.data?.base64 || null,
        pairing_code: payload?.pairingCode || payload?.code || r.data?.code || null,
        raw: r.data,
      });
    }

    if (action === "state") {
      const r = await evoFetch(
        baseUrl,
        token,
        `/instance/connectionState/${encodeURIComponent(instance)}`,
      );
      const state = r.data?.instance?.state || r.data?.state || "unknown";
      const connected = state === "open";

      // Sync the connection row.
      const newStatus: "connected" | "connecting" | "disconnected" | "error" = connected
        ? "connected"
        : state === "connecting"
          ? "connecting"
          : r.ok
            ? "disconnected"
            : "error";

      const update: Record<string, any> = {
        status: newStatus,
        last_checked_at: new Date().toISOString(),
        last_error: r.ok ? null : `Evolution ${r.status}`,
      };
      if (connected && r.data?.instance?.owner) {
        update.phone_number = String(r.data.instance.owner).split("@")[0];
      }
      await admin.from("whatsapp_connections").update(update).eq("id", connection_id);

      const authError = r.status === 401 || r.status === 403;
      if (authError) {
        await logEvent("evolution.auth_error", "error", `HTTP ${r.status}`, { state });
      } else if (connected && conn.status !== "connected") {
        await logEvent("evolution.connected", "success", "Instância conectada", {
          phone: update.phone_number ?? null,
        });
      } else if (!r.ok) {
        await logEvent("evolution.state_error", "error", `HTTP ${r.status}`, { state });
      }
      return json({
        ok: r.ok,
        connected,
        state,
        status: r.status,
        auth_error: authError,
        hint: authError
          ? "A API Key da Evolution foi recusada (token expirado ou inválido)."
          : !r.ok
            ? `Evolution respondeu ${r.status}. Verifique URL/instância.`
            : null,
        raw: r.data,
      });
    }

    if (action === "logout") {
      const r = await evoFetch(baseUrl, token, `/instance/logout/${encodeURIComponent(instance)}`, {
        method: "DELETE",
      });
      await admin
        .from("whatsapp_connections")
        .update({ status: "disconnected", phone_number: null })
        .eq("id", connection_id);
      await logEvent("evolution.logout", r.ok ? "success" : "error", r.ok ? "Sessão encerrada" : `HTTP ${r.status}`);
      return json({ ok: r.ok, raw: r.data });
    }

    if (action === "delete") {
      if (instance) {
        await evoFetch(baseUrl, token, `/instance/delete/${encodeURIComponent(instance)}`, {
          method: "DELETE",
        });
      }
      return json({ ok: true });
    }

    if (action === "test") {
      // Pre-flight: reachability + auth + instance existence.
      const checks: Record<string, {
        ok: boolean;
        status?: number;
        message: string;
      }> = {};

      // 1) Reachability — does the URL respond at all?
      let reach: { ok: boolean; status: number; data: any } | null = null;
      try {
        reach = await evoFetch(baseUrl, token, "/");
        checks.reachability = {
          ok: reach.status > 0 && reach.status < 600,
          status: reach.status,
          message:
            reach.status === 0
              ? "Servidor não respondeu."
              : `Servidor respondeu HTTP ${reach.status}.`,
        };
      } catch (e) {
        checks.reachability = {
          ok: false,
          message: `Não foi possível alcançar a URL: ${(e as Error).message}. Verifique protocolo (https://), domínio e firewall.`,
        };
      }

      // 2) Auth — list instances (requires apikey).
      try {
        const a = await evoFetch(baseUrl, token, "/instance/fetchInstances");
        const isAuthOk = a.status !== 401 && a.status !== 403;
        checks.auth = {
          ok: isAuthOk,
          status: a.status,
          message: isAuthOk
            ? "API Key aceita pelo servidor."
            : `API Key recusada (HTTP ${a.status}). Verifique se copiou a AUTHENTICATION_API_KEY correta e se não há espaços extras.`,
        };
      } catch (e) {
        checks.auth = {
          ok: false,
          message: `Falha ao validar API Key: ${(e as Error).message}.`,
        };
      }

      // 3) Instance existence
      try {
        const s = await evoFetch(
          baseUrl,
          token,
          `/instance/connectionState/${encodeURIComponent(instance)}`,
        );
        const exists = s.status === 200;
        const state = s.data?.instance?.state || s.data?.state || null;
        checks.instance = {
          ok: exists || s.status === 404,
          status: s.status,
          message: exists
            ? `Instância "${instance}" encontrada (estado: ${state ?? "desconhecido"}).`
            : s.status === 404
              ? `Instância "${instance}" ainda não existe — será criada ao gerar o QR.`
              : `Servidor respondeu HTTP ${s.status} ao consultar a instância.`,
        };
      } catch (e) {
        checks.instance = {
          ok: false,
          message: `Erro ao consultar a instância: ${(e as Error).message}.`,
        };
      }

      const overallOk = checks.reachability.ok && checks.auth.ok && checks.instance.ok;
      await logEvent(
        "evolution.test",
        overallOk ? "success" : "error",
        overallOk ? "Pré-validação bem-sucedida" : "Pré-validação falhou",
        { checks },
      );
      return json({ ok: overallOk, checks });
    }

    if (action === "set_webhook") {
      try {
        const r = await registerWebhook(baseUrl, token, instance, connection_id);
        await logEvent("evolution.webhook_set", "success", "Webhook registrado manualmente");
        return json({ ok: true, raw: r });
      } catch (e) {
        await logEvent("evolution.webhook_set", "error", (e as Error).message);
        return json({ ok: false, error: (e as Error).message }, 502);
      }
    }

    if (action === "set_auto_import") {
      const enabled = body.enabled !== false;
      const intervalHours = Math.max(1, Math.min(Number(body.interval_hours) || 6, 168));
      await admin
        .from("whatsapp_connections")
        .update({
          metadata: {
            ...meta,
            auto_import_enabled: enabled,
            auto_import_interval_hours: intervalHours,
          },
        })
        .eq("id", connection_id);
      await logEvent(
        "evolution.auto_import_config",
        "success",
        `Auto-importação ${enabled ? "ativada" : "desativada"} a cada ${intervalHours}h`,
      );
      return json({ ok: true, enabled, interval_hours: intervalHours });
    }

    if (action === "import_chats") {
      // 1) Ensure webhook is set so new messages keep flowing.
      try { await registerWebhook(baseUrl, token, instance, connection_id); } catch (_) { /* best effort */ }

      const maxChats = Math.max(1, Math.min(Number(body.max_chats) || 2000, 10000));
      const perChat = Math.max(1, Math.min(Number(body.messages_per_chat) || 200, 1000));
      const offset = Math.max(0, Number(body.offset) || 0);
      const batchSize = Math.max(1, Math.min(Number(body.batch_size) || 15, 50));
      const includeGroups = body.include_groups !== false; // default true now
      const instEnc = encodeURIComponent(instance);

      // Helper to try multiple endpoint shapes — Evolution v1/v2 vary.
      const tryEndpoints = async (
        paths: { path: string; init?: RequestInit }[],
      ) => {
        for (const p of paths) {
          const r = await evoFetch(baseUrl, token, p.path, p.init);
          if (r.ok) return r;
        }
        return null;
      };

      const pickArray = (d: any): any[] => {
        if (Array.isArray(d)) return d;
        if (Array.isArray(d?.chats)) return d.chats;
        if (Array.isArray(d?.contacts)) return d.contacts;
        if (Array.isArray(d?.messages)) return d.messages;
        if (Array.isArray(d?.messages?.records)) return d.messages.records;
        if (Array.isArray(d?.data)) return d.data;
        if (Array.isArray(d?.records)) return d.records;
        return [];
      };

      const parsePhone = (jid: string): string | null => {
        if (!jid) return null;
        const base = jid.split("@")[0].split(":")[0];
        const digits = base.replace(/\D/g, "");
        if (digits.length >= 6 && digits.length <= 20) return digits;
        return null;
      };

      const synthContent = (m: any): string => {
        const msg = m.message || {};
        if (msg.conversation) return msg.conversation;
        if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
        if (msg.imageMessage) return msg.imageMessage.caption ? `[Imagem] ${msg.imageMessage.caption}` : "[Imagem]";
        if (msg.videoMessage) return msg.videoMessage.caption ? `[Vídeo] ${msg.videoMessage.caption}` : "[Vídeo]";
        if (msg.audioMessage) return msg.audioMessage.ptt ? "[Áudio - mensagem de voz]" : "[Áudio]";
        if (msg.documentMessage) return `[Documento] ${msg.documentMessage.fileName || ""}`.trim();
        if (msg.stickerMessage) return "[Sticker]";
        if (msg.locationMessage) return "[Localização]";
        if (msg.contactMessage || msg.contactsArrayMessage) return "[Contato]";
        if (msg.reactionMessage?.text) return `[Reação] ${msg.reactionMessage.text}`;
        if (msg.pollCreationMessage) return `[Enquete] ${msg.pollCreationMessage.name || ""}`.trim();
        return m.text || m.body || m.message?.text || "[Mensagem]";
      };

      // 2) On first page: seed contacts via /chat/findContacts so we don't depend on
      //    chats having a "name". This catches the full contact list (34 in the user's case).
      let seededContacts = 0;
      if (offset === 0) {
        const contactsRes = await tryEndpoints([
          { path: `/chat/findContacts/${instEnc}`, init: { method: "POST", body: JSON.stringify({ where: {} }) } },
          { path: `/chat/fetchContacts/${instEnc}` },
          { path: `/contacts/${instEnc}` },
        ]);
        const contacts = pickArray(contactsRes?.data);
        if (contacts.length) {
          // Batch existing lookup
          const phones: string[] = [];
          const byPhone = new Map<string, { name: string }>();
          for (const c of contacts) {
            const jid: string = c.id || c.remoteJid || c.remote_jid || c.jid || "";
            if (!includeGroups && jid.endsWith("@g.us")) continue;
            const phone = parsePhone(jid);
            if (!phone) continue;
            phones.push(phone);
            byPhone.set(phone, {
              name: c.pushName || c.name || c.notifyName || c.verifiedName || `WhatsApp ${phone}`,
            });
          }
          if (phones.length) {
            const { data: existing } = await admin
              .from("customers")
              .select("phone")
              .eq("sub_company_id", conn.sub_company_id as any)
              .in("phone", phones);
            const existingSet = new Set((existing ?? []).map((r: any) => r.phone));
            const toInsert = [...byPhone.entries()]
              .filter(([p]) => !existingSet.has(p))
              .map(([phone, v]) => ({
                name: v.name,
                phone,
                channel: "whatsapp",
                owner_id: conn.owner_id,
                sub_company_id: conn.sub_company_id,
                origin_connection_id: connection_id,
                created_by: conn.owner_id || userId,
              }));
            if (toInsert.length) {
              // chunk to avoid payload limits
              const chunk = 200;
              for (let i = 0; i < toInsert.length; i += chunk) {
                const part = toInsert.slice(i, i + chunk);
                const ins = await admin.from("customers").insert(part);
                if (!ins.error) seededContacts += part.length;
              }
            }
          }
        }
      }

      // 3) Fetch chat list — try v2 POST then v1 GET fallbacks.
      const chatsRes = await tryEndpoints([
        { path: `/chat/findChats/${instEnc}`, init: { method: "POST", body: JSON.stringify({ where: {} }) } },
        { path: `/chat/findChats/${instEnc}`, init: { method: "POST", body: JSON.stringify({}) } },
        { path: `/chat/fetchChats/${instEnc}` },
        { path: `/chats/${instEnc}` },
      ]);
      const chats: any[] = pickArray(chatsRes?.data);

      if (!chatsRes && !chats.length) {
        await logEvent("evolution.import", "error", `findChats falhou em todos os endpoints`);
        return json({ ok: false, error: `Evolution não respondeu ao listar conversas. Verifique a versão da API.` }, 502);
      }

      // Sort by most recent activity if possible (Evolution sometimes returns unsorted)
      chats.sort((a, b) => {
        const ta = Number(a.updatedAt || a.t || a.lastMessageTimestamp || 0);
        const tb = Number(b.updatedAt || b.t || b.lastMessageTimestamp || 0);
        return tb - ta;
      });

      const totalAvailable = Math.min(chats.length, maxChats);
      const slice = chats.slice(offset, offset + batchSize);

      let importedCustomers = seededContacts;
      let importedMessages = 0;
      let processedChats = 0;
      let skippedGroups = 0;

      for (const chat of slice) {
        processedChats++;
        const jid: string = chat.id || chat.remoteJid || chat.remote_jid || "";
        const isGroup = jid.endsWith("@g.us");
        if (isGroup && !includeGroups) { skippedGroups++; continue; }

        // For groups we still need a synthetic "phone" — use jid hash digits
        let phone: string | null;
        if (isGroup) {
          phone = jid.replace(/\D/g, "").slice(0, 20) || null;
        } else {
          phone = parsePhone(jid);
        }
        if (!phone) continue;

        const displayName: string =
          chat.name || chat.subject || chat.pushName || chat.notifyName ||
          (isGroup ? `Grupo ${phone.slice(-6)}` : `WhatsApp ${phone}`);

        // Upsert customer scoped by sub_company
        let customerId: string | null = null;
        const existing = await admin
          .from("customers")
          .select("id")
          .eq("phone", phone)
          .eq("sub_company_id", conn.sub_company_id as any)
          .maybeSingle();
        if (existing.data?.id) {
          customerId = existing.data.id;
        } else {
          const ins = await admin
            .from("customers")
            .insert({
              name: displayName,
              phone,
              channel: "whatsapp",
              owner_id: conn.owner_id,
              sub_company_id: conn.sub_company_id,
              origin_connection_id: connection_id,
              created_by: conn.owner_id || userId,
              metadata: isGroup ? { is_group: true, jid } : undefined,
            } as any)
            .select("id")
            .single();
          if (ins.error || !ins.data) continue;
          customerId = ins.data.id;
          importedCustomers++;
        }

        // Fetch messages — try v2 + v1 shapes
        const msgsRes = await tryEndpoints([
          {
            path: `/chat/findMessages/${instEnc}`,
            init: {
              method: "POST",
              body: JSON.stringify({ where: { key: { remoteJid: jid } }, limit: perChat }),
            },
          },
          {
            path: `/chat/findMessages/${instEnc}`,
            init: {
              method: "POST",
              body: JSON.stringify({ where: { remoteJid: jid }, limit: perChat }),
            },
          },
          {
            path: `/chat/fetchMessages/${instEnc}?remoteJid=${encodeURIComponent(jid)}&limit=${perChat}`,
          },
        ]);
        const msgs: any[] = pickArray(msgsRes?.data);
        if (!msgs.length) continue;

        // Batch-check existing messages
        const msgIds: string[] = [];
        for (const m of msgs) {
          const id = m.key?.id || m.id || m.messageId;
          if (id) msgIds.push(id);
        }
        const { data: dupRows } = await admin
          .from("chat_messages")
          .select("uaz_msg_id")
          .in("uaz_msg_id", msgIds);
        const dupSet = new Set((dupRows ?? []).map((r: any) => r.uaz_msg_id));

        const toInsert: any[] = [];
        for (const m of msgs) {
          const msgId: string = m.key?.id || m.id || m.messageId;
          if (!msgId || dupSet.has(msgId)) continue;
          const fromMe: boolean = !!m.key?.fromMe;
          const content = synthContent(m);
          toInsert.push({
            customer_id: customerId,
            sender_type: fromMe ? "agent" : "client",
            content,
            uaz_msg_id: msgId,
            channel: "whatsapp",
            sub_company_id: conn.sub_company_id,
            connection_id,
            metadata: { source: "evolution_import", raw: m },
            created_at: m.messageTimestamp
              ? new Date(Number(m.messageTimestamp) * 1000).toISOString()
              : undefined,
          });
        }
        if (toInsert.length) {
          // chunk inserts
          const chunk = 200;
          for (let i = 0; i < toInsert.length; i += chunk) {
            const part = toInsert.slice(i, i + chunk);
            const ins = await admin.from("chat_messages").insert(part);
            if (!ins.error) importedMessages += part.length;
          }
        }
      }

      const nextOffset = offset + slice.length;
      const done = nextOffset >= totalAvailable || slice.length === 0;

      if (done) {
        await admin
          .from("whatsapp_connections")
          .update({
            metadata: { ...meta, last_import_at: new Date().toISOString() },
          })
          .eq("id", connection_id);
        await logEvent(
          "evolution.import",
          "success",
          `Importação concluída: ${importedCustomers} contatos, ${importedMessages} mensagens (total chats: ${chats.length})`,
          { total_chats: chats.length, max_chats: maxChats, per_chat: perChat, skipped_groups: skippedGroups },
        );
      }

      return json({
        ok: true,
        chats_seen: chats.length,
        total_available: totalAvailable,
        offset,
        next_offset: nextOffset,
        done,
        processed_chats: processedChats,
        skipped_groups: skippedGroups,
        batch_customers: importedCustomers,
        batch_messages: importedMessages,
        customers_imported: importedCustomers,
        messages_imported: importedMessages,
      });
    }


    return json({ error: "invalid_action" }, 400);



  } catch (err) {
    console.error("[evolution-instance] error", err);
    return json({ error: (err as Error).message }, 500);
  }
});
