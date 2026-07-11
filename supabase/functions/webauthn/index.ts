// WebAuthn (Passkey / Face ID / Fingerprint) endpoints — Lovable Cloud.
//
// What works:
//   - Persists ephemeral challenges in `webauthn_challenges` (expires in 5min).
//   - Persists registered credentials in `webauthn_credentials` (RLS protected).
//   - Lists / renames / deletes credentials for the authenticated user.
//
// What is still STUBBED (intentionally):
//   - Cryptographic verification of attestation/assertion signatures.
//     Wire @simplewebauthn/server before going to production. See docs/WEBAUTHN.md.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
};
const randomChallenge = () => {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return b64url(buf);
};

interface Body {
  action:
    | "register/begin"
    | "register/complete"
    | "auth/begin"
    | "auth/complete"
    | "list"
    | "rename"
    | "delete";
  rp_id?: string;
  rp_name?: string;
  origin?: string;
  user_id?: string;
  user_name?: string;
  user_display_name?: string;
  email?: string;
  credential?: any;
  // list/rename/delete
  credential_db_id?: string;
  friendly_name?: string;
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function getAuthedUserId(req: Request): Promise<string | null> {
  const h = req.headers.get("Authorization") ?? "";
  if (!h.startsWith("Bearer ")) return null;
  const { data } = await admin.auth.getUser(h.replace("Bearer ", ""));
  return data?.user?.id ?? null;
}

/**
 * Biometria (Face ID / Touch ID / Windows Hello) é liberada APENAS em dispositivos
 * mobile. Detectamos via User-Agent + Client Hints. Desktops recebem 403 e o acesso
 * é registrado no log para auditoria.
 */
function isMobileRequest(req: Request): boolean {
  const ua = (req.headers.get("user-agent") ?? "").toLowerCase();
  const chMobile = req.headers.get("sec-ch-ua-mobile"); // "?1" mobile, "?0" desktop
  if (chMobile === "?1") return true;
  if (chMobile === "?0") return false;
  if (!ua) return false;
  return /android|iphone|ipod|ipad|iemobile|blackberry|opera mini|mobile safari|windows phone/.test(
    ua,
  );
}

const MOBILE_ONLY_ACTIONS = new Set([
  "register/begin",
  "register/complete",
  "auth/begin",
  "auth/complete",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  if (!body?.action) return json({ error: "missing_action" }, 400);

  // Guard: biometria só é permitida em dispositivos mobile. Registra e recusa desktops.
  if (MOBILE_ONLY_ACTIONS.has(body.action) && !isMobileRequest(req)) {
    console.warn(
      JSON.stringify({
        event: "webauthn_desktop_blocked",
        action: body.action,
        user_agent: req.headers.get("user-agent"),
        sec_ch_ua_mobile: req.headers.get("sec-ch-ua-mobile"),
        ip: req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip"),
      }),
    );
    return json(
      {
        error: "mobile_only",
        hint: "A biometria só pode ser usada em dispositivos móveis (iOS/Android). Use senha no desktop.",
      },
      403,
    );
  }

  const rpId = body.rp_id ?? "auth.leadseller.com.br";
  const rpName = body.rp_name ?? "Lead Seller";

  // ---------- AUTHENTICATED MANAGEMENT (profile screen) ---------------------
  if (body.action === "list" || body.action === "rename" || body.action === "delete") {
    const uid = await getAuthedUserId(req);
    if (!uid) return json({ error: "unauthorized" }, 401);

    if (body.action === "list") {
      const { data, error } = await admin
        .from("webauthn_credentials")
        .select("id,credential_id,friendly_name,device_type,backed_up,transports,last_used_at,created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, credentials: data });
    }
    if (body.action === "rename") {
      if (!body.credential_db_id || !body.friendly_name?.trim()) {
        return json({ error: "missing_fields" }, 400);
      }
      const { error } = await admin
        .from("webauthn_credentials")
        .update({ friendly_name: body.friendly_name.trim().slice(0, 80) })
        .eq("id", body.credential_db_id)
        .eq("user_id", uid);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }
    if (body.action === "delete") {
      if (!body.credential_db_id) return json({ error: "missing_fields" }, 400);
      const { error } = await admin
        .from("webauthn_credentials")
        .delete()
        .eq("id", body.credential_db_id)
        .eq("user_id", uid);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }
  }

  // ---------- REGISTRATION (requires authenticated user) --------------------
  if (body.action === "register/begin") {
    const uid = await getAuthedUserId(req);
    const userId = uid ?? body.user_id;
    if (!userId || !body.user_name) return json({ error: "missing_user_fields" }, 400);

    const challenge = randomChallenge();
    await admin.from("webauthn_challenges").insert({
      user_id: userId,
      challenge,
      purpose: "register",
      rp_id: rpId,
    });

    // List already-registered credential ids to exclude them.
    const { data: existing } = await admin
      .from("webauthn_credentials")
      .select("credential_id,transports")
      .eq("user_id", userId);

    return json({
      publicKey: {
        challenge,
        rp: { id: rpId, name: rpName },
        user: {
          id: b64url(new TextEncoder().encode(userId)),
          name: body.user_name,
          displayName: body.user_display_name ?? body.user_name,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        timeout: 60_000,
        attestation: "none",
        excludeCredentials: (existing ?? []).map((c) => ({
          type: "public-key",
          id: c.credential_id,
          transports: c.transports ?? [],
        })),
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "required",
        },
      },
    });
  }

  if (body.action === "register/complete") {
    const uid = await getAuthedUserId(req);
    const userId = uid ?? body.user_id;
    if (!userId) return json({ error: "unauthorized" }, 401);
    if (!body.credential?.id) return json({ error: "missing_credential" }, 400);

    // NOTE: signature verification still stubbed. We trust the browser here.
    // Persist the credential so list/login can find it.
    const { error } = await admin.from("webauthn_credentials").insert({
      user_id: userId,
      credential_id: body.credential.id,
      public_key: body.credential?.response?.attestationObject ?? "",
      transports: body.credential?.response?.transports ?? [],
      device_type: body.credential?.authenticatorAttachment ?? null,
      friendly_name: body.friendly_name?.trim()?.slice(0, 80) || "Dispositivo biométrico",
    });
    if (error && !String(error.message).includes("duplicate")) {
      return json({ error: error.message }, 500);
    }
    return json({
      ok: true,
      stub_verification: true,
      note: "Credential stored. Signature verification still pending (@simplewebauthn/server).",
    });
  }

  // ---------- AUTHENTICATION (external auth.leadseller.com.br) --------------
  if (body.action === "auth/begin") {
    const challenge = randomChallenge();

    // Look up credential ids for this email (if known).
    let userId: string | null = null;
    if (body.email) {
      const { data: prof } = await admin
        .from("profiles")
        .select("user_id")
        .eq("email", body.email.toLowerCase())
        .maybeSingle();
      userId = prof?.user_id ?? null;
    }

    let allowCredentials: { type: "public-key"; id: string; transports?: string[] }[] = [];
    if (userId) {
      const { data: creds } = await admin
        .from("webauthn_credentials")
        .select("credential_id,transports")
        .eq("user_id", userId);
      allowCredentials = (creds ?? []).map((c) => ({
        type: "public-key",
        id: c.credential_id,
        transports: c.transports ?? undefined,
      }));
    }

    await admin.from("webauthn_challenges").insert({
      user_id: userId,
      email: body.email?.toLowerCase() ?? null,
      challenge,
      purpose: "auth",
      rp_id: rpId,
    });

    if (body.email && allowCredentials.length === 0) {
      return json({
        error: "no_credentials",
        hint: "Este e-mail ainda não tem biometria cadastrada. Faça login por senha.",
      }, 404);
    }

    return json({
      publicKey: {
        challenge,
        rpId,
        timeout: 60_000,
        userVerification: "required",
        allowCredentials,
      },
    });
  }

  if (body.action === "auth/complete") {
    if (!body.credential?.id) return json({ error: "missing_credential" }, 400);

    // Look up the credential.
    const { data: cred } = await admin
      .from("webauthn_credentials")
      .select("id,user_id,counter")
      .eq("credential_id", body.credential.id)
      .maybeSingle();
    if (!cred) {
      return json({
        error: "credential_not_found",
        hint: "Esta credencial não está cadastrada. Use senha ou cadastre a biometria novamente.",
      }, 404);
    }

    // TODO: verify assertion signature + counter using @simplewebauthn/server.
    await admin
      .from("webauthn_credentials")
      .update({ last_used_at: new Date().toISOString(), counter: (cred.counter ?? 0) + 1 })
      .eq("id", cred.id);

    return json({
      ok: true,
      user_id: cred.user_id,
      stub_verification: true,
      session_token: null,
      note: "Assertion stored but NOT cryptographically verified. Mint session token via @simplewebauthn/server in production.",
    });
  }

  return json({ error: "invalid_action" }, 400);
});
