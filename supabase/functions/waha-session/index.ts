// waha-session — server-side control for a WAHA session (QR fetch + restart).
// Isolated to WAHA provider; does not touch UAZ / Evolution / Wavoip flows.
// Actions:
//   - "qr":      fetch current QR (returns base64 PNG data URL + raw session status)
//   - "restart": stop + start the session (used by the progressive-retry recovery)
//   - "status":  just probe raw session status
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const action = (body?.action ?? "status") as "qr" | "restart" | "status";
    const connectionId: string | undefined = body?.connection_id;

    let url: string | undefined = body?.url;
    let token: string | undefined = body?.token;
    let session: string | undefined = body?.session;

    if (connectionId) {
      const { data: conn } = await supabaseAdmin
        .from("whatsapp_connections")
        .select("id, provider, metadata")
        .eq("id", connectionId)
        .single();
      if (conn && conn.provider === "waha") {
        url = url ?? conn.metadata?.url;
        token = token ?? conn.metadata?.token;
        session = session ?? conn.metadata?.session;
      }
    }

    const base = normalizeUrl(url);
    const sess = (session || "default").trim();
    if (!base) throw new Error("WAHA URL ausente");
    if (!token) throw new Error("WAHA token ausente");

    if (action === "restart") {
      // stop then start; ignore stop errors (session may already be stopped)
      await fetch(`${base}/api/sessions/${encodeURIComponent(sess)}/stop`, {
        method: "POST",
        headers: { "X-Api-Key": token },
      }).catch(() => null);
      const startRes = await fetch(`${base}/api/sessions/${encodeURIComponent(sess)}/start`, {
        method: "POST",
        headers: { "X-Api-Key": token },
      });
      const startText = await startRes.text();
      let startData: any = {};
      try { startData = startText ? JSON.parse(startText) : {}; } catch { /* keep text */ }
      return new Response(
        JSON.stringify({
          ok: startRes.ok,
          action: "restart",
          status: startData?.status ?? "UNKNOWN",
          raw: startData,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // status + optional qr
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
          // base64 encode
          let bin = "";
          for (const b of buf) bin += String.fromCharCode(b);
          qrDataUrl = `data:image/png;base64,${btoa(bin)}`;
        }
      } else {
        qrError = `Sessão em estado ${rawStatus} — QR não é aplicável.`;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        action,
        status: rawStatus,
        connected: /working|connected|open|running/i.test(rawStatus),
        phone: st.data?.me?.id ?? null,
        qr: qrDataUrl,
        qr_error: qrError,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
