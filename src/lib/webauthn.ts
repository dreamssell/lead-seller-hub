// WebAuthn client helpers (Passkey / Face ID / Touch ID / Windows Hello).
//
// Use these from the external auth.leadseller.com.br page (or any browser
// context) to enroll and verify biometric credentials. They talk to the
// `webauthn` Lovable edge function, which is currently a STUB — see
// docs/WEBAUTHN.md for the server contract you still need to implement.

import { supabase } from '@/integrations/supabase/client';

/** Is WebAuthn available in this browser? */
export const isWebAuthnAvailable = () =>
  typeof window !== 'undefined' && !!window.PublicKeyCredential;

/** Does the device expose a platform authenticator (Face ID, Touch ID, Windows Hello)? */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnAvailable()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// ---------- base64url <-> ArrayBuffer ---------------------------------------
const b64urlToBuf = (s: string): ArrayBuffer => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
};

const bufToB64url = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

const decodeCredentialResponse = (cred: PublicKeyCredential): unknown => {
  const r = cred.response as AuthenticatorAttestationResponse & AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: bufToB64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bufToB64url(r.clientDataJSON),
      attestationObject: r.attestationObject ? bufToB64url(r.attestationObject) : undefined,
      authenticatorData: r.authenticatorData ? bufToB64url(r.authenticatorData) : undefined,
      signature: r.signature ? bufToB64url(r.signature) : undefined,
      userHandle: r.userHandle ? bufToB64url(r.userHandle) : undefined,
    },
  };
};

// ---------- Public API ------------------------------------------------------

export interface BiometricUser {
  user_id: string;
  user_name: string;
  user_display_name?: string;
}

export async function registerBiometric(user: BiometricUser): Promise<{
  ok: boolean;
  stub?: boolean;
  error?: string;
}> {
  if (!isWebAuthnAvailable()) return { ok: false, error: 'WebAuthn não suportado neste navegador.' };

  const begin = await supabase.functions.invoke('webauthn', {
    body: {
      action: 'register/begin',
      rp_id: window.location.hostname,
      origin: window.location.origin,
      ...user,
    },
  });
  if (begin.error || !begin.data?.publicKey) {
    return { ok: false, error: begin.error?.message || 'Falha ao iniciar o registro.' };
  }
  const pk = begin.data.publicKey;
  const options: PublicKeyCredentialCreationOptions = {
    ...pk,
    challenge: b64urlToBuf(pk.challenge),
    user: { ...pk.user, id: b64urlToBuf(pk.user.id) },
  };

  let cred: PublicKeyCredential;
  try {
    cred = (await navigator.credentials.create({ publicKey: options })) as PublicKeyCredential;
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Usuário cancelou o registro biométrico.' };
  }

  const complete = await supabase.functions.invoke('webauthn', {
    body: {
      action: 'register/complete',
      rp_id: window.location.hostname,
      origin: window.location.origin,
      user_id: user.user_id,
      credential: decodeCredentialResponse(cred),
    },
  });
  if (complete.error) return { ok: false, error: complete.error.message };
  return { ok: !!complete.data?.ok, stub: !!complete.data?.stub };
}

export async function authenticateBiometric(email?: string): Promise<{
  ok: boolean;
  stub?: boolean;
  session_token?: string | null;
  error?: string;
}> {
  if (!isWebAuthnAvailable()) return { ok: false, error: 'WebAuthn não suportado neste navegador.' };

  const begin = await supabase.functions.invoke('webauthn', {
    body: {
      action: 'auth/begin',
      rp_id: window.location.hostname,
      origin: window.location.origin,
      email,
    },
  });
  if (begin.error || !begin.data?.publicKey) {
    return { ok: false, error: begin.error?.message || 'Falha ao iniciar autenticação.' };
  }
  const pk = begin.data.publicKey;
  const options: PublicKeyCredentialRequestOptions = {
    ...pk,
    challenge: b64urlToBuf(pk.challenge),
    allowCredentials: (pk.allowCredentials ?? []).map((c: any) => ({
      ...c,
      id: b64urlToBuf(c.id),
    })),
  };

  let cred: PublicKeyCredential;
  try {
    cred = (await navigator.credentials.get({ publicKey: options })) as PublicKeyCredential;
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Autenticação biométrica cancelada.' };
  }

  const complete = await supabase.functions.invoke('webauthn', {
    body: {
      action: 'auth/complete',
      rp_id: window.location.hostname,
      origin: window.location.origin,
      email,
      credential: decodeCredentialResponse(cred),
    },
  });
  if (complete.error) return { ok: false, error: complete.error.message };
  return {
    ok: !!complete.data?.ok,
    stub: !!complete.data?.stub,
    session_token: complete.data?.session_token ?? null,
  };
}
