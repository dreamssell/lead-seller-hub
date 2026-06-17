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
  friendly_name?: string;
}

/** Translate a browser/server error into a friendly Portuguese message. */
export function describeWebAuthnError(err: unknown): string {
  const msg = (err as any)?.message ?? String(err ?? '');
  if (/NotAllowed/i.test(msg)) return 'Autenticação cancelada ou tempo esgotado.';
  if (/SecurityError/i.test(msg))
    return 'Erro de segurança: o domínio não está autorizado a usar biometria aqui.';
  if (/InvalidState/i.test(msg))
    return 'Esta biometria já está cadastrada para sua conta.';
  if (/NotSupported/i.test(msg))
    return 'Este dispositivo não tem leitor biométrico compatível.';
  if (/AbortError/i.test(msg)) return 'Operação cancelada.';
  return msg || 'Falha desconhecida na biometria.';
}

export async function registerBiometric(user: BiometricUser): Promise<{
  ok: boolean;
  stub?: boolean;
  error?: string;
}> {
  if (!isWebAuthnAvailable())
    return { ok: false, error: 'WebAuthn não suportado neste navegador.' };

  const begin = await supabase.functions.invoke('webauthn', {
    body: {
      action: 'register/begin',
      rp_id: window.location.hostname,
      origin: window.location.origin,
      user_id: user.user_id,
      user_name: user.user_name,
      user_display_name: user.user_display_name,
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
    excludeCredentials: (pk.excludeCredentials ?? []).map((c: any) => ({
      ...c,
      id: b64urlToBuf(c.id),
    })),
  };

  let cred: PublicKeyCredential;
  try {
    cred = (await navigator.credentials.create({ publicKey: options })) as PublicKeyCredential;
  } catch (e) {
    return { ok: false, error: describeWebAuthnError(e) };
  }

  const complete = await supabase.functions.invoke('webauthn', {
    body: {
      action: 'register/complete',
      rp_id: window.location.hostname,
      origin: window.location.origin,
      user_id: user.user_id,
      friendly_name: user.friendly_name,
      credential: decodeCredentialResponse(cred),
    },
  });
  if (complete.error) return { ok: false, error: complete.error.message };
  return { ok: !!complete.data?.ok, stub: !!complete.data?.stub_verification };
}

export async function authenticateBiometric(email?: string): Promise<{
  ok: boolean;
  stub?: boolean;
  session_token?: string | null;
  user_id?: string;
  error?: string;
  /** True when the user should fall back to password (no creds, unsupported, etc.). */
  fallback_to_password?: boolean;
}> {
  if (!isWebAuthnAvailable())
    return {
      ok: false,
      fallback_to_password: true,
      error: 'WebAuthn não suportado neste navegador. Use senha.',
    };

  const begin = await supabase.functions.invoke('webauthn', {
    body: {
      action: 'auth/begin',
      rp_id: window.location.hostname,
      origin: window.location.origin,
      email,
    },
  });
  // Edge function returns 404 + { error: 'no_credentials' } when the email has
  // no passkeys — surface that as a fallback rather than a hard error.
  if (begin.data?.error === 'no_credentials') {
    return {
      ok: false,
      fallback_to_password: true,
      error: begin.data?.hint || 'Nenhuma biometria cadastrada para este e-mail.',
    };
  }
  if (begin.error || !begin.data?.publicKey) {
    return {
      ok: false,
      fallback_to_password: true,
      error: begin.error?.message || 'Falha ao iniciar autenticação biométrica.',
    };
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
  } catch (e) {
    return {
      ok: false,
      fallback_to_password: true,
      error: describeWebAuthnError(e),
    };
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
  if (complete.error)
    return { ok: false, fallback_to_password: true, error: complete.error.message };
  if (complete.data?.error)
    return {
      ok: false,
      fallback_to_password: true,
      error: complete.data?.hint || complete.data?.error,
    };
  return {
    ok: !!complete.data?.ok,
    stub: !!complete.data?.stub_verification,
    session_token: complete.data?.session_token ?? null,
    user_id: complete.data?.user_id,
  };
}

export interface StoredCredential {
  id: string;
  credential_id: string;
  friendly_name: string;
  device_type: string | null;
  backed_up: boolean;
  transports: string[];
  last_used_at: string | null;
  created_at: string;
}

export async function listMyBiometricCredentials(): Promise<StoredCredential[]> {
  const { data, error } = await supabase.functions.invoke('webauthn', {
    body: { action: 'list' },
  });
  if (error || !data?.ok) return [];
  return (data.credentials ?? []) as StoredCredential[];
}

export async function renameBiometricCredential(id: string, name: string) {
  return supabase.functions.invoke('webauthn', {
    body: { action: 'rename', credential_db_id: id, friendly_name: name },
  });
}

export async function deleteBiometricCredential(id: string) {
  return supabase.functions.invoke('webauthn', {
    body: { action: 'delete', credential_db_id: id },
  });
}

