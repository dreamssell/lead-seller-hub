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
//   - "backfill_inbound": rebuild missing inbound chat_messages from stored webhook events
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

function expectedWebhookUrl(connectionId: string): string {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  return `${supabaseUrl}/functions/v1/waha-inbound?connection=${connectionId}`;
}

function sessionHasOurWebhook(sessionData: any, connectionId: string): boolean {
  const target = expectedWebhookUrl(connectionId);
  const hooks: any[] = sessionData?.config?.webhooks ?? [];
  return Array.isArray(hooks) && hooks.some((h) => String(h?.url ?? "").trim() === target);
}

// Same canonical dedup rule as waha-inbound: collapse `@c.us`/`@lid` variants
// of the same WhatsApp message id onto their shared HASH suffix so backfill
// jobs don't create duplicated chat_messages rows.
function canonicalMsgId(raw: string): string {
  const parts = raw.split('_');
  const tail = parts[parts.length - 1];
  if (parts.length >= 3 && /^[A-F0-9]{16,}$/i.test(tail)) return tail.toUpperCase();
  return raw;
}
function extractId(id: any): string | null {
  let raw: string | null = null;
  if (!id) return null;
  if (typeof id === "string") raw = id;
  else if (typeof id === "object" && typeof id._serialized === "string") raw = id._serialized;
  if (!raw) return null;
  return canonicalMsgId(raw);
}

function normalizePhone(from?: string | null): string | null {
  if (!from || typeof from !== "string") return null;
  if (from.endsWith("@g.us") || from.endsWith("@lid")) return null;
  const digits = from.replace(/\D/g, "");
  return digits || null;
}

function eventToInboundCandidate(eventRow: any) {
  const body = eventRow?.payload ?? {};
  const event = String(body?.event || eventRow?.metadata_json?.raw_event || "");
  const gowsData = body?.data ?? (body?.Info || body?.Message ? body : null);
  const webPayload = body?.payload ?? (body?._data ? body : {});
  const info = gowsData?.Info ?? gowsData?.Message?.Info ?? webPayload?._data?.Info ?? null;
  const msgWrap = gowsData?.Message ?? webPayload?._data?.Message ?? {};
  const providerMsgId =
    eventRow?.metadata_json?.provider_msg_id ||
    extractId(webPayload?.id) ||
    info?.ID ||
    gowsData?.Message?.ID ||
    gowsData?.ID ||
    null;
  const fromMeFlag =
    webPayload?.fromMe === true ||
    info?.IsFromMe === true ||
    webPayload?._data?.Info?.IsFromMe === true;
  const rawFrom: string | undefined =
    webPayload?.from ||
    info?.Chat ||
    info?.Sender ||
    webPayload?._data?.Info?.Chat;
  const senderAlt: string | undefined =
    info?.SenderAlt ||
    webPayload?._data?.Info?.SenderAlt;
  const isGroup = info?.IsGroup === true || (typeof rawFrom === "string" && rawFrom.endsWith("@g.us"));
  const rawFromIsLid = typeof rawFrom === "string" && rawFrom.includes("@lid");
  const phone = rawFromIsLid
    ? normalizePhone(senderAlt) || normalizePhone(rawFrom)
    : normalizePhone(rawFrom) || normalizePhone(senderAlt);
  const extractedBody =
    webPayload?.body ||
    msgWrap?.conversation ||
    msgWrap?.extendedTextMessage?.text ||
    msgWrap?.imageMessage?.caption ||
    msgWrap?.videoMessage?.caption ||
    msgWrap?.documentMessage?.caption ||
    "";
  const hasMedia =
    webPayload?.hasMedia === true ||
    !!msgWrap?.imageMessage ||
    !!msgWrap?.videoMessage ||
    !!msgWrap?.audioMessage ||
    !!msgWrap?.documentMessage;
  return {
    event,
    providerMsgId,
    rawFrom,
    senderAlt,
    senderLid: rawFromIsLid ? rawFrom : (typeof senderAlt === "string" && senderAlt.includes("@lid") ? senderAlt : null),
    phone,
    pushName: info?.PushName || webPayload?._data?.Info?.PushName || webPayload?.notifyName || null,
    content: extractedBody || (hasMedia ? "[mídia]" : ""),
    raw: gowsData ?? webPayload,
    valid: !fromMeFlag && !isGroup && !!phone && typeof rawFrom === "string" && !rawFrom.includes("status@broadcast"),
  };
}

