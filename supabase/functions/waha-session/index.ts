// waha-session — server-side control for WAHA sessions (multi-tenant).
// Isolated to WAHA — does not touch UAZ / Evolution / Wavoip.
//
// Actions:
//   - "status":      probe raw session status
//   - "qr":          fetch current QR (returns base64 PNG data URL + status)
//   - "restart":     stop + start the session (used by progressive-retry recovery)
//   - "logout":      logout the connected phone (keeps session provisioned)
//   - "create":      POST /api/sessions on the WAHA server (webhook baked in)
//   - "delete":      DELETE /api/sessions/{name} on the WAHA server
//   - "list_remote": list all sessions provisioned on the WAHA server
//
// Every action that touches a connection row validates that the calling user
// is the owner OR has account admin access to that owner (via
// user_account_access). This is what makes multi-empresa safe in a SaaS.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeUrl(raw: string | undefined | null): string {
  const trimmed = (raw ?? "").trim().replace(/\/$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function fetchStatus(base: string, session: string, token: string) {
  const res = await fetch(`${base}/api/sessions/${encodeURIComponent(session)}`, {
    headers: { "Content-Type": "application/json", ...(token ? { "X-Api-Key": token } : {}) },
  });
  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { ok: res.ok, status_code: res.status, data };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const action = (body?.action ?? "status") as
      | "status" | "qr" | "restart" | "logout" | "create" | "delete" | "list_remote";
    const connectionId: string | undefined = body?.connection_id;

    let url: string | undefined = body?.url;
    let token: string | undefined = body?.token;
    let session: string | undefined = body?.session;
    let conn: any = null;

    // Resolve caller identity (JWT). Required for ownership check.
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    let callerId: string | null = null;
    if (jwt) {
      const { data: uRes } = await supabaseAdmin.auth.getUser(jwt);
      callerId = uRes?.user?.id ?? null;
    }

    if (connectionId) {
      const { data } = await supabaseAdmin
        .from("whatsapp_connections")
        .select("id, provider, metadata, owner_id, sub_company_id")
        .eq("id", connectionId)
        .maybeSingle();
      conn = data;
      if (!conn) return json({ ok: false, error: "connection_not_found" });
      if (conn.provider !== "waha") return json({ ok: false, error: "not_a_waha_connection" });

      // Ownership check (skip only for internal calls without JWT — those come
      // from other edge functions using service role).
      if (callerId) {
        const isOwner = conn.owner_id === callerId;
        let hasAccess = isOwner;
        if (!isOwner) {
          const { data: access } = await supabaseAdmin
            .from("user_account_access")
            .select("is_account_admin, sub_company_id")
            .eq("user_id", callerId)
            .eq("owner_id", conn.owner_id);
          hasAccess = !!access?.some((a: any) =>
            a.is_account_admin
            && (a.sub_company_id === null || a.sub_company_id === conn.sub_company_id)
          );
        }
        if (!hasAccess) {
          // Global admin fallback
          const { data: roles } = await supabaseAdmin
            .from("user_roles").select("role").eq("user_id", callerId).eq("role", "admin");
          if (!roles?.length) return json({ ok: false, error: "forbidden" }, 200);
        }
      }

      url = url ?? conn.metadata?.url;
      token = token ?? conn.metadata?.token;
      session = session ?? conn.metadata?.session;
    }

    const base = normalizeUrl(url);
    const sess = (session || "default").trim();
    if (!base) return json({ ok: false, error: "WAHA URL ausente" });
    if (!token) return json({ ok: false, error: "WAHA token ausente" });

    const headers = { "X-Api-Key": token, "Content-Type": "application/json" };

    // ─── list_remote ───────────────────────────────────────────────────────
    if (action === "list_remote") {
      const res = await fetch(`${base}/api/sessions`, { headers });
      const text = await res.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
      return json({ ok: res.ok, sessions: data });
    }

    // ─── create ────────────────────────────────────────────────────────────
    if (action === "create") {
      // Compose webhook URL pointing at waha-inbound for this connection.
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const webhookUrl = connectionId
        ? `${supabaseUrl.replace(/\/$/, "")}/functions/v1/waha-inbound?connection=${connectionId}`
        : undefined;

      const payload: any = {
        name: sess,
        start: true,
        config: {
          ...(webhookUrl
            ? {
                webhooks: [
                  {
                    url: webhookUrl,
                    events: ["message", "message.any", "message.ack", "session.status"],
                    hmac: null,
                    retries: { policy: "linear", delaySeconds: 2, attempts: 3 },
                    customHeaders: [{ name: "X-Api-Key", value: token }],
                  },
                ],
              }
            : {}),
        },
      };
      const res = await fetch(`${base}/api/sessions`, {
        method: "POST", headers, body: JSON.stringify(payload),
      });
      const text = await res.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

      if (res.ok && conn) {
        await supabaseAdmin.from("whatsapp_connections").update({
          metadata: { ...(conn.metadata ?? {}), url: base, token, session: sess },
          status: "connecting",
        }).eq("id", conn.id);
      }
      return json({ ok: res.ok, status_code: res.status, session: sess, raw: data });
    }

    // ─── delete ────────────────────────────────────────────────────────────
    if (action === "delete") {
      const res = await fetch(`${base}/api/sessions/${encodeURIComponent(sess)}`, {
        method: "DELETE", headers,
      });
      const text = await res.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
      if (conn) {
        await supabaseAdmin.from("whatsapp_connections").update({
          status: "disconnected",
          metadata: { ...(conn.metadata ?? {}), session: null },
        }).eq("id", conn.id);
      }
      return json({ ok: res.ok || res.status === 404, status_code: res.status, raw: data });
    }

    // ─── logout ────────────────────────────────────────────────────────────
    if (action === "logout") {
      const res = await fetch(`${base}/api/sessions/${encodeURIComponent(sess)}/logout`, {
        method: "POST", headers,
      });
      const text = await res.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
      return json({ ok: res.ok, status_code: res.status, raw: data });
    }

    // ─── restart ───────────────────────────────────────────────────────────
    if (action === "restart") {
      await fetch(`${base}/api/sessions/${encodeURIComponent(sess)}/stop`, {
        method: "POST", headers,
      }).catch(() => null);
      const startRes = await fetch(`${base}/api/sessions/${encodeURIComponent(sess)}/start`, {
        method: "POST", headers,
      });
      const startText = await startRes.text();
      let startData: any = {};
      try { startData = startText ? JSON.parse(startText) : {}; } catch { /* keep */ }
      return json({
        ok: startRes.ok, action: "restart",
        status: startData?.status ?? "UNKNOWN", raw: startData,
      });
    }

    // ─── status (+ optional qr) ────────────────────────────────────────────
    const st = await fetchStatus(base, sess, token);
    const rawStatus: string = st.data?.status ?? st.data?.state ?? "UNKNOWN";

    let qrDataUrl: string | null = null;
    let qrError: string | null = null;
    if (action === "qr") {
      if (/scan_qr_code|starting/i.test(rawStatus)) {
        const qrRes = await fetch(
          `${base}/api/${encodeURIComponent(sess)}/auth/qr?format=image`,
          { headers: { "X-Api-Key": token } },
        );
        if (!qrRes.ok) {
          qrError = `QR indisponível [${qrRes.status}]`;
        } else {
          const buf = new Uint8Array(await qrRes.arrayBuffer());
          let bin = "";
          for (const b of buf) bin += String.fromCharCode(b);
          qrDataUrl = `data:image/png;base64,${btoa(bin)}`;
        }
      } else {
        qrError = `Sessão em estado ${rawStatus} — QR não é aplicável.`;
      }
    }

    return json({
      ok: true, action, status: rawStatus,
      connected: /working|connected|open|running/i.test(rawStatus),
      phone: st.data?.me?.id ?? null,
      qr: qrDataUrl, qr_error: qrError,
    });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message });
  }
});
