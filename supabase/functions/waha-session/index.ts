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
      | "status" | "qr" | "restart" | "logout" | "create" | "delete"
      | "list_remote" | "test_webhook" | "cleanup_scan";
    const connectionId: string | undefined = body?.connection_id;

    const logEvent = async (evType: string, status: string, extra: Record<string, unknown> = {}) => {
      if (!connectionId) return;
      try {
        await supabaseAdmin.from("connection_events").insert({
          connection_id: connectionId,
          event_type: `waha.action.${evType}`,
          status,
          payload: extra as any,
          metadata_json: { source: "waha-session", actor: null },
        });
      } catch (_) { /* best effort */ }
    };

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

    // ─── cleanup_scan (no url/token required) ───────────────────────────────
    // Lists WAHA connections the caller can see that have been disconnected/error
    // for at least `days` days (default 14). The UI decides whether to purge.
    if (action === "cleanup_scan") {
      const days = Math.max(1, Math.min(90, Number(body?.days ?? 14)));
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data: rows } = await supabaseAdmin
        .from("whatsapp_connections")
        .select("id, display_name, status, updated_at, last_checked_at, metadata, owner_id, sub_company_id")
        .eq("provider", "waha")
        .in("status", ["disconnected", "error"])
        .lt("updated_at", cutoff);

      let visible = rows ?? [];
      if (callerId) {
        // Global admin bypasses filter.
        const { data: roles } = await supabaseAdmin
          .from("user_roles").select("role").eq("user_id", callerId).eq("role", "admin");
        if (!roles?.length) {
          const { data: access } = await supabaseAdmin
            .from("user_account_access")
            .select("owner_id, sub_company_id, is_account_admin")
            .eq("user_id", callerId);
          visible = visible.filter((c: any) =>
            c.owner_id === callerId
            || (access ?? []).some((a: any) =>
              a.is_account_admin
              && a.owner_id === c.owner_id
              && (a.sub_company_id === null || a.sub_company_id === c.sub_company_id)
            )
          );
        }
      }

      const candidates = visible.map((c: any) => {
        const lastSeen = c.last_checked_at ?? c.updated_at;
        const idleDays = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 86_400_000);
        const recommendation =
          idleDays >= days * 2 ? "delete_remote"
          : idleDays >= days ? "review"
          : "keep";
        return {
          id: c.id, display_name: c.display_name, status: c.status,
          session: c.metadata?.session ?? null, url: c.metadata?.url ?? null,
          last_seen_at: lastSeen, idle_days: idleDays, recommendation,
        };
      });
      return json({ ok: true, threshold_days: days, candidates });
    }

    if (!base) return json({ ok: false, error: "WAHA URL ausente" });
    if (!token) return json({ ok: false, error: "WAHA token ausente" });

    const headers = { "X-Api-Key": token, "Content-Type": "application/json" };

    // ─── test_webhook ──────────────────────────────────────────────────────
    // Fires a synthetic event at our own waha-inbound endpoint carrying the
    // caller's connection token, so the UI can prove the ?connection= routing
    // and X-Api-Key check are wired correctly for this specific connection.
    if (action === "test_webhook") {
      if (!connectionId) return json({ ok: false, error: "connection_id_required" });
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const inboundUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/waha-inbound?connection=${connectionId}`;
      const testId = crypto.randomUUID();
      const payload = {
        event: "message",
        session: sess,
        payload: {
          id: `test-${testId}`,
          from: "0000000000@c.us",
          body: `[teste ${new Date().toISOString()}] ping de webhook`,
          timestamp: Math.floor(Date.now() / 1000),
          _test: true,
        },
      };
      const r = await fetch(inboundUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": token },
        body: JSON.stringify(payload),
      });
      const respText = await r.text();
      return json({ ok: r.ok, status_code: r.status, test_event_id: testId, response: respText.slice(0, 500) });
    }

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
      await logEvent("create", res.ok ? "success" : "failed", { status_code: res.status, session: sess });
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
      await logEvent("delete", res.ok || res.status === 404 ? "success" : "failed", { status_code: res.status, session: sess });
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
      await logEvent("logout", res.ok ? "success" : "failed", { status_code: res.status });
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
      await logEvent("restart", startRes.ok ? "success" : "failed", { status: startData?.status ?? "UNKNOWN" });
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
