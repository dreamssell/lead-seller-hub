// Provisions (or resets) the auth.users record tied to a client_companies row.
// Called from the "Empresas" CRUD in Cadastros. Uses the service role to
// create/update the login user, then links the auth_user_id back onto the row.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Identify caller.
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "unauthorized" }, 401);
    const caller = userRes.user;

    const body = await req.json().catch(() => ({}));
    const company_id: string | undefined = body.company_id;
    const login_email: string | undefined = (body.login_email || "").trim().toLowerCase();
    const password: string | undefined = body.password;
    const display_name: string | undefined = body.display_name;

    if (!company_id || !login_email) return json({ error: "missing_fields" }, 400);

    const admin = createClient(url, service);

    // Verify the caller owns this company (or is platform admin).
    const { data: company, error: cErr } = await admin
      .from("client_companies")
      .select("id, owner_id, sub_company_id, name, auth_user_id")
      .eq("id", company_id)
      .single();
    if (cErr || !company) return json({ error: "company_not_found" }, 404);

    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin" as unknown as string,
    });
    if (company.owner_id !== caller.id && !isAdmin) {
      return json({ error: "not_allowed" }, 403);
    }

    // Look up existing auth user by email (idempotent).
    let authUserId = company.auth_user_id as string | null;
    if (!authUserId) {
      // Try find by email via listUsers filter.
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
      const match = list?.users?.find((u) => (u.email ?? "").toLowerCase() === login_email);
      if (match) authUserId = match.id;
    }

    if (authUserId) {
      // Update existing user (password/email/metadata).
      const patch: Record<string, unknown> = {
        email: login_email,
        email_confirm: true,
        user_metadata: {
          display_name: display_name ?? company.name,
          client_company_id: company.id,
          owner_id: company.owner_id,
          sub_company_id: company.sub_company_id,
        },
      };
      if (password && password.length >= 6) patch.password = password;
      const { error: upErr } = await admin.auth.admin.updateUserById(authUserId, patch);
      if (upErr) return json({ error: upErr.message }, 400);
    } else {
      if (!password || password.length < 6) return json({ error: "password_min_6" }, 400);
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: login_email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: display_name ?? company.name,
          client_company_id: company.id,
          owner_id: company.owner_id,
          sub_company_id: company.sub_company_id,
        },
      });
      if (createErr || !created?.user) return json({ error: createErr?.message ?? "create_failed" }, 400);
      authUserId = created.user.id;
    }

    // Persist link + login email onto the row.
    const { error: linkErr } = await admin
      .from("client_companies")
      .update({
        login_email,
        auth_user_id: authUserId,
        display_name: display_name ?? company.name,
      })
      .eq("id", company.id);
    if (linkErr) return json({ error: linkErr.message }, 400);

    // Ensure profile mirror exists (handle_new_user only fires on signup, not admin create).
    // Ensure profile mirror exists (handle_new_user only fires on signup, not admin create).
    // The titular (dono da empresa) recebe automaticamente o cargo CEO.
    await admin.from("profiles").upsert({
      user_id: authUserId,
      email: login_email,
      display_name: display_name ?? company.name,
      role_label: "CEO",
    }, { onConflict: "user_id" });

    // Ensure a user_account_access row exists so blocked_pages/status on the
    // client_companies row take effect for this login. The row marks the login
    // as the account titular (is_owner + is_account_admin) and the trigger
    // "protect_account_owner" prevents non-platform admins from removing it.
    await admin.from("user_account_access").upsert({
      user_id: authUserId,
      owner_id: authUserId,
      sub_company_id: null,
      allowed_pages: [] as string[],
      is_account_admin: true,
      is_owner: true,
      created_by: caller.id,
    }, { onConflict: "user_id,owner_id" });

    return json({ ok: true, auth_user_id: authUserId, login_email });

  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
