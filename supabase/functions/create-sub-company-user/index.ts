import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALL_PAGES = [
  "dashboard", "chat", "calls", "tickets", "team", "cadastros", "ai-agents",
  "reports", "pipeline", "ceo", "settings", "api-keys", "status", "profile",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AdminClient = ReturnType<typeof createClient>;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(code: string, message: string, status: number) {
  return json({ error: message, code, message, status }, status);
}

async function findUserByEmail(admin: AdminClient, email: string) {
  // Prefer the SECURITY DEFINER RPC (avoids pagination pitfalls with listUsers).
  const { data: rpcId } = await admin.rpc("admin_find_auth_user_by_email", { p_email: email });
  if (rpcId) {
    const { data } = await admin.auth.admin.getUserById(rpcId as string);
    if (data.user) return data.user;
  }
  // Fallback: paginated listUsers, capped.
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.trim().toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("method_not_allowed", "Método não permitido", 405);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return fail("invalid_json", "Corpo da requisição inválido", 400);
  }

  const {
    sub_company_id,
    email,
    name,
    password,
    allowed_pages = ALL_PAGES,
    is_account_admin = true,
  } = payload || {};

  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!sub_company_id || !normalizedEmail || !name || !password) {
    return fail("missing_fields", "Dados obrigatórios ausentes (sub_company_id, email, name, password)", 400);
  }
  if (!EMAIL_RE.test(normalizedEmail)) {
    return fail("invalid_email", "E-mail em formato inválido", 400);
  }
  if (String(password).length < 6) {
    return fail("weak_password", "A senha precisa ter pelo menos 6 caracteres", 400);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization") || "";

  if (!authHeader) return fail("unauthenticated", "Sessão ausente", 401);

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(url, serviceKey);

  const { data: caller } = await userClient.auth.getUser();
  if (!caller.user) return fail("unauthenticated", "Não autenticado", 401);

  const { data: sub, error: subErr } = await admin
    .from("sub_companies")
    .select("id, owner_id, admin_email")
    .eq("id", sub_company_id)
    .maybeSingle();

  if (subErr) return fail("db_error", subErr.message, 500);
  if (!sub) return fail("sub_not_found", "Sub-empresa não encontrada", 404);

  // Owner or platform admin (dono) may provision.
  let allowed = sub.owner_id === caller.user.id;
  if (!allowed) {
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: caller.user.id,
      _role: "admin",
    });
    allowed = !!isAdmin;
  }
  if (!allowed) return fail("forbidden", "Sem permissão para esta sub-empresa", 403);

  // Serialize concurrent provisioning attempts for the same email.
  const { data: lockOk } = await admin.rpc("try_acquire_provision_lock", { p_email: normalizedEmail });
  if (!lockOk) {
    return fail("provision_in_progress", "Já existe uma criação em andamento para este e-mail. Tente novamente em instantes.", 409);
  }

  try {
    let user;
    try {
      user = await findUserByEmail(admin, normalizedEmail);
    } catch (e: any) {
      return fail("lookup_failed", `Falha ao consultar usuários: ${e?.message ?? e}`, 500);
    }

    const userResult = user
      ? await admin.auth.admin.updateUserById(user.id, {
          password,
          email_confirm: true,
          user_metadata: { display_name: name },
        })
      : await admin.auth.admin.createUser({
          email: normalizedEmail,
          password,
          email_confirm: true,
          user_metadata: { display_name: name },
        });

    if (userResult.error || !userResult.data.user) {
      const msg = userResult.error?.message || "Falha ao criar usuário";
      const code = /already.*registered|duplicate/i.test(msg) ? "email_already_used" : "auth_error";
      return fail(code, msg, 400);
    }

    const createdUser = userResult.data.user;
    const titularRole = "CEO";
    console.log(`[create-sub-company-user] titular role_label="${titularRole}" sub_company_id=${sub_company_id} auth_user_id=${createdUser.id} email=${normalizedEmail}`);
    const { error: profileUpsertErr } = await admin.from("profiles").upsert(
      {
        user_id: createdUser.id,
        email: normalizedEmail,
        display_name: name,
        role_label: titularRole,
        is_active: true,
      },
      { onConflict: "user_id" },
    );
    if (profileUpsertErr) {
      console.error(`[create-sub-company-user] profile_upsert_failed: ${profileUpsertErr.message}`);
    }

    const { error: accessError } = await admin.from("user_account_access").upsert(
      {
        user_id: createdUser.id,
        owner_id: sub.owner_id,
        sub_company_id,
        allowed_pages: Array.isArray(allowed_pages) ? allowed_pages : ALL_PAGES,
        is_account_admin,
        created_by: caller.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,owner_id,sub_company_id" },
    );

    if (accessError) return fail("access_upsert_failed", accessError.message, 400);

    // Keep sub_companies.admin_email in sync with the provisioned account.
    if (sub.admin_email?.toLowerCase() !== normalizedEmail) {
      await admin.from("sub_companies").update({ admin_email: normalizedEmail }).eq("id", sub_company_id);
    }

    return json({ ok: true, user_id: createdUser.id, reused: !!user }, 200);
  } catch (error: any) {
    return fail("unexpected", String(error?.message || error), 500);
  } finally {
    await admin.rpc("release_provision_lock", { p_email: normalizedEmail });
  }
});
