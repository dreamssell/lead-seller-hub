import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALL_PAGES = [
  "dashboard", "chat", "calls", "tickets", "team", "cadastros", "ai-agents",
  "reports", "pipeline", "ceo", "settings", "api-keys", "status", "profile", "white-label",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

type Scope = {
  owner_id: string;
  sub_company_id: string | null;
  is_owner: boolean; // direct owner of the account (no sub_company_id row required)
};

/**
 * Resolves the caller's management scope:
 *  - If caller has no user_account_access row → treat as owner, owner_id = caller.id
 *    (matches the platform's "dono do painel" pattern)
 *  - Else, caller must be is_account_admin in the requested sub_company_id (or owner_id matches).
 */
async function resolveScope(
  adminClient: ReturnType<typeof createClient>,
  callerId: string,
  requestedSubId: string | null,
): Promise<Scope> {
  // Owners of sub_companies → owner_id = callerId
  const { data: ownedSub } = await adminClient
    .from("sub_companies")
    .select("id")
    .eq("owner_id", callerId)
    .limit(1);
  const isOwnerOfSubs = (ownedSub?.length || 0) > 0;

  // Caller's own access rows
  const { data: access } = await adminClient
    .from("user_account_access")
    .select("owner_id, sub_company_id, is_account_admin")
    .eq("user_id", callerId);

  // If caller has no access row but owns sub_companies (or is a platform admin) → owner
  if (!access || access.length === 0 || isOwnerOfSubs) {
    if (requestedSubId) {
      // Must own the sub_company
      const { data: sub } = await adminClient
        .from("sub_companies")
        .select("owner_id")
        .eq("id", requestedSubId)
        .maybeSingle();
      if (!sub || sub.owner_id !== callerId) throw new Error("not_allowed_for_sub");
      return { owner_id: callerId, sub_company_id: requestedSubId, is_owner: true };
    }
    return { owner_id: callerId, sub_company_id: null, is_owner: true };
  }

  // Sub-admin path
  const adminRow = access.find((a) =>
    a.is_account_admin && (!requestedSubId || a.sub_company_id === requestedSubId)
  );
  if (!adminRow) throw new Error("not_account_admin");
  return {
    owner_id: adminRow.owner_id,
    sub_company_id: adminRow.sub_company_id ?? requestedSubId ?? null,
    is_owner: false,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const adminClient = createClient(url, serviceKey);

    const { data: caller } = await userClient.auth.getUser();
    if (!caller.user) return json({ error: "Não autenticado" }, 401);

    const body = await req.json();
    const action: "create" | "update" | "delete" | "list" = body.action;
    if (!action) return json({ error: "action obrigatória" }, 400);

    const scope = await resolveScope(adminClient, caller.user.id, body.sub_company_id ?? null);

    // ─── LIST ──────────────────────────────────────────────────────────────
    if (action === "list") {
      let q = adminClient
        .from("user_account_access")
        .select("user_id, sub_company_id, allowed_pages, is_account_admin, created_at")
        .eq("owner_id", scope.owner_id);
      if (scope.sub_company_id) q = q.eq("sub_company_id", scope.sub_company_id);
      else q = q.is("sub_company_id", null);
      const { data: rows, error } = await q;
      if (error) return json({ error: error.message }, 400);
      const ids = (rows || []).map((r) => r.user_id);
      const { data: profiles } = await adminClient.from("profiles").select("*").in("user_id", ids);
      const profMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      const users = (rows || []).map((r) => ({
        ...r,
        profile: profMap.get(r.user_id) || null,
      }));
      return json({ users, scope });
    }

    // ─── CREATE ────────────────────────────────────────────────────────────
    if (action === "create") {
      const { email, name, password, allowed_pages, is_account_admin } = body;
      const normalizedEmail = String(email || "").trim().toLowerCase();
      if (!normalizedEmail || !name || !password || password.length < 6) {
        return json({ error: "Email, nome e senha (mín. 6) obrigatórios" }, 400);
      }
      const pages = Array.isArray(allowed_pages) && allowed_pages.length > 0 ? allowed_pages : ALL_PAGES;

      const existing = await findUserByEmail(adminClient, normalizedEmail);
      const userResult = existing
        ? await adminClient.auth.admin.updateUserById(existing.id, { password, email_confirm: true, user_metadata: { display_name: name } })
        : await adminClient.auth.admin.createUser({ email: normalizedEmail, password, email_confirm: true, user_metadata: { display_name: name } });
      if (userResult.error || !userResult.data.user) {
        return json({ error: userResult.error?.message || "Falha ao criar usuário" }, 400);
      }
      const newUser = userResult.data.user;

      await adminClient.from("profiles").upsert({
        user_id: newUser.id,
        email: normalizedEmail,
        display_name: name,
        is_active: true,
      }, { onConflict: "user_id" });

      const accessPayload: any = {
        user_id: newUser.id,
        owner_id: scope.owner_id,
        sub_company_id: scope.sub_company_id,
        allowed_pages: pages,
        is_account_admin: !!is_account_admin,
        created_by: caller.user.id,
        updated_at: new Date().toISOString(),
      };
      const conflict = scope.sub_company_id ? "user_id,owner_id,sub_company_id" : undefined;
      const { error: accessError } = conflict
        ? await adminClient.from("user_account_access").upsert(accessPayload, { onConflict: conflict })
        : await adminClient.from("user_account_access").upsert(accessPayload);
      if (accessError) return json({ error: accessError.message }, 400);

      return json({ ok: true, user_id: newUser.id });
    }

    // ─── UPDATE ────────────────────────────────────────────────────────────
    if (action === "update") {
      const { user_id, name, password, allowed_pages, is_account_admin, is_active, phone, role_label } = body;
      if (!user_id) return json({ error: "user_id obrigatório" }, 400);

      // Verify target belongs to scope
      let q = adminClient.from("user_account_access").select("id, sub_company_id").eq("user_id", user_id).eq("owner_id", scope.owner_id);
      if (scope.sub_company_id) q = q.eq("sub_company_id", scope.sub_company_id);
      const { data: target } = await q.maybeSingle();
      if (!target) return json({ error: "Usuário não está no seu escopo" }, 403);

      if (password && password.length >= 6) {
        await adminClient.auth.admin.updateUserById(user_id, { password });
      }
      const profileUpdate: any = {};
      if (typeof name === "string") profileUpdate.display_name = name;
      if (typeof phone === "string") profileUpdate.phone = phone;
      if (typeof role_label === "string") profileUpdate.role_label = role_label;
      if (typeof is_active === "boolean") profileUpdate.is_active = is_active;
      if (Object.keys(profileUpdate).length > 0) {
        await adminClient.from("profiles").update(profileUpdate).eq("user_id", user_id);
      }

      const accessUpdate: any = { updated_at: new Date().toISOString() };
      if (Array.isArray(allowed_pages)) accessUpdate.allowed_pages = allowed_pages;
      if (typeof is_account_admin === "boolean") accessUpdate.is_account_admin = is_account_admin;
      if (Object.keys(accessUpdate).length > 1) {
        await adminClient.from("user_account_access").update(accessUpdate).eq("id", target.id);
      }
      return json({ ok: true });
    }

    // ─── DELETE ────────────────────────────────────────────────────────────
    if (action === "delete") {
      const { user_id } = body;
      if (!user_id) return json({ error: "user_id obrigatório" }, 400);
      if (user_id === caller.user.id) return json({ error: "Você não pode excluir o próprio usuário" }, 400);

      let q = adminClient.from("user_account_access").select("id, sub_company_id").eq("user_id", user_id).eq("owner_id", scope.owner_id);
      if (scope.sub_company_id) q = q.eq("sub_company_id", scope.sub_company_id);
      const { data: target } = await q.maybeSingle();
      if (!target) return json({ error: "Usuário não está no seu escopo" }, 403);

      await adminClient.from("user_account_access").delete().eq("id", target.id);

      // Only delete from auth if no other access rows remain
      const { data: stillHas } = await adminClient.from("user_account_access").select("id").eq("user_id", user_id).limit(1);
      if (!stillHas || stillHas.length === 0) {
        await adminClient.from("user_roles").delete().eq("user_id", user_id);
        await adminClient.from("profiles").delete().eq("user_id", user_id);
        await adminClient.auth.admin.deleteUser(user_id);
      }
      return json({ ok: true });
    }

    return json({ error: "Ação desconhecida" }, 400);
  } catch (error: any) {
    return json({ error: String(error?.message || error) }, 500);
  }
});