// Rewrites the WAHA session config so `waha-inbound?connection=<id>` receives
// every relevant event. Stops the session, PUTs the new config, then starts.
// Returns { ok, status_code, raw } — never throws.
async function applyWebhookConfig(
  base: string, sess: string, token: string, connectionId: string,
): Promise<{ ok: boolean; status_code: number; raw: string }> {
  const headers = { "X-Api-Key": token, "Content-Type": "application/json" };
  const cfg = {
    webhooks: [
      {
        url: expectedWebhookUrl(connectionId),
        events: ["message", "message.any", "message.ack", "session.status"],
        hmac: null,
        retries: { policy: "linear", delaySeconds: 2, attempts: 3 },
        customHeaders: [{ name: "X-Api-Key", value: token }],
      },
    ],
  };
  await fetch(`${base}/api/sessions/${encodeURIComponent(sess)}/stop`, { method: "POST", headers })
    .catch(() => null);
  const putRes = await fetch(`${base}/api/sessions/${encodeURIComponent(sess)}`, {
    method: "PUT", headers, body: JSON.stringify({ name: sess, config: cfg }),
  });
  const raw = await putRes.text().catch(() => "");
  await fetch(`${base}/api/sessions/${encodeURIComponent(sess)}/start`, { method: "POST", headers })
    .catch(() => null);
  return { ok: putRes.ok, status_code: putRes.status, raw: raw.slice(0, 500) };
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
      | "list_remote" | "test_webhook" | "cleanup_scan" | "configure_webhook"
      | "validate_webhook" | "validate_all_webhooks" | "backfill_inbound"
      | "backfill_from_server" | "retry_failed" | "cancel_run" | "resume_run";
    // When true, `status` will auto-heal a missing/outdated webhook config
    // in the WAHA server without requiring a separate call. Defaults to true.
    const autoHeal: boolean = body?.auto_heal !== false;
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
          const canUseBackfill = action === "backfill_inbound" || action === "backfill_from_server";
          hasAccess = !!access?.some((a: any) =>
            (canUseBackfill || a.is_account_admin)
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

    // ─── backfill_inbound ──────────────────────────────────────────────────
    // Replays recent WAHA webhook logs already stored in connection_events into
    // customers + chat_messages. Uses provider_msg_id/uaz_msg_id for idempotency
    // and preserves webhook timestamps so refresh/realtime gaps do not hide chat.
    if (action === "backfill_inbound") {
      if (!conn?.id) return json({ ok: false, error: "connection_required" }, 400);
      const limit = Math.max(1, Math.min(500, Number(body?.limit ?? 100)));
      const { data: events, error: evErr } = await supabaseAdmin
        .from("connection_events")
        .select("id, created_at, event_type, status, payload, metadata_json")
        .eq("connection_id", conn.id)
        .like("event_type", "waha.%")
        .order("created_at", { ascending: true })
        .limit(limit);
      if (evErr) return json({ ok: false, error: "events_read_failed", detail: evErr.message }, 500);

      let considered = 0;
      let inserted = 0;
      let skipped = 0;
      const samples: any[] = [];
      for (const ev of events ?? []) {
        const bucket = ev?.metadata_json?.bucket;
        if (bucket !== "message") { skipped++; continue; }
        const c = eventToInboundCandidate(ev);
        considered++;
        if (!c.valid || !c.providerMsgId || !c.content) {
          skipped++;
          continue;
        }
        // Dedup key is (owner_id, uaz_msg_id) so that reusing the same WhatsApp
        // provider id across different owners cannot accidentally hide legit
        // messages, and repeated backfills stay idempotent per tenant.
        const { data: existingMsg } = await supabaseAdmin
          .from("chat_messages")
          .select("id, customers!inner(owner_id)")
          .eq("uaz_msg_id", c.providerMsgId)
          .eq("customers.owner_id", conn.owner_id)
          .maybeSingle();
        if (existingMsg) { skipped++; continue; }

        const { data: existingCustomer } = await supabaseAdmin
          .from("customers")
          .select("id, name")
          .eq("phone", c.phone)
          .eq("owner_id", conn.owner_id)
          .maybeSingle();
        let customerId = existingCustomer?.id ?? null;
        if (!customerId) {
          const { data: created, error: createErr } = await supabaseAdmin
            .from("customers")
            .insert({
              name: c.pushName || c.phone,
              phone: c.phone,
              channel: "whatsapp",
              created_by: conn.owner_id,
              owner_id: conn.owner_id,
              sub_company_id: conn.sub_company_id,
              origin_connection_id: conn.id,
              created_at: ev.created_at,
              updated_at: ev.created_at,
            })
            .select("id")
            .single();
          if (createErr) { skipped++; samples.push({ event_id: ev.id, error: createErr.message }); continue; }
          customerId = created.id;
        }

        const { error: msgErr } = await supabaseAdmin.from("chat_messages").insert({
          customer_id: customerId,
          sender_type: "client",
          channel: "whatsapp",
          content: c.content,
          connection_id: conn.id,
          sub_company_id: conn.sub_company_id,
          uaz_msg_id: c.providerMsgId,
          created_at: ev.created_at,
          metadata: {
            provider: "waha",
            source: "waha-session.backfill_inbound",
            event_id: ev.id,
            raw_event: c.event,
            push_name: c.pushName,
            sender_jid: c.rawFrom,
            sender_alt: c.senderAlt,
            sender_lid: c.senderLid,
            owner_id: conn.owner_id,
            webhook_created_at: ev.created_at,
            raw: c.raw,
          },
        });
        if (msgErr?.code === "23505") { skipped++; continue; }
        if (msgErr) { skipped++; samples.push({ event_id: ev.id, error: msgErr.message }); continue; }
        inserted++;
        if (samples.length < 5) samples.push({ event_id: ev.id, message_id: c.providerMsgId, phone: c.phone, sender_lid: c.senderLid });
      }

      await logEvent("backfill_inbound", "success", { considered, inserted, skipped, samples });
      return json({ ok: true, action, connection_id: conn.id, owner_id: conn.owner_id, considered, inserted, skipped, samples });
    }

    const base = normalizeUrl(url);
    const sess = (session || "default").trim();

    // ─── backfill_from_server ──────────────────────────────────────────────
    // Pulls chats + messages directly from the WAHA HTTP API and imports any
    // messages missing locally. This is what recovers threads that show
    // "Sem mensagens ainda" when the webhook missed delivery. Idempotent by
    // uaz_msg_id + (owner_id, phone), so it can be re-run safely and never
    // affects UAZ / Evolution / Wavoip data or the live inbound path.
    // ─── cancel_run ────────────────────────────────────────────────────────
    // Flags a running import so the backfill loop stops on its next check and
    // marks the run as 'cancelled'. RLS on waha_import_runs already restricts
    // this to owner / account admin / platform admin.
    if (action === "cancel_run") {
      const runId = String(body?.run_id ?? "").trim();
      if (!runId) return json({ ok: false, error: "run_id_required" }, 400);
      const { data: runRow } = await supabaseAdmin
        .from("waha_import_runs")
        .select("id, owner_id, status")
        .eq("id", runId)
        .maybeSingle();
      if (!runRow) return json({ ok: false, error: "run_not_found" }, 404);
      if (callerId && runRow.owner_id !== callerId) {
        const { data: access } = await supabaseAdmin
          .from("user_account_access")
          .select("is_account_admin")
          .eq("user_id", callerId)
          .eq("owner_id", runRow.owner_id);
        const isAcctAdmin = !!access?.some((a: any) => a.is_account_admin);
        if (!isAcctAdmin) {
          const { data: roles } = await supabaseAdmin
            .from("user_roles").select("role").eq("user_id", callerId).eq("role", "admin");
          if (!roles?.length) return json({ ok: false, error: "forbidden" });
        }
      }
      if (runRow.status !== "running") {
        return json({ ok: true, already: true, status: runRow.status });
      }
      await supabaseAdmin.from("waha_import_runs")
        .update({ status: "cancel_requested" }).eq("id", runId);
      await logEvent("cancel_run", "requested", { run_id: runId });
      return json({ ok: true, run_id: runId, status: "cancel_requested" });
    }

    if (action === "backfill_from_server" || action === "retry_failed" || action === "resume_run") {
      if (!conn?.id) return json({ ok: false, error: "connection_required" }, 400);
      if (!base || !token || !sess) return json({ ok: false, error: "waha_credentials_missing" }, 400);

      const dryRun: boolean = body?.dry_run === true;
      const chatLimit = Math.max(1, Math.min(500, Number(body?.chat_limit ?? 200)));
      const msgLimit = Math.max(1, Math.min(500, Number(body?.msg_limit ?? 100)));
      const onlyChatId: string | null = typeof body?.chat_id === "string" ? body.chat_id : null;
      // Auto-retry ceiling for a single job (used both by resume-on-timeout and
      // by chat-level HTTP retry). Prevents runaway self-invocation loops.
      const maxAutoRetries: number = Math.max(0, Math.min(20, Number(body?.max_auto_retries ?? 8)));

      const wahaHeaders = { "Content-Type": "application/json", "X-Api-Key": token } as Record<string, string>;

      // Resolve or create the run row. `resume_run` reuses the existing run
      // (keeping the run id + accumulated counters); the other two actions
      // insert a fresh run and copy over their input params.
      let runId: string;
      let runParams: Record<string, unknown> = {};
      let processedChatIds = new Set<string>();
      let autoRetryCount = 0;
      let chats: any[] = [];
      let retrySourceRunId: string | null = null;
      let resumedCounters = {
        chatsSeen: 0, considered: 0, inserted: 0, skipped: 0, customersCreated: 0,
        failedItems: [] as any[],
      };

      if (action === "resume_run") {
        const requestedRunId = String(body?.run_id ?? "").trim();
        if (!requestedRunId) return json({ ok: false, error: "run_id_required" }, 400);
        const { data: existing } = await supabaseAdmin
          .from("waha_import_runs")
          .select("id, owner_id, connection_id, params, status, chats_processed, messages_considered, messages_inserted, messages_skipped, customers_created, failed_items")
          .eq("id", requestedRunId)
          .maybeSingle();
        if (!existing || existing.connection_id !== conn.id) {
          return json({ ok: false, error: "run_not_found" }, 404);
        }
        runId = existing.id;
        runParams = (existing.params as any) ?? {};
        const savedIds: string[] = Array.isArray((runParams as any).processed_chat_ids)
          ? (runParams as any).processed_chat_ids as string[] : [];
        processedChatIds = new Set(savedIds);
        autoRetryCount = Number((runParams as any).auto_retry_count ?? 0);
        resumedCounters = {
          chatsSeen: existing.chats_processed ?? 0,
          considered: existing.messages_considered ?? 0,
          inserted: existing.messages_inserted ?? 0,
          skipped: existing.messages_skipped ?? 0,
          customersCreated: existing.customers_created ?? 0,
          failedItems: Array.isArray(existing.failed_items) ? existing.failed_items as any[] : [],
        };
        retrySourceRunId = (runParams as any).retry_of ?? null;
        // Rebuild the chat list from the original source so we can honour the
        // "skip already processed" semantics. Same fallback order as the
        // initial run — either the retry source's failed items or the WAHA
        // /chats overview endpoint.
        if ((runParams as any).action === "retry_failed" && retrySourceRunId) {
          const { data: srcRun } = await supabaseAdmin
            .from("waha_import_runs").select("failed_items")
            .eq("id", retrySourceRunId).maybeSingle();
          const failed: any[] = Array.isArray(srcRun?.failed_items) ? srcRun!.failed_items as any[] : [];
          const uniqueChatIds = Array.from(new Set(failed.map((f) => f?.chat_id).filter(Boolean)));
          chats = uniqueChatIds.map((cid) => ({ id: cid }));
        } else {
          for (const path of [`/api/${encodeURIComponent(sess)}/chats/overview?limit=${chatLimit}`, `/api/${encodeURIComponent(sess)}/chats?limit=${chatLimit}`]) {
            try {
              const r = await fetch(`${base}${path}`, { headers: wahaHeaders });
              if (!r.ok) continue;
              const arr = await r.json().catch(() => []);
              if (Array.isArray(arr) && arr.length) { chats = arr; break; }
            } catch (_) { /* try next */ }
          }
        }
        // Flip back to running so the client's polling stops showing "failed".
        await supabaseAdmin.from("waha_import_runs").update({
          status: "running",
          error_message: null,
          finished_at: null,
          params: { ...runParams, auto_retry_count: autoRetryCount, resumed_at: new Date().toISOString() },
        }).eq("id", runId);
      } else {
        // Fresh run (backfill_from_server or retry_failed).
        if (action === "retry_failed") {
          retrySourceRunId = String(body?.run_id ?? "").trim() || null;
          if (!retrySourceRunId) return json({ ok: false, error: "run_id_required" }, 400);
          const { data: srcRun } = await supabaseAdmin
            .from("waha_import_runs")
            .select("id, owner_id, connection_id, failed_items")
            .eq("id", retrySourceRunId).maybeSingle();
          if (!srcRun || srcRun.connection_id !== conn.id) {
            return json({ ok: false, error: "run_not_found" }, 404);
          }
          const failed: any[] = Array.isArray(srcRun.failed_items) ? srcRun.failed_items as any[] : [];
          // Optional filter: only retry items matching a given stage/reason.
          const stageFilter: string | null = typeof body?.only_stage === "string" ? body.only_stage : null;
          const reasonFilter: string | null = typeof body?.only_reason === "string" ? body.only_reason : null;
          const filtered = failed.filter((f) =>
            (stageFilter ? f?.stage === stageFilter : true) &&
            (reasonFilter ? f?.reason === reasonFilter : true)
          );
          const uniqueChatIds = Array.from(new Set(filtered.map((f) => f?.chat_id).filter(Boolean)));
          chats = uniqueChatIds.map((cid) => ({ id: cid }));
          if (!chats.length) return json({ ok: false, error: "no_failed_items_to_retry" }, 400);
        } else if (onlyChatId) {
          chats = [{ id: onlyChatId }];
        } else {
          for (const path of [`/api/${encodeURIComponent(sess)}/chats/overview?limit=${chatLimit}`, `/api/${encodeURIComponent(sess)}/chats?limit=${chatLimit}`]) {
            try {
              const r = await fetch(`${base}${path}`, { headers: wahaHeaders });
              if (!r.ok) continue;
              const arr = await r.json().catch(() => []);
              if (Array.isArray(arr) && arr.length) { chats = arr; break; }
            } catch (_) { /* try next */ }
          }
        }

        runParams = {
          action, chat_limit: chatLimit, msg_limit: msgLimit,
          retry_of: retrySourceRunId, dry_run: dryRun,
          processed_chat_ids: [] as string[], auto_retry_count: 0,
        };
        const { data: runRow, error: runErr } = await supabaseAdmin
          .from("waha_import_runs")
          .insert({
            connection_id: conn.id, owner_id: conn.owner_id,
            triggered_by: callerId, status: "running",
            chats_total: chats.length, params: runParams,
          })
          .select("id").single();
        if (runErr || !runRow) return json({ ok: false, error: runErr?.message ?? "run_create_failed" }, 500);
        runId = runRow.id;
      }

      // Counters that survive resume by seeding from what the DB already had.
      let chatsSeen = resumedCounters.chatsSeen;
      let considered = resumedCounters.considered;
      let inserted = resumedCounters.inserted;
      let skipped = resumedCounters.skipped;
      let customersCreated = resumedCounters.customersCreated;
      const failedItems: any[] = resumedCounters.failedItems.slice();
      const wouldCreatePhones = new Set<string>();
      let lastProgressUpdate = 0;
      let cancelRequested = false;
      let lastCancelCheck = 0;
      const jobStart = Date.now();
      // Leave a comfortable margin below the platform's per-invocation limit
      // (~150s CPU + wall-clock). Persist state + hand off to `resume_run` a
      // little before we hit that ceiling so no chat is lost.
      const timeBudgetMs = 90_000;
      const capturedRunId = runId;
      const capturedConnId = conn.id;
      const capturedOwnerId = conn.owner_id;

      const checkCancel = async (force = false): Promise<boolean> => {
        const now = Date.now();
        if (!force && now - lastCancelCheck < 1500) return cancelRequested;
        lastCancelCheck = now;
        const { data } = await supabaseAdmin
          .from("waha_import_runs").select("status").eq("id", capturedRunId).maybeSingle();
        if (data?.status === "cancel_requested") cancelRequested = true;
        return cancelRequested;
      };

      const persistProcessedIds = async () => {
        await supabaseAdmin.from("waha_import_runs").update({
          params: { ...runParams, processed_chat_ids: Array.from(processedChatIds), auto_retry_count: autoRetryCount },
        }).eq("id", capturedRunId);
      };

      const updateProgress = async (force = false, currentLabel?: string | null) => {
        const now = Date.now();
        if (!force && now - lastProgressUpdate < 1200) return;
        lastProgressUpdate = now;
        await supabaseAdmin.from("waha_import_runs").update({
          chats_processed: chatsSeen,
          current_chat_label: currentLabel ?? undefined,
          messages_considered: considered,
          messages_inserted: inserted,
          messages_skipped: skipped,
          customers_created: customersCreated,
          failed_items: failedItems.slice(0, 500),
        }).eq("id", capturedRunId);
      };

      const scheduleResume = async (): Promise<void> => {
        // Persist everything the resume needs, then trigger a fresh invocation
        // of ourselves. Uses SERVICE_ROLE to bypass verify_jwt/ownership since
        // this is an internal handoff, not a user-initiated request.
        await persistProcessedIds();
        await updateProgress(true, null);
        autoRetryCount++;
        await supabaseAdmin.from("waha_import_runs").update({
          params: { ...runParams, processed_chat_ids: Array.from(processedChatIds), auto_retry_count: autoRetryCount, resumed_at: new Date().toISOString() },
        }).eq("id", capturedRunId);
        if (autoRetryCount > maxAutoRetries) {
          await supabaseAdmin.from("waha_import_runs").update({
            status: "failed",
            error_message: `Excedeu o número máximo de continuações automáticas (${maxAutoRetries}). Use "Retomar" para continuar manualmente.`,
            finished_at: new Date().toISOString(),
          }).eq("id", capturedRunId);
          return;
        }
        const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        try {
          await fetch(`${supabaseUrl}/functions/v1/waha-session`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceKey}`,
              "apikey": serviceKey,
            },
            body: JSON.stringify({
              action: "resume_run",
              connection_id: capturedConnId,
              run_id: capturedRunId,
              max_auto_retries: maxAutoRetries,
              // Creds are re-resolved from connection metadata on the other side,
              // but we still forward them to short-circuit the DB lookup.
              url, token, session: sess,
              chat_limit: chatLimit, msg_limit: msgLimit,
            }),
          });
        } catch (e) {
          await supabaseAdmin.from("waha_import_runs").update({
            status: "failed",
            error_message: `Falha ao agendar continuação automática: ${(e as any)?.message ?? String(e)}`,
            finished_at: new Date().toISOString(),
          }).eq("id", capturedRunId);
        }
      };

      // The actual loop runs in the background so we can return 202 to the
      // client immediately. If the platform kills this invocation before we
      // finish, `scheduleResume` has already handed the work off, so no
      // progress is lost. Dedup on chat_messages(uaz_msg_id, owner_id) keeps
      // resumed runs from double-inserting.
      const runJob = async () => {
        try {
          for (const chat of chats) {
            if (await checkCancel()) break;
            if (Date.now() - jobStart > timeBudgetMs) {
              // Time budget hit — schedule continuation and stop THIS iteration
              // without marking the run as completed.
              await scheduleResume();
              return;
            }

            const chatIdRaw: string | undefined =
              (typeof chat?.id === "string" ? chat.id : chat?.id?._serialized) ||
              chat?.chatId || chat?.remoteJid;

            if (chatIdRaw && processedChatIds.has(chatIdRaw)) continue;

            const chatLabel = (typeof chat?.name === "string" && chat.name) || chatIdRaw || "—";
            await updateProgress(false, chatLabel);

            if (!chatIdRaw) {
              chatsSeen++;
              failedItems.push({ chat_id: null, stage: "chat_id_missing", reason: "Chat sem ID válido", at: new Date().toISOString() });
              continue;
            }
            if (chatIdRaw.endsWith("@g.us") || chatIdRaw.endsWith("@broadcast") || chatIdRaw.endsWith("@lid")) {
              chatsSeen++; skipped++;
              processedChatIds.add(chatIdRaw);
              continue;
            }
            const phone = normalizePhone(chatIdRaw);
            if (!phone) {
              chatsSeen++;
              processedChatIds.add(chatIdRaw);
              failedItems.push({ chat_id: chatIdRaw, stage: "phone_normalize", reason: "Não foi possível extrair telefone", at: new Date().toISOString() });
              continue;
            }

            // Upsert customer.
            let customerId: string | null = null;
            {
              const { data: existing } = await supabaseAdmin
                .from("customers").select("id")
                .eq("phone", phone).eq("owner_id", capturedOwnerId).maybeSingle();
              if (existing?.id) {
                customerId = existing.id;
              } else if (dryRun) {
                if (!wouldCreatePhones.has(phone)) {
                  wouldCreatePhones.add(phone);
                  customersCreated++;
                }
                customerId = "dry-run";
              } else {
                const displayName = (typeof chat?.name === "string" && chat.name.trim())
                  || (typeof chat?.pushname === "string" && chat.pushname.trim())
                  || phone;
                const { data: created, error: cErr } = await supabaseAdmin
                  .from("customers")
                  .upsert({
                    name: displayName, phone, channel: "whatsapp",
                    created_by: capturedOwnerId, owner_id: capturedOwnerId,
                    sub_company_id: conn.sub_company_id, origin_connection_id: capturedConnId,
                  }, { onConflict: "owner_id,phone", ignoreDuplicates: false })
                  .select("id").single();
                if (cErr || !created?.id) {
                  const { data: raced } = await supabaseAdmin
                    .from("customers").select("id").eq("phone", phone).eq("owner_id", capturedOwnerId).maybeSingle();
                  if (!raced?.id) {
                    chatsSeen++;
                    processedChatIds.add(chatIdRaw);
                    failedItems.push({ chat_id: chatIdRaw, phone, stage: "customer_upsert", reason: cErr?.message ?? "Falha ao criar contato", at: new Date().toISOString() });
                    continue;
                  }
                  customerId = raced.id;
                } else {
                  customerId = created.id;
                  customersCreated++;
                }
              }
            }

            // Fetch messages with per-chat auto-retry (2 extra attempts + light
            // backoff) so transient WAHA blips don't fill failed_items.
            let messages: any[] = [];
            let fetchError: string | null = null;
            attempts: for (let attempt = 0; attempt < 3; attempt++) {
              if (attempt > 0) await new Promise((r) => setTimeout(r, 400 * attempt));
              for (const path of [
                `/api/${encodeURIComponent(sess)}/chats/${encodeURIComponent(chatIdRaw)}/messages?limit=${msgLimit}&downloadMedia=false`,
                `/api/${encodeURIComponent(sess)}/${encodeURIComponent(chatIdRaw)}/messages?limit=${msgLimit}`,
              ]) {
                try {
                  const r = await fetch(`${base}${path}`, { headers: wahaHeaders });
                  if (!r.ok) { fetchError = `HTTP ${r.status} em ${path}`; continue; }
                  const arr = await r.json().catch(() => []);
                  if (Array.isArray(arr)) { messages = arr; fetchError = null; break attempts; }
                } catch (e) { fetchError = (e as any)?.message ?? String(e); }
              }
            }
            if (fetchError && !messages.length) {
              chatsSeen++;
              processedChatIds.add(chatIdRaw);
              failedItems.push({ chat_id: chatIdRaw, phone, stage: "waha_fetch_messages", reason: fetchError, at: new Date().toISOString() });
              continue;
            }

            for (const m of messages) {
              considered++;
              const providerMsgId = extractId(m?.id) || (typeof m?.id === "string" ? m.id : null);
              if (!providerMsgId) { skipped++; continue; }
              const fromMe = m?.fromMe === true || m?.key?.fromMe === true;
              const bodyText: string =
                m?.body || m?.text || m?.caption ||
                m?._data?.body || m?.message?.conversation ||
                m?.message?.extendedTextMessage?.text || "";
              const hasMedia = m?.hasMedia === true || !!m?.mediaUrl || !!m?.message?.imageMessage || !!m?.message?.videoMessage || !!m?.message?.audioMessage || !!m?.message?.documentMessage;
              const content = bodyText || (hasMedia ? "[mídia]" : "");
              if (!content) { skipped++; continue; }

              const tsSec = Number(m?.timestamp || m?.t || m?.messageTimestamp || 0);
              const createdAt = tsSec > 0
                ? new Date(tsSec > 1e12 ? tsSec : tsSec * 1000).toISOString()
                : new Date().toISOString();

              // Idempotency check keyed on (uaz_msg_id, owner_id) — same key
              // used by the live inbound path, so resumed jobs never
              // double-insert regardless of how many times the loop restarts.
              const { data: dup } = await supabaseAdmin
                .from("chat_messages")
                .select("id, customers!inner(owner_id)")
                .eq("uaz_msg_id", providerMsgId)
                .eq("customers.owner_id", capturedOwnerId)
                .maybeSingle();
              if (dup) { skipped++; continue; }

              if (dryRun) { inserted++; continue; }

              const { error: msgErr } = await supabaseAdmin.from("chat_messages").insert({
                customer_id: customerId,
                sender_type: fromMe ? "agent" : "client",
                channel: "whatsapp",
                content,
                connection_id: capturedConnId,
                sub_company_id: conn.sub_company_id,
                uaz_msg_id: providerMsgId,
                created_at: createdAt,
                metadata: {
                  provider: "waha", source: "waha-session.backfill_from_server",
                  from_me: fromMe, direction: fromMe ? "outbound_native" : "inbound",
                  external_device: fromMe === true, chat_id: chatIdRaw,
                  owner_id: capturedOwnerId, waha_timestamp: tsSec || null, raw: m,
                  run_id: capturedRunId,
                },
              });
              if (msgErr?.code === "23505") { skipped++; continue; }
              if (msgErr) {
                skipped++;
                failedItems.push({ chat_id: chatIdRaw, phone, provider_msg_id: providerMsgId, stage: "message_insert", reason: msgErr.message, at: new Date().toISOString() });
                continue;
              }
              inserted++;
            }
            chatsSeen++;
            processedChatIds.add(chatIdRaw);
            await updateProgress(false, chatLabel);
          }

          const finalStatus = cancelRequested
            ? "cancelled"
            : (dryRun ? "completed_dry_run" : "completed");

          await supabaseAdmin.from("waha_import_runs").update({
            status: finalStatus,
            chats_processed: chatsSeen,
            current_chat_label: null,
            messages_considered: considered,
            messages_inserted: inserted,
            messages_skipped: skipped,
            customers_created: customersCreated,
            failed_items: failedItems.slice(0, 500),
            finished_at: new Date().toISOString(),
            params: { ...runParams, processed_chat_ids: Array.from(processedChatIds), auto_retry_count: autoRetryCount },
          }).eq("id", capturedRunId);

          await logEvent(action, cancelRequested ? "cancelled" : "success", {
            run_id: capturedRunId, dry_run: dryRun, chatsSeen, considered, inserted, skipped, customersCreated, failed_count: failedItems.length,
          });
        } catch (e: any) {
          await supabaseAdmin.from("waha_import_runs").update({
            status: "failed",
            error_message: e?.message ?? String(e),
            chats_processed: chatsSeen,
            messages_considered: considered,
            messages_inserted: inserted,
            messages_skipped: skipped,
            customers_created: customersCreated,
            failed_items: failedItems.slice(0, 500),
            finished_at: new Date().toISOString(),
            params: { ...runParams, processed_chat_ids: Array.from(processedChatIds), auto_retry_count: autoRetryCount },
          }).eq("id", capturedRunId);
          await logEvent(action, "error", { run_id: capturedRunId, error: e?.message ?? String(e) });
        }
      };

      // Deno Edge Runtime keeps the invocation alive until this promise
      // resolves, even after the HTTP response is sent. That's what lets us
      // return 202 immediately without killing the background loop.
      // deno-lint-ignore no-explicit-any
      const runtime: any = (globalThis as any).EdgeRuntime;
      if (runtime?.waitUntil) {
        runtime.waitUntil(runJob());
      } else {
        // Fallback for local dev without EdgeRuntime — run inline.
        await runJob();
      }

      return json({
        ok: true, action, run_id: runId, connection_id: conn.id, owner_id: conn.owner_id,
        dry_run: dryRun, status: "running", accepted: true,
      }, 202);
    }




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

      // Persist config even if remote already had the session (422). This lets
      // the platform "adopt" a pre-existing WAHA session without recreating it.
      if ((res.ok || res.status === 422 || res.status === 409) && conn) {
        await supabaseAdmin.from("whatsapp_connections").update({
          metadata: { ...(conn.metadata ?? {}), url: base, token, session: sess },
          status: "connecting",
        }).eq("id", conn.id);
      }
      await logEvent("create", res.ok ? "success" : "failed", { status_code: res.status, session: sess });
      return json({ ok: res.ok, status_code: res.status, session: sess, raw: data });
    }

    // ─── configure_webhook ─────────────────────────────────────────────────
    // Force-writes the webhook config for this connection's WAHA session.
    if (action === "configure_webhook") {
      if (!connectionId) return json({ ok: false, error: "connection_id_required" }, 400);
      const r = await applyWebhookConfig(base, sess, token, connectionId);
      await logEvent("configure_webhook", r.ok ? "success" : "failed", {
        status_code: r.status_code, webhook_url: expectedWebhookUrl(connectionId),
      });
      return json({ ok: r.ok, status_code: r.status_code, webhook_url: expectedWebhookUrl(connectionId), raw: r.raw });
    }

    // ─── validate_webhook ──────────────────────────────────────────────────
    // Checks the remote WAHA session config. If the expected webhook is
    // missing/mismatched, reprograms it automatically (unless dry_run=true).
    if (action === "validate_webhook") {
      if (!connectionId) return json({ ok: false, error: "connection_id_required" }, 400);
      const st = await fetchStatus(base, sess, token);
      const expected = expectedWebhookUrl(connectionId);
      const hooks: any[] = st.data?.config?.webhooks ?? [];
      const valid = sessionHasOurWebhook(st.data, connectionId);
      let repaired = false;
      let repair: any = null;
      if (!valid && body?.dry_run !== true) {
        repair = await applyWebhookConfig(base, sess, token, connectionId);
        repaired = repair.ok;
        await logEvent("validate_webhook", repaired ? "auto_repaired" : "repair_failed", {
          expected, current: hooks.map((h) => h?.url), status_code: repair.status_code,
        });
      } else {
        await logEvent("validate_webhook", valid ? "ok" : "mismatch_dry_run", {
          expected, current: hooks.map((h) => h?.url),
        });
      }
      return json({
        ok: true, valid, repaired, expected_webhook: expected,
        current_webhooks: hooks.map((h) => ({ url: h?.url, events: h?.events })),
        repair,
      });
    }

    // ─── validate_all_webhooks ─────────────────────────────────────────────
    // Sweeps every WAHA connection the caller can see and validates/repairs
    // each session's webhook. Designed to be called from cron or on demand.
    if (action === "validate_all_webhooks") {
      const { data: allRows } = await supabaseAdmin
        .from("whatsapp_connections")
        .select("id, display_name, status, metadata, owner_id, sub_company_id")
        .eq("provider", "waha");

      let scope = allRows ?? [];
      if (callerId) {
        const { data: roles } = await supabaseAdmin
          .from("user_roles").select("role").eq("user_id", callerId).eq("role", "admin");
        if (!roles?.length) {
          const { data: access } = await supabaseAdmin
            .from("user_account_access")
            .select("owner_id, sub_company_id, is_account_admin")
            .eq("user_id", callerId);
          scope = scope.filter((c: any) =>
            c.owner_id === callerId
            || (access ?? []).some((a: any) =>
              a.is_account_admin && a.owner_id === c.owner_id
              && (a.sub_company_id === null || a.sub_company_id === c.sub_company_id)
            )
          );
        }
      }

      const dryRun = body?.dry_run === true;
      const results: any[] = [];
      for (const c of scope) {
        const cUrl = normalizeUrl(c.metadata?.url);
        const cTok = c.metadata?.token;
        const cSess = (c.metadata?.session || "default").trim();
        if (!cUrl || !cTok) {
          results.push({ id: c.id, display_name: c.display_name, skipped: "missing_url_or_token" });
          continue;
        }
        const st = await fetchStatus(cUrl, cSess, cTok);
        const valid = sessionHasOurWebhook(st.data, c.id);
        let repaired = false;
        if (!valid && !dryRun) {
          const r = await applyWebhookConfig(cUrl, cSess, cTok, c.id);
          repaired = r.ok;
          await supabaseAdmin.from("connection_events").insert({
            connection_id: c.id,
            event_type: "waha.action.validate_webhook",
            status: repaired ? "auto_repaired" : "repair_failed",
            payload: { expected: expectedWebhookUrl(c.id), status_code: r.status_code } as any,
            metadata_json: { source: "waha-session.validate_all", actor: callerId },
          }).catch(() => null);
        }
        results.push({ id: c.id, display_name: c.display_name, valid, repaired });
      }
      return json({ ok: true, dry_run: dryRun, checked: results.length, results });
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
    // We reapply the webhook config as part of restart. WAHA occasionally
    // drops the webhook subscription when a session is stopped/started, which
    // silently breaks inbound message delivery (session shows "connected" on
    // the server, but our waha-inbound never fires). Piggy-backing on
    // applyWebhookConfig guarantees the webhook is programmed on every
    // restart, then we validate after startup and auto-heal if it drifted.
    if (action === "restart") {
      let restartResult: { ok: boolean; status_code: number; raw: string };
      if (connectionId) {
        restartResult = await applyWebhookConfig(base, sess, token, connectionId);
      } else {
        await fetch(`${base}/api/sessions/${encodeURIComponent(sess)}/stop`, {
          method: "POST", headers,
        }).catch(() => null);
        const startRes = await fetch(`${base}/api/sessions/${encodeURIComponent(sess)}/start`, {
          method: "POST", headers,
        });
        const raw = await startRes.text().catch(() => "");
        restartResult = { ok: startRes.ok, status_code: startRes.status, raw };
      }

      // Give WAHA a moment to boot, then confirm the webhook is registered.
      // If not, force a second apply. Never blocks the response for long.
      let webhookValidated: boolean | null = null;
      let webhookRepaired = false;
      if (connectionId) {
        await new Promise((r) => setTimeout(r, 1500));
        const st2 = await fetchStatus(base, sess, token);
        webhookValidated = sessionHasOurWebhook(st2.data, connectionId);
        if (!webhookValidated) {
          const repair = await applyWebhookConfig(base, sess, token, connectionId);
          webhookRepaired = repair.ok;
        }
      }

      await logEvent("restart", restartResult.ok ? "success" : "failed", {
        status_code: restartResult.status_code,
        webhook_validated: webhookValidated,
        webhook_repaired: webhookRepaired,
      });
      return json({
        ok: restartResult.ok, action: "restart",
        status_code: restartResult.status_code,
        webhook_validated: webhookValidated,
        webhook_repaired: webhookRepaired,
        raw: restartResult.raw,
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

    // Auto-heal: if this is a status probe on a connected session and the
    // remote WAHA config no longer points at our waha-inbound, silently
    // reprogram it. Skipped when the session is not yet running (webhook
    // updates require a running/stopped-then-started session).
    let webhookHealed = false;
    let webhookValid: boolean | null = null;
    if (
      connectionId && autoHeal && action !== "qr"
      && /working|connected|open|running|starting/i.test(rawStatus)
    ) {
      webhookValid = sessionHasOurWebhook(st.data, connectionId);
      if (!webhookValid) {
        const r = await applyWebhookConfig(base, sess, token, connectionId);
        webhookHealed = r.ok;
        await logEvent("auto_heal_webhook", r.ok ? "auto_repaired" : "repair_failed", {
          expected: expectedWebhookUrl(connectionId), status_code: r.status_code,
        });
      }
    }

    return json({
      ok: true, action, status: rawStatus,
      connected: /working|connected|open|running/i.test(rawStatus),
      phone: st.data?.me?.id ?? null,
      qr: qrDataUrl, qr_error: qrError,
      webhook_valid: webhookValid, webhook_healed: webhookHealed,
    });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message });
  }
});
