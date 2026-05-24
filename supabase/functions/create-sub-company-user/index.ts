import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALL_PAGES = [
  "dashboard", "chat", "calls", "tickets", "team", "cadastros", "ai-agents",
  "reports", "pipeline", "ceo", "settings", "api-keys", "status", "profile",
];

async function findUserByEmail(adminClient: ReturnType<typeof createClient>, email: string) {
  const normalized = String(email).trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.trim().toLowerCase() === normalized);
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const { sub_company_id, email, name, password, allowed_pages = ALL_PAGES, is_account_admin = true } = await req.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!sub_company_id || !normalizedEmail || !name || !password) {
      return new Response(JSON.stringify({ error: "Dados obrigatórios ausentes" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const adminClient = createClient(url, serviceKey);

    const { data: caller } = await userClient.auth.getUser();
    if (!caller.user) return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: sub } = await adminClient
      .from("sub_companies")
      .select("id, owner_id")
      .eq("id", sub_company_id)
      .maybeSingle();

    if (!sub || sub.owner_id !== caller.user.id) {
      return new Response(JSON.stringify({ error: "Sem permissão para esta sub-empresa" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const existing = await findUserByEmail(adminClient, normalizedEmail);
    const userResult = existing
      ? await adminClient.auth.admin.updateUserById(existing.id, { password, email_confirm: true, user_metadata: { display_name: name } })
      : await adminClient.auth.admin.createUser({ email: normalizedEmail, password, email_confirm: true, user_metadata: { display_name: name } });

    if (userResult.error || !userResult.data.user) {
      return new Response(JSON.stringify({ error: userResult.error?.message || "Falha ao criar usuário" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const createdUser = userResult.data.user;
    await adminClient.from("profiles").upsert({
      user_id: createdUser.id,
      email: normalizedEmail,
      display_name: name,
      role_label: is_account_admin ? "Administrador da sub-empresa" : "Usuário da sub-empresa",
      is_active: true,
    }, { onConflict: "user_id" });

    const { error: accessError } = await adminClient.from("user_account_access").upsert({
      user_id: createdUser.id,
      owner_id: sub.owner_id,
      sub_company_id,
      allowed_pages: Array.isArray(allowed_pages) ? allowed_pages : ALL_PAGES,
      is_account_admin,
      created_by: caller.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,owner_id,sub_company_id" });

    if (accessError) {
      return new Response(JSON.stringify({ error: accessError.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, user_id: createdUser.id }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error?.message || error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});