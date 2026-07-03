import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALL_PAGES = [
  "dashboard",
  "chat",
  "calls",
  "tickets",
  "team",
  "cadastros",
  "ai-agents",
  "reports",
  "pipeline",
  "ceo",
  "settings",
  "api-keys",
  "status",
  "profile",
  "white-label",
];

type AccessLevel = "atendimento" | "supervisao" | "administracao";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function userError(message: string, status = 400, code?: string) {
  return json({ error: message, code }, status);
}

function errorMessage(
  error: unknown,
  fallback = "Falha ao processar a solicitação",
) {
  if (!error) return fallback;
  const err = error as any;
  return String(
    err?.message || err?.error_description || err?.error || fallback,
  );
}

async function syncPipelineAssignments(
  admin: any,
  userId: string,
  scope: { owner_id: string; sub_company_id: string | null },
  pipelineIds: string[] | undefined,
  createdBy: string,
): Promise<{ from: string[]; to: string[] } | null> {
  if (!Array.isArray(pipelineIds)) return null;
  const desired = Array.from(new Set(pipelineIds.filter((v) => typeof v === "string" && v)));

  // Validate all pipelines belong to the same scope
  if (desired.length > 0) {
    let pq = admin.from("pipelines").select("id, sub_company_id")
      .eq("owner_id", scope.owner_id).in("id", desired);
    const { data: valid } = await pq;
    const validIds = new Set((valid || []).filter((p: any) =>
      scope.sub_company_id ? p.sub_company_id === scope.sub_company_id : p.sub_company_id === null
    ).map((p: any) => p.id));
    for (const id of desired) {
      if (!validIds.has(id)) {
        throw new Error(`pipeline_out_of_scope:${id}`);
      }
    }
  }

  let curQ = admin.from("user_pipeline_assignments").select("pipeline_id")
    .eq("user_id", userId).eq("owner_id", scope.owner_id);
  if (scope.sub_company_id) curQ = curQ.eq("sub_company_id", scope.sub_company_id);
  else curQ = curQ.is("sub_company_id", null);
  const { data: current } = await curQ;
  const currentSet = new Set((current || []).map((r: any) => r.pipeline_id));
  const desiredSet = new Set(desired);

  const toAdd = desired.filter((id) => !currentSet.has(id));
  const toRemove = Array.from(currentSet).filter((id) => !desiredSet.has(id as string)) as string[];

  if (toAdd.length > 0) {
    const rows = toAdd.map((pipeline_id) => ({
      user_id: userId,
      owner_id: scope.owner_id,
      sub_company_id: scope.sub_company_id,
      pipeline_id,
      created_by: createdBy,
    }));
    const { error } = await admin.from("user_pipeline_assignments").insert(rows);
    if (error) throw new Error(errorMessage(error, "Falha ao atribuir funis"));
  }
  if (toRemove.length > 0) {
    let delQ = admin.from("user_pipeline_assignments").delete()
      .eq("user_id", userId).eq("owner_id", scope.owner_id)
      .in("pipeline_id", toRemove);
    if (scope.sub_company_id) delQ = delQ.eq("sub_company_id", scope.sub_company_id);
    else delQ = delQ.is("sub_company_id", null);
    const { error } = await delQ;
    if (error) throw new Error(errorMessage(error, "Falha ao remover funis"));
  }

  const from = Array.from(currentSet).sort() as string[];
  const to = [...desired].sort();
  if (JSON.stringify(from) === JSON.stringify(to)) return null;
  return { from, to };
}



async function findUserByEmail(
  adminClient: ReturnType<typeof createClient>,
  email: string,
) {
  const normalized = String(email).trim().toLowerCase();
  // Fast path: SQL lookup via SECURITY DEFINER helper (reliable regardless of user count).
  try {
    const { data: uid, error: rpcErr } = await adminClient.rpc(
      "admin_find_auth_user_by_email",
      { p_email: normalized },
    );
    if (!rpcErr && uid) {
      const { data: byId } = await adminClient.auth.admin.getUserById(
        uid as string,
      );
      if (byId?.user) return byId.user;
    }
  } catch (_) {
    // Fall back to listUsers pagination.
  }
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    const found = data.users.find((u) =>
      u.email?.trim().toLowerCase() === normalized
    );
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  return null;
}

type Scope = {
  owner_id: string;
  sub_company_id: string | null;
  is_owner: boolean;
};

