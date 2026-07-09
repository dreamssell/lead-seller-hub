// waha-diagnose — Onda 3: consolidated health report for a WAHA connection.
// Isolated to WAHA; does not touch UAZ / Evolution / Wavoip.
//
// Given { connection_id }, returns a structured diagnostic covering:
//   - session status (STARTING / SCAN_QR_CODE / WORKING / FAILED / STOPPED)
//   - engine (WEBJS / NOWEB / GOWS) — impacts webhook event shape
//   - webhook configured on WAHA matches our waha-inbound URL
//   - last inbound message age (proxy for "estamos recebendo")
//   - last outbound status (sent/failed/queued) in last hour
//   - actionable recommendations the UI can render as chips
//
// Multi-tenant: only owner, account admins for that owner, or global admins
// can request diagnostics for a connection.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeUrl(raw: string | undefined | null): string {
  const t = (raw ?? "").trim().replace(/\/$/, "");
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function expectedWebhookUrl(connectionId: string): string {
  const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  return `${base}/functions/v1/waha-inbound?connection=${connectionId}`;
}

type Severity = "ok" | "warn" | "error";
type Check = { key: string; label: string; severity: Severity; detail: string; hint?: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const connectionId: string | undefined = body?.connection_id;
    if (!connectionId) return json({ ok: false, error: "connection_id_required" }, 400);

    // Caller auth + ownership check (mirrors waha-session).
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    let callerId: string | null = null;
    if (jwt) {
      const { data } = await admin.auth.getUser(jwt);
      callerId = data?.user?.id ?? null;
    }
    if (!callerId) return json({ ok: false, error: "unauthorized" }, 401);

    const { data: conn } = await admin
      .from("whatsapp_connections")
      .select("id, provider, metadata, owner_id, sub_company_id, status, display_name, last_checked_at")
      .eq("id", connectionId).maybeSingle();
    if (!conn) return json({ ok: false, error: "connection_not_found" }, 404);
    if (conn.provider !== "waha") return json({ ok: false, error: "not_a_waha_connection" }, 400);

    const isOwner = conn.owner_id === callerId;
    let allowed = isOwner;
    if (!allowed) {
      const { data: access } = await admin.from("user_account_access")
        .select("is_account_admin, sub_company_id")
        .eq("user_id", callerId).eq("owner_id", conn.owner_id);
      allowed = !!access?.some((a: any) =>
        a.is_account_admin && (a.sub_company_id === null || a.sub_company_id === conn.sub_company_id));
    }
    if (!allowed) {
      const { data: roles } = await admin.from("user_roles")
        .select("role").eq("user_id", callerId).eq("role", "admin");
      if (!roles?.length) return json({ ok: false, error: "forbidden" }, 403);
    }

    const meta = (conn.metadata ?? {}) as any;
    const base = normalizeUrl(meta.url);
    const token = String(meta.token ?? "");
    const sess = String(meta.session ?? "default").trim();
    const checks: Check[] = [];

    // ── Config presence ──
    if (!base || !token) {
      checks.push({
        key: "config", label: "Credenciais WAHA",
        severity: "error",
        detail: "URL ou API Key não configurados na conexão.",
        hint: "Abra 'Configurar' e preencha URL/token.",
      });
      return json({ ok: true, connection_id: connectionId, checks, summary: worstOf(checks) });
    }
    checks.push({ key: "config", label: "Credenciais WAHA", severity: "ok", detail: `${base} / sessão '${sess}'` });

    // ── Session status ──
    let sessionData: any = null;
    let engine: string | null = null;
    let sessionOk = false;
    try {
      const res = await fetch(`${base}/api/sessions/${encodeURIComponent(sess)}`, {
        headers: { "Content-Type": "application/json", "X-Api-Key": token },
      });
      const raw = await res.text();
      try { sessionData = raw ? JSON.parse(raw) : {}; } catch { sessionData = { raw }; }
      const statusStr = String(sessionData?.status ?? "").toUpperCase();
      engine = sessionData?.engine?.engine ?? sessionData?.engine ?? null;
      sessionOk = statusStr === "WORKING";
      checks.push({
        key: "session", label: "Sessão WAHA",
        severity: sessionOk ? "ok" : (statusStr === "SCAN_QR_CODE" ? "warn" : "error"),
        detail: `status=${statusStr || "desconhecido"}${engine ? ` · engine=${engine}` : ""}`,
        hint: sessionOk ? undefined :
          statusStr === "SCAN_QR_CODE" ? "Escaneie o QR Code no dispositivo." :
          statusStr === "STOPPED" ? "Sessão parada — clique em Reiniciar." :
          "Verifique o servidor WAHA e reinicie a sessão.",
      });
    } catch (err) {
      checks.push({
        key: "session", label: "Sessão WAHA", severity: "error",
        detail: `Falha ao contatar WAHA: ${(err as Error).message}`,
        hint: "Verifique se o servidor WAHA está online e a URL está correta.",
      });
    }

    // ── Webhook configured on WAHA ──
    const target = expectedWebhookUrl(connectionId);
    const hooks: any[] = sessionData?.config?.webhooks ?? [];
    const hookMatch = Array.isArray(hooks) &&
      hooks.find((h) => String(h?.url ?? "").trim() === target);
    if (!hookMatch) {
      checks.push({
        key: "webhook", label: "Webhook waha-inbound",
        severity: "error",
        detail: `URL esperada não encontrada na sessão. Configuradas: ${hooks.length}`,
        hint: "Use 'Reconfigurar webhook' para reescrever automaticamente.",
      });
    } else {
      const events: string[] = hookMatch?.events ?? [];
      const missingEvents = ["message", "message.any", "message.ack", "session.status"]
        .filter((e) => !events.includes(e));
      checks.push({
        key: "webhook", label: "Webhook waha-inbound",
        severity: missingEvents.length ? "warn" : "ok",
        detail: missingEvents.length
          ? `Configurado, mas faltam eventos: ${missingEvents.join(", ")}`
          : `OK · ${events.length} eventos assinados`,
        hint: missingEvents.length ? "Reconfigurar webhook para incluir eventos faltantes." : undefined,
      });
    }

    // ── Last inbound message age ──
    const { data: lastIn } = await admin.from("chat_messages")
      .select("created_at").eq("connection_id", connectionId)
      .eq("sender_type", "client")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!lastIn) {
      checks.push({
        key: "inbound_flow", label: "Recebimento de mensagens",
        severity: "warn",
        detail: "Nenhuma mensagem recebida ainda por esta conexão.",
        hint: sessionOk ? "Envie uma mensagem de teste do celular para o número conectado." : undefined,
      });
    } else {
      const ageMin = Math.floor((Date.now() - new Date(lastIn.created_at).getTime()) / 60000);
      checks.push({
        key: "inbound_flow", label: "Recebimento de mensagens",
        severity: ageMin > 60 * 24 ? "warn" : "ok",
        detail: ageMin < 1 ? "Última mensagem há menos de 1 minuto"
          : ageMin < 60 ? `Última mensagem há ${ageMin} min`
          : ageMin < 60 * 24 ? `Última mensagem há ${Math.round(ageMin / 60)} h`
          : `Última mensagem há ${Math.round(ageMin / 1440)} dias`,
      });
    }

    // ── Last outbound status (last hour) ──
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { data: recentOut } = await admin.from("chat_messages")
      .select("metadata, created_at").eq("connection_id", connectionId)
      .eq("sender_type", "agent").gte("created_at", oneHourAgo).limit(50);
    const outbound = recentOut ?? [];
    const failed = outbound.filter((m: any) => {
      const s = String(m?.metadata?.status ?? "").toLowerCase();
      return s === "failed" || s === "error";
    }).length;
    if (!outbound.length) {
      checks.push({
        key: "outbound_flow", label: "Envio de mensagens (1h)",
        severity: "ok", detail: "Sem envios recentes — nada a reportar.",
      });
    } else {
      const rate = failed / outbound.length;
      checks.push({
        key: "outbound_flow", label: "Envio de mensagens (1h)",
        severity: rate === 0 ? "ok" : rate < 0.2 ? "warn" : "error",
        detail: `${outbound.length} envios · ${failed} falharam (${Math.round(rate * 100)}%)`,
        hint: rate >= 0.2 ? "Reinicie a sessão e verifique o número conectado." : undefined,
      });
    }

    return json({
      ok: true,
      connection_id: connectionId,
      generated_at: new Date().toISOString(),
      display_name: conn.display_name,
      engine,
      session_status: sessionData?.status ?? null,
      checks,
      summary: worstOf(checks),
      expected_webhook_url: target,
    });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message ?? "unexpected" }, 500);
  }
});

function worstOf(checks: Check[]): Severity {
  if (checks.some((c) => c.severity === "error")) return "error";
  if (checks.some((c) => c.severity === "warn")) return "warn";
  return "ok";
}
