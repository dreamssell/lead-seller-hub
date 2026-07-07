// Scheduled backfill: garante que titulares de Empresas/Sub-empresas fiquem com
// role_label = "CEO" e que perfis sem cargo definido recebam um rótulo padrão
// consistente. Idempotente: só toca linhas que estão fora do padrão.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GENERIC_LABELS = [
  "Administrador da sub-empresa",
  "Administrador",
  "Atendente",
  "Usuário da sub-empresa",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service);

  const startedAt = new Date().toISOString();
  const summary = { titulares_ceo: 0, generic_cleared: 0, empty_defaulted: 0, errors: [] as string[] };
  let triggered_by = "cron";
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    if (typeof body?.triggered_by === "string") triggered_by = body.triggered_by;
  } catch { /* ignore */ }

  async function recordHistory(rows: Array<{ user_id: string; from: string | null; to: string }>) {
    if (rows.length === 0) return;
    const payload = rows.map((r) => ({
      user_id: r.user_id,
      from_label: r.from,
      to_label: r.to,
      source: "backfill_job",
      changed_by: null,
    }));
    const { error } = await admin.from("role_label_history").insert(payload);
    if (error) summary.errors.push(`history_insert: ${error.message}`);
  }

  try {
    // 1) Titulares → 'CEO'
    const { data: titularIds } = await admin.from("user_account_access").select("user_id").eq("is_owner", true);
    const { data: ccIds } = await admin.from("client_companies").select("auth_user_id").not("auth_user_id", "is", null);
    const { data: subIds } = await admin.from("sub_companies").select("owner_id").not("owner_id", "is", null);

    const titulares = new Set<string>();
    (titularIds || []).forEach((r: any) => r.user_id && titulares.add(r.user_id));
    (ccIds || []).forEach((r: any) => r.auth_user_id && titulares.add(r.auth_user_id));
    (subIds || []).forEach((r: any) => r.owner_id && titulares.add(r.owner_id));

    if (titulares.size > 0) {
      const ids = Array.from(titulares);
      const { data: needsFix } = await admin.from("profiles").select("user_id, role_label").in("user_id", ids);
      const targets = (needsFix || []).filter((p: any) => {
        const v = (p.role_label || "").trim();
        return !v || GENERIC_LABELS.includes(v);
      });
      const toFix = targets.map((p: any) => p.user_id);
      if (toFix.length > 0) {
        const { error, count } = await admin
          .from("profiles")
          .update({ role_label: "CEO", updated_at: new Date().toISOString() }, { count: "exact" })
          .in("user_id", toFix);
        if (error) summary.errors.push(`titulares_ceo: ${error.message}`);
        else {
          summary.titulares_ceo = count ?? toFix.length;
          await recordHistory(targets.map((p: any) => ({ user_id: p.user_id, from: p.role_label ?? null, to: "CEO" })));
        }
      }
    }

    // 2) Demais perfis vazios → 'Colaborador'
    const { data: emptyProfiles } = await admin.from("profiles").select("user_id, role_label");
    const emptyTargets = (emptyProfiles || [])
      .filter((p: any) => !((p.role_label || "").trim()) && !titulares.has(p.user_id));
    const emptyIds = emptyTargets.map((p: any) => p.user_id);

    if (emptyIds.length > 0) {
      const { error, count } = await admin
        .from("profiles")
        .update({ role_label: "Colaborador", updated_at: new Date().toISOString() }, { count: "exact" })
        .in("user_id", emptyIds);
      if (error) summary.errors.push(`empty_defaulted: ${error.message}`);
      else {
        summary.empty_defaulted = count ?? emptyIds.length;
        await recordHistory(emptyTargets.map((p: any) => ({ user_id: p.user_id, from: p.role_label ?? null, to: "Colaborador" })));
      }
    }

    const status = summary.errors.length > 0 ? "partial" : "success";
    await admin.from("role_label_backfill_runs").insert({
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      titulares_ceo: summary.titulares_ceo,
      empty_defaulted: summary.empty_defaulted,
      errors: summary.errors,
      status,
      triggered_by,
    });
    console.log(`[role-label-backfill] started_at=${startedAt} status=${status} summary=${JSON.stringify(summary)}`);
    return new Response(JSON.stringify({ ok: true, started_at: startedAt, status, ...summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    console.error(`[role-label-backfill] unexpected: ${msg}`);
    await admin.from("role_label_backfill_runs").insert({
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: "failed",
      errors: [msg, ...summary.errors],
      triggered_by,
    });
    return new Response(JSON.stringify({ ok: false, error: msg, ...summary }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