async function resolveScope(
  adminClient: ReturnType<typeof createClient>,
  callerId: string,
  requestedSubId: string | null,
): Promise<Scope> {
  const { data: ownedSub } = await adminClient
    .from("sub_companies")
    .select("id")
    .eq("owner_id", callerId)
    .limit(1);
  const isOwnerOfSubs = (ownedSub?.length || 0) > 0;

  const { data: access } = await adminClient
    .from("user_account_access")
    .select("owner_id, sub_company_id, is_account_admin")
    .eq("user_id", callerId);

  if (!access || access.length === 0 || isOwnerOfSubs) {
    if (requestedSubId) {
      const { data: sub } = await adminClient
        .from("sub_companies")
        .select("owner_id")
        .eq("id", requestedSubId)
        .maybeSingle();
      if (!sub || sub.owner_id !== callerId) {
        throw new Error("not_allowed_for_sub");
      }
      return {
        owner_id: callerId,
        sub_company_id: requestedSubId,
        is_owner: true,
      };
    }
    return { owner_id: callerId, sub_company_id: null, is_owner: true };
  }

  const adminRow = access.find((a) =>
    a.is_account_admin &&
    (!requestedSubId || a.sub_company_id === requestedSubId)
  );
  if (!adminRow) throw new Error("not_account_admin");
  return {
    owner_id: adminRow.owner_id,
    sub_company_id: adminRow.sub_company_id ?? requestedSubId ?? null,
    is_owner: false,
  };
}

async function applyAccessLevel(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  scope: Scope,
  level: AccessLevel,
) {
  // Remove existing signature roles for this scope
  let del = adminClient.from("user_signature_roles").delete().eq(
    "user_id",
    userId,
  ).eq("owner_id", scope.owner_id);
  if (scope.sub_company_id) {
    del = del.eq("sub_company_id", scope.sub_company_id);
  } else del = del.is("sub_company_id", null);
  const { error: deleteError } = await del;
  if (deleteError) throw deleteError;

  if (level === "supervisao") {
    const { error: insertError } = await adminClient.from(
      "user_signature_roles",
    ).insert({
      user_id: userId,
      owner_id: scope.owner_id,
      sub_company_id: scope.sub_company_id,
      role: "supervisor",
    });
    if (insertError) throw insertError;
  }
}

async function logAudit(
  adminClient: ReturnType<typeof createClient>,
  params: {
    action: "create" | "update" | "delete";
    userId: string;
    label: string;
    changes: any;
    changedBy: string;
    scope: Scope;
  },
) {
  const { error } = await adminClient.from("audit_logs").insert({
    table_name: "user_account_access",
    record_id: params.userId,
    action: params.action,
    record_label: params.label,
    changes: {
      ...params.changes,
      _scope: {
        owner_id: params.scope.owner_id,
        sub_company_id: params.scope.sub_company_id,
      },
    },
    changed_by: params.changedBy,
  });
  if (error) {
    console.error(
      "[manage-account-user] audit_log_failed",
      errorMessage(error),
    );
  }
}

async function getScopedAccess(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  scope: Scope,
) {
  let q = adminClient
    .from("user_account_access")
    .select("id, owner_id, sub_company_id, allowed_pages, is_account_admin")
    .eq("user_id", userId)
    .eq("owner_id", scope.owner_id);
  if (scope.sub_company_id) q = q.eq("sub_company_id", scope.sub_company_id);
  else q = q.is("sub_company_id", null);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data;
}

