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

async function waitForUser(admin: ReturnType<typeof createClient>, email: string, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const u = await findUserByEmail(admin, email);
    if (u) return u;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
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
    const { email, password, api_key } = await req.json();
    normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail || !password || !api_key) {
      return new Response(
        JSON.stringify({ error: "Email, password e api_key são obrigatórios" }),
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
        email: normalizedEmail,
        event: "login_attempt",
        success: false,
        error_message: "Chave de API inválida",
      });
      return new Response(
        JSON.stringify({ success: false, error: "Chave de API inválida" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await logEvent(supabaseAdmin, req, {
      email: normalizedEmail,
      event: "login_attempt",
      success: true,
    });

    // Procurar usuário existente
    let existing = await findUserByEmail(supabaseAdmin, normalizedEmail);

    if (!existing) {
      const { data: sub } = await supabaseAdmin
        .from("sub_companies")
        .select("id, owner_id, admin_name, blocked_pages, status")
        .ilike("admin_email", normalizedEmail)
        .maybeSingle();

      // Fallback: client_companies (end-consumer login registered under Cadastros → Empresas).
      if (!sub) {
        const { data: cc } = await supabaseAdmin
          .from("client_companies")
          .select("id, owner_id, sub_company_id, name, display_name, status")
          .ilike("login_email", normalizedEmail)
          .maybeSingle();

        if (!cc) {
          await logEvent(supabaseAdmin, req, {
            email: normalizedEmail, event: "login_failure", success: false,
            error_message: "Usuário não encontrado",
          });
          return new Response(
            JSON.stringify({ success: false, error: "Usuário não encontrado" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        if (cc.status === "blocked") {
          await logEvent(supabaseAdmin, req, {
            email: normalizedEmail, event: "login_blocked", success: false,
            error_message: "Empresa bloqueada",
          });
          return new Response(
            JSON.stringify({ success: false, error: "Acesso bloqueado. Contate o administrador." }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        if (String(password).length < 6) {
          return new Response(
            JSON.stringify({ success: false, error: "Senha deve ter pelo menos 6 caracteres" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // Provision the auth user for this client company (idempotent).
        const created = await supabaseAdmin.auth.admin.createUser({
          email: normalizedEmail,
          password,
          email_confirm: true,
          user_metadata: {
            display_name: cc.display_name || cc.name,
            client_company_id: cc.id,
            owner_id: cc.owner_id,
            sub_company_id: cc.sub_company_id,
          },
        });
        if (created.error || !created.data.user) {
          await logEvent(supabaseAdmin, req, {
            email: normalizedEmail, event: "provision_failed", success: false,
            error_message: created.error?.message || "createUser falhou",
          });
          return new Response(
            JSON.stringify({ success: false, error: created.error?.message || "Falha ao provisionar usuário" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        existing = created.data.user;

        await supabaseAdmin.from("profiles").upsert({
          user_id: existing.id,
          email: normalizedEmail,
          display_name: cc.display_name || cc.name,
          role_label: "Cliente",
          is_active: true,
        }, { onConflict: "user_id" });

        await supabaseAdmin.from("client_companies")
          .update({ auth_user_id: existing.id })
          .eq("id", cc.id);

        await logEvent(supabaseAdmin, req, {
          email: normalizedEmail, event: "user_provisioned", success: true,
          user_id: existing.id, metadata: { client_company_id: cc.id },
        });
      } else {

      if (sub.status === "blocked") {
        await logEvent(supabaseAdmin, req, {
          email: normalizedEmail, event: "login_blocked", success: false,
          error_message: "Sub-empresa bloqueada", sub_company_id: sub.id,
        });
        return new Response(
          JSON.stringify({ success: false, error: "Acesso bloqueado. Contate o administrador." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (String(password).length < 6) {
        await logEvent(supabaseAdmin, req, {
          email: normalizedEmail, event: "provision_failed", success: false,
          error_message: "Senha menor que 6 caracteres", sub_company_id: sub.id,
        });
        return new Response(
          JSON.stringify({ success: false, error: "Senha deve ter pelo menos 6 caracteres" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Idempotência: tentar adquirir lock
      const { data: lockAcquired } = await supabaseAdmin.rpc("try_acquire_provision_lock", {
        p_email: normalizedEmail,
      });

      if (!lockAcquired) {
        await logEvent(supabaseAdmin, req, {
          email: normalizedEmail, event: "provision_skipped_locked", success: true,
          metadata: { reason: "another provisioning in progress" }, sub_company_id: sub.id,
        });
        // Aguarda outro processo terminar
        existing = await waitForUser(supabaseAdmin, normalizedEmail);
        if (!existing) {
          return new Response(
            JSON.stringify({ success: false, error: "Provisionamento em andamento. Tente novamente." }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } else {
        try {
          await logEvent(supabaseAdmin, req, {
            email: normalizedEmail, event: "provision_started", success: true,
            sub_company_id: sub.id,
          });

          // Re-check após adquirir lock (alguém pode ter terminado entre as duas checagens)
          existing = await findUserByEmail(supabaseAdmin, normalizedEmail);

          if (!existing) {
            const created = await supabaseAdmin.auth.admin.createUser({
              email: normalizedEmail,
              password,
              email_confirm: true,
              user_metadata: { display_name: sub.admin_name || normalizedEmail },
            });
            if (created.error || !created.data.user) {
              await logEvent(supabaseAdmin, req, {
                email: normalizedEmail, event: "provision_failed", success: false,
                error_message: created.error?.message || "createUser falhou",
                sub_company_id: sub.id,
              });
              return new Response(
                JSON.stringify({ success: false, error: created.error?.message || "Falha ao provisionar usuário" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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

            await logEvent(supabaseAdmin, req, {
              email: normalizedEmail, event: "user_provisioned", success: true,
              user_id: existing.id, sub_company_id: sub.id,
              metadata: { allowed_pages: allowed },
            });
          }
        } finally {
          await supabaseAdmin.rpc("release_provision_lock", { p_email: normalizedEmail });
        }
      }
    }

    // Verifica perfil bloqueado
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("is_active").eq("user_id", existing.id).maybeSingle();
    if (profile && !profile.is_active) {
      await logEvent(supabaseAdmin, req, {
        email: normalizedEmail, event: "login_blocked", success: false,
        error_message: "Perfil desativado", user_id: existing.id,
      });
      return new Response(
        JSON.stringify({ success: false, error: "Acesso desativado. Contate o administrador." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );

    const { data: authData, error: authError } = await supabaseAuth.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (authError || !authData.session) {
      await logEvent(supabaseAdmin, req, {
        email: normalizedEmail, event: "login_failure", success: false,
        error_message: authError?.message || "Credenciais inválidas",
        user_id: existing.id,
      });
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais inválidas" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await logEvent(supabaseAdmin, req, {
      email: normalizedEmail, event: "login_success", success: true,
      user_id: existing.id,
    });

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
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("authenticate error", error);
    await logEvent(supabaseAdmin, req, {
      email: normalizedEmail || null, event: "login_error", success: false,
      error_message: error instanceof Error ? error.message : String(error),
    });
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
