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

  try {
    // 1) Titulares (client_companies.auth_user_id / sub_companies.owner_id / user_account_access.is_owner)
    //    → role_label = 'CEO' quando estiver vazio ou for um rótulo genérico.
    const titularUpdate = await admin.rpc as unknown;
    // Sem RPC específica: usamos update parametrizado direto na tabela.
    const { data: titularIds } = await admin
      .from("user_account_access")
      .select("user_id")
      .eq("is_owner", true);
    const { data: ccIds } = await admin
      .from("client_companies")
      .select("auth_user_id")
      .not("auth_user_id", "is", null);
    const { data: subIds } = await admin
      .from("sub_companies")
      .select("owner_id")
      .not("owner_id", "is", null);

    const titulares = new Set<string>();
    (titularIds || []).forEach((r: any) => r.user_id && titulares.add(r.user_id));
    (ccIds || []).forEach((r: any) => r.auth_user_id && titulares.add(r.auth_user_id));
    (subIds || []).forEach((r: any) => r.owner_id && titulares.add(r.owner_id));

    if (titulares.size > 0) {
      const ids = Array.from(titulares);
      const { data: needsFix } = await admin
        .from("profiles")
        .select("user_id, role_label")
        .in("user_id", ids);
      const toFix = (needsFix || []).filter((p: any) => {
        const v = (p.role_label || "").trim();
        return !v || GENERIC_LABELS.includes(v);
      }).map((p: any) => p.user_id);

      if (toFix.length > 0) {
        const { error, count } = await admin
          .from("profiles")
          .update({ role_label: "CEO", updated_at: new Date().toISOString() }, { count: "exact" })
          .in("user_id", toFix);
        if (error) summary.errors.push(`titulares_ceo: ${error.message}`);
        else summary.titulares_ceo = count ?? toFix.length;
      }
    }

    // 2) Demais perfis com role_label vazio → "Colaborador" (rótulo neutro, editável).
    const { data: emptyProfiles } = await admin
      .from("profiles")
      .select("user_id, role_label");
    const emptyIds = (emptyProfiles || [])
      .filter((p: any) => !((p.role_label || "").trim()))
      .map((p: any) => p.user_id)
      .filter((id: string) => !titulares.has(id));

    if (emptyIds.length > 0) {
      const { error, count } = await admin
        .from("profiles")
        .update({ role_label: "Colaborador", updated_at: new Date().toISOString() }, { count: "exact" })
        .in("user_id", emptyIds);
      if (error) summary.errors.push(`empty_defaulted: ${error.message}`);
      else summary.empty_defaulted = count ?? emptyIds.length;
    }

    console.log(`[role-label-backfill] started_at=${startedAt} summary=${JSON.stringify(summary)}`);
    return new Response(JSON.stringify({ ok: true, started_at: startedAt, ...summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(`[role-label-backfill] unexpected: ${e?.message || e}`);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e), ...summary }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
