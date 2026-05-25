import { createClient } from "npm:@supabase/supabase-js@2.49.4";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALL_PAGES = [
  "dashboard", "chat", "calls", "tickets", "team", "cadastros", "ai-agents",
  "reports", "pipeline", "ceo", "settings", "api-keys", "status", "profile",
];

async function findUserByEmail(supabaseAdmin: ReturnType<typeof createClient>, email: string) {
  const normalized = String(email).trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.trim().toLowerCase() === normalized);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, password, api_key } = await req.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail || !password || !api_key) {
      return new Response(
        JSON.stringify({ error: "Email, password e api_key são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: keyData, error: keyError } = await supabaseAdmin
      .from("api_keys")
      .select("id, is_active")
      .eq("key", api_key)
      .eq("is_active", true)
      .maybeSingle();

    if (keyError || !keyData) {
      return new Response(
        JSON.stringify({ success: false, error: "Chave de API inválida" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auto-provisionamento: se o usuário não existir em Auth mas existir como admin
    // de uma sub-empresa ativa, cria a conta agora com a senha informada.
    let existing = await findUserByEmail(supabaseAdmin, normalizedEmail);

    if (!existing) {
      const { data: sub } = await supabaseAdmin
        .from("sub_companies")
        .select("id, owner_id, admin_name, blocked_pages, status")
        .ilike("admin_email", normalizedEmail)
        .maybeSingle();

      if (sub && sub.status !== "blocked") {
        if (String(password).length < 6) {
          return new Response(
            JSON.stringify({ success: false, error: "Senha deve ter pelo menos 6 caracteres" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const created = await supabaseAdmin.auth.admin.createUser({
          email: normalizedEmail,
          password,
          email_confirm: true,
          user_metadata: { display_name: sub.admin_name || normalizedEmail },
        });
        if (created.error || !created.data.user) {
          return new Response(
            JSON.stringify({ success: false, error: created.error?.message || "Falha ao provisionar usuário" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        existing = created.data.user;

        await supabaseAdmin.from("profiles").upsert({
          user_id: existing.id,
          email: normalizedEmail,
          display_name: sub.admin_name || normalizedEmail,
          role_label: "Administrador da sub-empresa",
          is_active: true,
        }, { onConflict: "user_id" });

        const blocked = Array.isArray(sub.blocked_pages) ? sub.blocked_pages : [];
        const allowed = ALL_PAGES.filter((p) => !blocked.includes(p));

        await supabaseAdmin.from("user_account_access").upsert({
          user_id: existing.id,
          owner_id: sub.owner_id,
          sub_company_id: sub.id,
          allowed_pages: allowed,
          is_account_admin: true,
          created_by: sub.owner_id,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,owner_id,sub_company_id" });
      }
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    const { data: authData, error: authError } = await supabaseAuth.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (authError || !authData.session) {
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais inválidas" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const platformUrl = Deno.env.get("PLATFORM_URL") || "https://hub.leadseller.com.br";
    const redirectUrl = `${platformUrl}/auth/callback?access_token=${authData.session.access_token}&refresh_token=${authData.session.refresh_token}`;

    return new Response(
      JSON.stringify({
        success: true,
        session: {
          access_token: authData.session.access_token,
          refresh_token: authData.session.refresh_token,
          expires_at: authData.session.expires_at,
        },
        redirectUrl,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
