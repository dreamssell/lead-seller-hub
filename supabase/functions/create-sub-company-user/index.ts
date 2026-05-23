import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALL_PAGES = [
  "dashboard", "chat", "calls", "tickets", "team", "cadastros", "ai-agents",
  "reports", "pipeline", "ceo", "settings", "api-keys", "status", "profile",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const { sub_company_id, email, name, password, allowed_pages = ALL_PAGES, is_account_admin = true } = await req.json();

    if (!sub_company_id || !email || !name || !password) {
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

    const { data: listed } = await adminClient.auth.admin.listUsers();
    const existing = listed.users.find((u) => u.email?.toLowerCase() === String(email).toLowerCase());
    const userResult = existing
      ? await adminClient.auth.admin.updateUserById(existing.id, { password, email_confirm: true, user_metadata: { display_name: name } })
      : await adminClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } });

    if (userResult.error || !userResult.data.user) {
      return new Response(JSON.stringify({ error: userResult.error?.message || "Falha ao criar usuário" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const createdUser = userResult.data.user;
    await adminClient.from("profiles").upsert({
      user_id: createdUser.id,
      email,
      display_name: name,
      role_label: is_account_admin ? "Administrador da sub-empresa" : "Usuário da sub-empresa",
      is_active: true,
    }, { onConflict: "user_id" });

    await adminClient.rpc("upsert_user_account_access", {
      p_user_id: createdUser.id,
      p_owner_id: sub.owner_id,
      p_sub_company_id: sub_company_id,
      p_allowed_pages: allowed_pages,
      p_is_account_admin: is_account_admin,
    });

    return new Response(JSON.stringify({ ok: true, user_id: createdUser.id }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error?.message || error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});