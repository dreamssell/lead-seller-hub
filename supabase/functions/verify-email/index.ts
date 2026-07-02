import { createClient } from "npm:@supabase/supabase-js@2.49.4";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

async function logEvent(
  admin: ReturnType<typeof createClient>,
  req: Request,
  payload: {
    email?: string | null;
    event: string;
    success: boolean;
    error_message?: string | null;
    metadata?: Record<string, unknown>;
    user_id?: string | null;
    sub_company_id?: string | null;
  },
) {
  try {
    await admin.from("auth_audit_logs").insert({
      email: payload.email ?? null,
      event: payload.event,
      success: payload.success,
      error_message: payload.error_message ?? null,
      metadata: payload.metadata ?? {},
      user_id: payload.user_id ?? null,
      sub_company_id: payload.sub_company_id ?? null,
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
      user_agent: req.headers.get("user-agent"),
    });
  } catch (e) {
    console.error("audit log failed", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let normalizedEmail = "";

  try {
    const { email, api_key } = await req.json();
    normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail || !api_key) {
      return new Response(
        JSON.stringify({ error: "Email e api_key são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: keyData } = await supabaseAdmin
      .from("api_keys")
      .select("id, is_active")
      .eq("key", api_key)
      .eq("is_active", true)
      .maybeSingle();

    if (!keyData) {
      await logEvent(supabaseAdmin, req, {
        email: normalizedEmail, event: "verify_email", success: false,
        error_message: "Chave de API inválida",
      });
      return new Response(
        JSON.stringify({ exists: false, error: "Chave de API inválida ou inativa" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabaseAdmin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyData.id);

    const user = await findUserByEmail(supabaseAdmin, normalizedEmail);

    if (user) {
      const { data: profile } = await supabaseAdmin
        .from("profiles").select("*").eq("user_id", user.id).maybeSingle();

      if (profile && !profile.is_active) {
        await logEvent(supabaseAdmin, req, {
          email: normalizedEmail, event: "verify_email_blocked", success: false,
          error_message: "Perfil desativado", user_id: user.id,
        });
        return new Response(
          JSON.stringify({ exists: false, error: "Acesso desativado. Contate o administrador." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      await logEvent(supabaseAdmin, req, {
        email: normalizedEmail, event: "verify_email", success: true,
        user_id: user.id, metadata: { pending_provision: false },
      });

      return new Response(
        JSON.stringify({
          exists: true,
          user: {
            id: user.id, email: user.email,
            display_name: profile?.display_name || user.email,
            avatar_url: profile?.avatar_url, role_label: profile?.role_label,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: sub } = await supabaseAdmin
      .from("sub_companies").select("id, admin_name, status")
      .ilike("admin_email", normalizedEmail).maybeSingle();

    if (sub && sub.status !== "blocked") {
      await logEvent(supabaseAdmin, req, {
        email: normalizedEmail, event: "verify_email", success: true,
        sub_company_id: sub.id, metadata: { pending_provision: true },
      });
      return new Response(
        JSON.stringify({
          exists: true, pending_provision: true,
          user: { email: normalizedEmail, display_name: sub.admin_name || normalizedEmail },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fallback: client_companies (end-consumer companies registered under Cadastros → Empresas)
    const { data: cc } = await supabaseAdmin
      .from("client_companies")
      .select("id, name, display_name, status, auth_user_id")
      .ilike("login_email", normalizedEmail).maybeSingle();

    if (cc && cc.status !== "blocked") {
      await logEvent(supabaseAdmin, req, {
        email: normalizedEmail, event: "verify_email", success: true,
        user_id: cc.auth_user_id, metadata: { pending_provision: !cc.auth_user_id, client_company_id: cc.id },
      });
      return new Response(
        JSON.stringify({
          exists: true, pending_provision: !cc.auth_user_id,
          user: { email: normalizedEmail, display_name: cc.display_name || cc.name },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (sub && sub.status === "blocked") {
      await logEvent(supabaseAdmin, req, {
        email: normalizedEmail, event: "verify_email_blocked", success: false,
        error_message: "Sub-empresa bloqueada", sub_company_id: sub.id,
      });
    } else {
      await logEvent(supabaseAdmin, req, {
        email: normalizedEmail, event: "verify_email", success: false,
        error_message: "E-mail não encontrado",
      });
    }

    return new Response(
      JSON.stringify({ exists: false, error: "E-mail não encontrado" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("verify-email error", error);
    await logEvent(supabaseAdmin, req, {
      email: normalizedEmail || null, event: "verify_email_error", success: false,
      error_message: error instanceof Error ? error.message : String(error),
    });
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
