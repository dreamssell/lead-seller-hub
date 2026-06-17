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

type Action = "create" | "qr" | "state" | "logout" | "delete" | "test";

interface Body {
  action: Action;
  connection_id: string;
  // Optional overrides used by the wizard before metadata is persisted:
  url?: string;
  token?: string;
  instance?: string;
}

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

  // Authorization: a sub-company user may ONLY touch connections that belong to
  // their own sub_company_id. The master owner sees everything they own.
  let allowed = conn.owner_id === userId;
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
  const baseUrl = (body.url ?? meta.url ?? "").trim();
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

    return json({ error: "invalid_action" }, 400);



  } catch (err) {
    console.error("[evolution-instance] error", err);
    return json({ error: (err as Error).message }, 500);
  }
});