async function upsertScopedAccess(
  adminClient: ReturnType<typeof createClient>,
  payload: any,
  existingId?: string,
) {
  if (existingId) {
    const { error } = await adminClient
      .from("user_account_access")
      .update({
        allowed_pages: payload.allowed_pages,
        is_account_admin: payload.is_account_admin,
        updated_at: payload.updated_at,
      })
      .eq("id", existingId);
    if (error) throw error;
    return;
  }

  const { error } = await adminClient.from("user_account_access").insert(
    payload,
  );
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(url, serviceKey);

    const { data: caller } = await userClient.auth.getUser();
    if (!caller.user) {
      return userError("Sessão expirada. Faça login novamente.", 401, "unauthenticated");
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return userError("Corpo da requisição inválido (JSON esperado).", 400, "invalid_json");
    }
    const action: "create" | "update" | "delete" | "list" = body.action;
    if (!action) return userError("Ação obrigatória.", 400, "missing_action");

    let scope: Scope;
    try {
      scope = await resolveScope(
        adminClient,
        caller.user.id,
        body.sub_company_id ?? null,
      );
    } catch (scopeError: any) {
      const msg = String(scopeError?.message || scopeError || "");
      if (msg === "not_allowed_for_sub") {
        return userError(
          "Você não tem permissão para gerenciar esta sub-empresa.",
          403,
          "not_allowed_for_sub",
        );
      }
      if (msg === "not_account_admin") {
        return userError(
          "Apenas administradores da conta podem executar esta ação.",
          403,
          "not_account_admin",
        );
      }
      return userError(errorMessage(scopeError, "Falha ao resolver escopo"), 400, "scope_error");
    }

    // ─── LIST ──────────────────────────────────────────────────────────────
    if (action === "list") {
      let q = adminClient
        .from("user_account_access")
        .select(
          "user_id, sub_company_id, allowed_pages, is_account_admin, created_at",
        )
        .eq("owner_id", scope.owner_id);
      if (scope.sub_company_id) {
        q = q.eq("sub_company_id", scope.sub_company_id);
      } else q = q.is("sub_company_id", null);
      const { data: rows, error } = await q;
      if (error) return userError(error.message, 400, "list_query_error");
      const ids = (rows || []).map((r) => r.user_id);
      const { data: profiles } = await adminClient.from("profiles").select("*")
        .in("user_id", ids);
      const profMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

      // Signature roles → derive access level
      let sigQ = adminClient.from("user_signature_roles").select(
        "user_id, role",
      ).eq("owner_id", scope.owner_id).in("user_id", ids);
      if (scope.sub_company_id) {
        sigQ = sigQ.eq("sub_company_id", scope.sub_company_id);
      }
      const { data: sigs } = await sigQ;
      const sigMap = new Map<string, string>();
      (sigs || []).forEach((s: any) => sigMap.set(s.user_id, s.role));

      // Pipeline assignments per user within scope
      let pipeQ = adminClient.from("user_pipeline_assignments")
        .select("user_id, pipeline_id")
        .eq("owner_id", scope.owner_id)
        .in("user_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
      if (scope.sub_company_id) pipeQ = pipeQ.eq("sub_company_id", scope.sub_company_id);
      else pipeQ = pipeQ.is("sub_company_id", null);
      const { data: pipeRows } = await pipeQ;
      const pipeMap = new Map<string, string[]>();
      (pipeRows || []).forEach((p: any) => {
        const arr = pipeMap.get(p.user_id) || [];
        arr.push(p.pipeline_id);
        pipeMap.set(p.user_id, arr);
      });

      const users = (rows || []).map((r) => {
        const sigRole = sigMap.get(r.user_id);
        const access_level: AccessLevel = r.is_account_admin
          ? "administracao"
          : (sigRole &&
              ["supervisor", "coordenador", "diretor"].includes(sigRole))
          ? "supervisao"
          : "atendimento";
        return {
          ...r,
          profile: profMap.get(r.user_id) || null,
          access_level,
          pipeline_ids: pipeMap.get(r.user_id) || [],
        };
      });
      return json({ users, scope });
    }

    // ─── CREATE ────────────────────────────────────────────────────────────
    if (action === "create") {
      const {
        email,
        name,
        password,
        allowed_pages,
        is_account_admin,
        role_label,
        access_level,
      } = body;
      const level: AccessLevel =
        (["atendimento", "supervisao", "administracao"].includes(access_level))
          ? access_level
          : (is_account_admin ? "administracao" : "atendimento");
      const normalizedEmail = String(email || "").trim().toLowerCase();
      if (!normalizedEmail || !name || !password || password.length < 6) {
        return userError(
          "Informe e-mail, nome e senha (mínimo 6 caracteres).",
          400,
          "invalid_create_payload",
        );
      }
      const pages = Array.isArray(allowed_pages) && allowed_pages.length > 0
        ? allowed_pages
        : ALL_PAGES;
      const isAdmin = level === "administracao";

      // Enforce: Atendimento requires at least 1 pipeline
      if (level === "atendimento") {
        const desired = Array.isArray(body.pipeline_ids)
          ? body.pipeline_ids.filter((v: any) => typeof v === "string" && v)
          : [];
        if (desired.length === 0) {
          return userError(
            "Selecione ao menos 1 funil para membros de Atendimento.",
            400,
            "pipeline_required",
          );
        }
      }

      const existing = await findUserByEmail(adminClient, normalizedEmail);
      const existingAccess = existing
        ? await getScopedAccess(adminClient, existing.id, scope)
        : null;
      if (existing && existingAccess) {
        return userError(
          "Este e-mail já está cadastrado neste escopo. Use Editar no membro existente ou informe outro e-mail.",
          409,
          "member_already_exists",
        );
      }

      let userResult = existing
        ? await adminClient.auth.admin.updateUserById(existing.id, {
          password,
          user_metadata: { display_name: name },
        })
        : await adminClient.auth.admin.createUser({
          email: normalizedEmail,
          password,
          email_confirm: true,
          user_metadata: { display_name: name },
        });

      // Recovery: se createUser falhar porque o e-mail já existe (mesmo não localizado antes),
      // tenta encontrar o usuário e atualiza a senha no lugar.
      if (!existing && (userResult.error || !userResult.data.user)) {
        const rawMsg = errorMessage(userResult.error, "");
        const looksDuplicate = /already|registered|exists|duplicate/i.test(
          rawMsg,
        );
        if (looksDuplicate) {
          const retryFound = await findUserByEmail(adminClient, normalizedEmail);
          if (retryFound) {
            userResult = await adminClient.auth.admin.updateUserById(
              retryFound.id,
              { password, user_metadata: { display_name: name } },
            );
          }
        }
      }

      if (userResult.error || !userResult.data.user) {
        const raw = errorMessage(userResult.error, "Falha ao criar usuário");
        console.error("[manage-account-user] auth_user_error", raw);
        return userError(raw, 400, "auth_user_error");
      }
      const newUser = userResult.data.user;

      const { error: profileError } = await adminClient.from("profiles").upsert(
        {
          user_id: newUser.id,
          email: normalizedEmail,
          display_name: name,
          role_label: role_label || null,
          is_active: true,
        },
        { onConflict: "user_id" },
      );
      if (profileError) {
        return userError(
          errorMessage(profileError, "Falha ao salvar o perfil"),
          400,
          "profile_save_error",
        );
      }

      const accessPayload: any = {
        user_id: newUser.id,
        owner_id: scope.owner_id,
        sub_company_id: scope.sub_company_id,
        allowed_pages: pages,
        is_account_admin: isAdmin,
        created_by: caller.user.id,
        updated_at: new Date().toISOString(),
      };
      try {
        await upsertScopedAccess(
          adminClient,
          accessPayload,
          existingAccess?.id,
        );
      } catch (accessError) {
        return userError(
          errorMessage(accessError, "Falha ao salvar permissões do membro"),
          400,
          "access_save_error",
        );
      }

      await applyAccessLevel(adminClient, newUser.id, scope, level);

      let pipelineChange: { from: string[]; to: string[] } | null = null;
      try {
        pipelineChange = await syncPipelineAssignments(
          adminClient, newUser.id, scope, body.pipeline_ids, caller.user.id,
        );
      } catch (pipeErr: any) {
        return userError(
          errorMessage(pipeErr, "Falha ao atribuir funis"),
          400,
          "pipeline_assign_error",
        );
      }

      await logAudit(adminClient, {
        action: "create",
        userId: newUser.id,
        label: `${name} <${normalizedEmail}>`,
        changes: {
          email: normalizedEmail,
          display_name: name,
          role_label,
          access_level: level,
          is_account_admin: isAdmin,
          ...(pipelineChange ? { pipeline_ids: pipelineChange } : {}),
        },
        changedBy: caller.user.id,
        scope,
      });

      return json({ ok: true, user_id: newUser.id });
    }

    // ─── UPDATE ────────────────────────────────────────────────────────────
    if (action === "update") {
      const {
        user_id,
        name,
        password,
        allowed_pages,
        is_account_admin,
        is_active,
        phone,
        role_label,
        access_level,
      } = body;
      if (!user_id) return userError("user_id é obrigatório.", 400, "missing_user_id");

      const target = await getScopedAccess(adminClient, user_id, scope);
      if (!target) {
        return userError("Este usuário não pertence ao seu escopo.", 403, "not_in_scope");
      }

      const { data: beforeProfile } = await adminClient.from("profiles").select(
        "display_name, role_label, phone, is_active, email",
      ).eq("user_id", user_id).maybeSingle();

      // Compute previous access_level from current signature roles + is_account_admin
      let beforeSigQ = adminClient
        .from("user_signature_roles")
        .select("role")
        .eq("user_id", user_id)
        .eq("owner_id", scope.owner_id);
      if (scope.sub_company_id) {
        beforeSigQ = beforeSigQ.eq("sub_company_id", scope.sub_company_id);
      } else beforeSigQ = beforeSigQ.is("sub_company_id", null);
      const { data: beforeSigs } = await beforeSigQ;
      const hadSupervisor = (beforeSigs || []).some((s: any) =>
        ["supervisor", "coordenador", "diretor"].includes(s.role)
      );
      const prevLevel: AccessLevel = target.is_account_admin
        ? "administracao"
        : hadSupervisor
        ? "supervisao"
        : "atendimento";

      const level: AccessLevel | null =
        (["atendimento", "supervisao", "administracao"].includes(access_level))
          ? access_level as AccessLevel
          : null;
      const nextIsAdmin = level
        ? (level === "administracao")
        : (typeof is_account_admin === "boolean"
          ? is_account_admin
          : target.is_account_admin);
      const nextLevel: AccessLevel = level ?? prevLevel;

      if (password && password.length >= 6) {
        const { error: passwordError } = await adminClient.auth.admin
          .updateUserById(user_id, { password });
        if (passwordError) {
          return userError(
            errorMessage(passwordError, "Falha ao atualizar senha"),
            400,
            "password_update_error",
          );
        }
      }

      // Email change — restricted to the platform owner (app_role='admin').
      let emailChanged: { from: string | null; to: string } | null = null;
      const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (rawEmail && rawEmail !== (beforeProfile?.email || "").toLowerCase()) {
        const { data: isPlatformAdmin } = await adminClient.rpc("has_role", {
          _user_id: caller.user.id,
          _role: "admin",
        });
        if (!isPlatformAdmin) {
          return userError(
            "Apenas o dono da plataforma pode alterar o e-mail de um usuário.",
            403,
            "email_change_forbidden",
          );
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
          return userError("E-mail inválido.", 400, "invalid_email");
        }
        const conflict = await findUserByEmail(adminClient, rawEmail);
        if (conflict && conflict.id !== user_id) {
          return userError(
            "Este e-mail já pertence a outro usuário.",
            409,
            "email_already_used",
          );
        }
        const { error: emailError } = await adminClient.auth.admin
          .updateUserById(user_id, { email: rawEmail, email_confirm: true });
        if (emailError) {
          return userError(
            errorMessage(emailError, "Falha ao atualizar e-mail"),
            400,
            "email_update_error",
          );
        }
        await adminClient.from("profiles").update({ email: rawEmail }).eq(
          "user_id",
          user_id,
        );
        emailChanged = { from: beforeProfile?.email ?? null, to: rawEmail };
      }
      const profileUpdate: any = {};
      if (typeof name === "string") profileUpdate.display_name = name;
      if (typeof phone === "string") profileUpdate.phone = phone;
      if (typeof role_label === "string") profileUpdate.role_label = role_label;
      if (typeof is_active === "boolean") profileUpdate.is_active = is_active;
      if (Object.keys(profileUpdate).length > 0) {
        const { error: profileError } = await adminClient.from("profiles")
          .update(profileUpdate).eq("user_id", user_id);
        if (profileError) {
          return userError(
            errorMessage(profileError, "Falha ao atualizar perfil"),
            400,
            "profile_update_error",
          );
        }
      }

      const accessUpdate: any = { updated_at: new Date().toISOString() };
      if (Array.isArray(allowed_pages)) {
        accessUpdate.allowed_pages = allowed_pages;
      }
      accessUpdate.is_account_admin = nextIsAdmin;
      const { error: accessUpdateError } = await adminClient.from(
        "user_account_access",
      ).update(accessUpdate).eq("id", target.id);
      if (accessUpdateError) {
        return userError(
          errorMessage(accessUpdateError, "Falha ao atualizar permissões"),
          400,
          "access_update_error",
        );
      }

      if (level) await applyAccessLevel(adminClient, user_id, scope, level);

      let pipelineChange: { from: string[]; to: string[] } | null = null;
      try {
        pipelineChange = await syncPipelineAssignments(
          adminClient, user_id, scope, body.pipeline_ids, caller.user.id,
        );
      } catch (pipeErr: any) {
        return userError(
          errorMessage(pipeErr, "Falha ao atribuir funis"),
          400,
          "pipeline_assign_error",
        );
      }

      // Diff for audit — only record fields that actually changed. Skip irrelevant fields.
      const diff: Record<string, { from: any; to: any }> = {};
      const trackProfile: Array<keyof typeof profileUpdate> = [
        "display_name",
        "role_label",
        "phone",
        "is_active",
      ];
      trackProfile.forEach((k) => {
        if (profileUpdate[k] === undefined) return;
        const prev = (beforeProfile as any)?.[k] ?? null;
        const next = profileUpdate[k] ?? null;
        if (JSON.stringify(prev) !== JSON.stringify(next)) {
          diff[k as string] = { from: prev, to: next };
        }
      });
      if (Array.isArray(allowed_pages)) {
        const prevPages = [...(target.allowed_pages || [])].sort();
        const nextPages = [...allowed_pages].sort();
        if (JSON.stringify(prevPages) !== JSON.stringify(nextPages)) {
          diff.allowed_pages = {
            from: target.allowed_pages || [],
            to: allowed_pages,
          };
        }
      }
      if (nextIsAdmin !== target.is_account_admin) {
        diff.is_account_admin = {
          from: target.is_account_admin,
          to: nextIsAdmin,
        };
      }
      if (nextLevel !== prevLevel) {
        diff.access_level = { from: prevLevel, to: nextLevel };
      }
      if (password && password.length >= 6) {
        diff.password = { from: "••••", to: "•••• (alterada)" };
      }
      if (emailChanged) {
        diff.email = emailChanged;
      }
      if (pipelineChange) {
        diff.pipeline_ids = pipelineChange;
      }

      if (Object.keys(diff).length > 0) {
        await logAudit(adminClient, {
          action: "update",
          userId: user_id,
          label: `${
            profileUpdate.display_name || beforeProfile?.display_name ||
            beforeProfile?.email || user_id
          }`,
          changes: diff,
          changedBy: caller.user.id,
          scope,
        });
      }
      return json({ ok: true });
    }

    // ─── DELETE ────────────────────────────────────────────────────────────
    if (action === "delete") {
      const { user_id } = body;
      if (!user_id) return userError("user_id é obrigatório.", 400, "missing_user_id");
      if (user_id === caller.user.id) {
        return userError(
          "Você não pode remover a si mesmo. Peça a outro administrador.",
          400,
          "cannot_delete_self",
        );
      }

      const target = await getScopedAccess(adminClient, user_id, scope);
      if (!target) {
        return userError("Este usuário não pertence ao seu escopo.", 403, "not_in_scope");
      }

      const { data: beforeProfile } = await adminClient.from("profiles").select(
        "display_name, email",
      ).eq("user_id", user_id).maybeSingle();

      const { error: deleteAccessError } = await adminClient.from(
        "user_account_access",
      ).delete().eq("id", target.id);
      if (deleteAccessError) {
        return userError(
          errorMessage(deleteAccessError, "Falha ao remover acesso"),
          400,
          "access_delete_error",
        );
      }

      // Clean up pipeline assignments in this scope
      let pipeDel = adminClient.from("user_pipeline_assignments").delete()
        .eq("user_id", user_id).eq("owner_id", scope.owner_id);
      if (scope.sub_company_id) pipeDel = pipeDel.eq("sub_company_id", scope.sub_company_id);
      else pipeDel = pipeDel.is("sub_company_id", null);
      await pipeDel;

      let sigDel = adminClient.from("user_signature_roles").delete().eq(
        "user_id",
        user_id,
      ).eq("owner_id", scope.owner_id);
      if (scope.sub_company_id) {
        sigDel = sigDel.eq("sub_company_id", scope.sub_company_id);
      } else sigDel = sigDel.is("sub_company_id", null);
      const { error: sigDeleteError } = await sigDel;
      if (sigDeleteError) {
        return userError(
          errorMessage(sigDeleteError, "Falha ao remover nível de acesso"),
          400,
          "signature_role_delete_error",
        );
      }

      const { data: stillHas } = await adminClient.from("user_account_access")
        .select("id").eq("user_id", user_id).limit(1);
      if (!stillHas || stillHas.length === 0) {
        await adminClient.from("user_roles").delete().eq("user_id", user_id);
        await adminClient.from("profiles").delete().eq("user_id", user_id);
        await adminClient.auth.admin.deleteUser(user_id);
      }

      await logAudit(adminClient, {
        action: "delete",
        userId: user_id,
        label: `${
          beforeProfile?.display_name || beforeProfile?.email || user_id
        }`,
        changes: { removed: true, email: beforeProfile?.email },
        changedBy: caller.user.id,
        scope,
      });

      return json({ ok: true });
    }

    return userError("Ação desconhecida.", 400, "unknown_action");
  } catch (error: any) {
    console.error(
      "[manage-account-user] fatal",
      error?.stack || error?.message || error,
    );
    return userError(
      String(error?.message || error) || "Erro interno do servidor",
      500,
      "internal_error",
    );
  }
});
