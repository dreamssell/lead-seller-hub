// WebAuthn (Passkey / Face ID / Fingerprint) STUB endpoints.
//
// ⚠️  THIS IS A SCAFFOLD — NOT PRODUCTION READY.
// The browser flow (navigator.credentials.create / .get) works against these
// endpoints, but the server side does NOT verify attestation/assertion
// signatures and does NOT persist credentials. Wire it to a real WebAuthn
// library (e.g. @simplewebauthn/server) before exposing to users.
//
// Endpoints (POST { action, ... }):
//   - register/begin     -> returns PublicKeyCredentialCreationOptions JSON
//   - register/complete  -> receives attestation; would persist credential
//   - auth/begin         -> returns PublicKeyCredentialRequestOptions JSON
//   - auth/complete      -> receives assertion; would issue a session
//
// See docs/WEBAUTHN.md for the contract the external auth.leadseller.com.br
// page must follow.

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

// base64url helpers
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
  action: "register/begin" | "register/complete" | "auth/begin" | "auth/complete";
  // Common
  rp_id?: string; // e.g. "auth.leadseller.com.br"
  rp_name?: string; // e.g. "Lead Seller"
  origin?: string; // e.g. "https://auth.leadseller.com.br"
  // Register
  user_id?: string;
  user_name?: string;
  user_display_name?: string;
  // Auth
  email?: string;
  // Complete (raw browser payloads)
  credential?: unknown;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  if (!body?.action) return json({ error: "missing_action" }, 400);

  const rpId = body.rp_id ?? "auth.leadseller.com.br";
  const rpName = body.rp_name ?? "Lead Seller";

  // --- REGISTRATION -----------------------------------------------------------
  if (body.action === "register/begin") {
    if (!body.user_id || !body.user_name) {
      return json({ error: "missing_user_fields" }, 400);
    }
    const challenge = randomChallenge();
    // TODO: persist { user_id, challenge, expires_at } in a server-side store.
    return json({
      stub: true,
      publicKey: {
        challenge,
        rp: { id: rpId, name: rpName },
        user: {
          id: b64url(new TextEncoder().encode(body.user_id)),
          name: body.user_name,
          displayName: body.user_display_name ?? body.user_name,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },   // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        timeout: 60_000,
        attestation: "none",
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "required",
          // Empty/omitted = both platform (Face/Touch ID) and roaming keys allowed.
        },
      },
    });
  }

  if (body.action === "register/complete") {
    if (!body.credential) return json({ error: "missing_credential" }, 400);
    // TODO: verify attestation with a WebAuthn library, look up stored
    // challenge, and persist credential id + public key + counter for this user.
    console.log("[webauthn] register/complete stub", { rpId, hasCred: !!body.credential });
    return json({
      stub: true,
      ok: true,
      note: "Credential RECEIVED but NOT verified. Implement @simplewebauthn/server.",
    });
  }

  // --- AUTHENTICATION ---------------------------------------------------------
  if (body.action === "auth/begin") {
    const challenge = randomChallenge();
    // TODO: look up credential ids registered for this user/email and return
    // them in allowCredentials. Persist the challenge per session.
    return json({
      stub: true,
      publicKey: {
        challenge,
        rpId,
        timeout: 60_000,
        userVerification: "required",
        allowCredentials: [], // empty = discoverable credential / resident key flow
      },
    });
  }

  if (body.action === "auth/complete") {
    if (!body.credential) return json({ error: "missing_credential" }, 400);
    // TODO: verify assertion signature, counter, and origin; then mint a
    // session JWT for the external auth page to forward to the platform.
    console.log("[webauthn] auth/complete stub", { rpId, hasCred: !!body.credential });
    return json({
      stub: true,
      ok: true,
      session_token: null,
      note: "Assertion RECEIVED but NOT verified. Implement @simplewebauthn/server and return a real session token.",
    });
  }

  return json({ error: "invalid_action" }, 400);
});
