# Credenciamento biométrico (WebAuthn / Passkeys)

> Status: **PARCIAL**. Persistência de credenciais e desafios está pronta no
> backend (tabelas `webauthn_credentials` e `webauthn_challenges` com RLS).
> A verificação criptográfica de assinatura ainda é **stub** — antes de
> liberar para produção, ligue o endpoint a uma biblioteca WebAuthn
> (recomendado: [`@simplewebauthn/server`](https://simplewebauthn.dev)).

O que já funciona:

- Cadastro e listagem de passkeys no perfil do usuário (tela Meu Perfil →
  "Acesso biométrico").
- RLS garantindo que cada usuário só veja/edite/remova as próprias
  credenciais. `webauthn_challenges` é server-only (sem policies para
  `authenticated`).
- Helpers cliente em `src/lib/webauthn.ts`:
  `registerBiometric`, `authenticateBiometric`, `listMyBiometricCredentials`,
  `renameBiometricCredential`, `deleteBiometricCredential`,
  `isPlatformAuthenticatorAvailable`, `describeWebAuthnError`.
- Edge function `webauthn` (Lovable Cloud) com 7 ações:
  `register/begin`, `register/complete`, `auth/begin`, `auth/complete`,
  `list`, `rename`, `delete`.


- Edge function `webauthn` (Lovable Cloud) com os 4 endpoints exigidos pelo
  navegador.
- Helpers cliente em `src/lib/webauthn.ts` (`registerBiometric`,
  `authenticateBiometric`, `isPlatformAuthenticatorAvailable`).

A página externa `auth.leadseller.com.br` pode consumir os helpers acima ou,
se preferir, falar direto com a edge function.

---

## URL base

```
POST https://<PROJECT_REF>.functions.supabase.co/webauthn
Content-Type: application/json
```

Todo request envia `{ "action": "<nome>", ... }`. Não exige `Authorization`
no fluxo de login (registro pode/deve exigir um usuário já autenticado).

## Endpoints

### 1. `register/begin`
Inicia o cadastro de uma nova credencial (passkey/biometria).

**Body**
```json
{
  "action": "register/begin",
  "rp_id": "auth.leadseller.com.br",
  "rp_name": "Lead Seller",
  "origin": "https://auth.leadseller.com.br",
  "user_id": "uuid-do-usuario",
  "user_name": "usuario@empresa.com",
  "user_display_name": "Fulano da Silva"
}
```

**Resposta** — `publicKey` é passado direto para
`navigator.credentials.create({ publicKey })` (`challenge` e `user.id` vêm
em base64url e devem ser decodificados para `ArrayBuffer`).

```json
{
  "stub": true,
  "publicKey": {
    "challenge": "...",
    "rp": { "id": "auth.leadseller.com.br", "name": "Lead Seller" },
    "user": { "id": "...", "name": "...", "displayName": "..." },
    "pubKeyCredParams": [{ "type": "public-key", "alg": -7 }, { "type": "public-key", "alg": -257 }],
    "timeout": 60000,
    "attestation": "none",
    "authenticatorSelection": { "residentKey": "preferred", "userVerification": "required" }
  }
}
```

### 2. `register/complete`
Recebe o resultado de `navigator.credentials.create` e (no futuro) persiste
o `credentialID`, a chave pública e o counter.

**Body**
```json
{
  "action": "register/complete",
  "rp_id": "auth.leadseller.com.br",
  "user_id": "uuid-do-usuario",
  "credential": {
    "id": "...",
    "rawId": "<base64url>",
    "type": "public-key",
    "response": {
      "clientDataJSON": "<base64url>",
      "attestationObject": "<base64url>"
    }
  }
}
```

### 3. `auth/begin`
Solicita um desafio para login biométrico.

**Body**
```json
{
  "action": "auth/begin",
  "rp_id": "auth.leadseller.com.br",
  "email": "usuario@empresa.com"
}
```

**Resposta** — `publicKey` vai para `navigator.credentials.get({ publicKey })`.

### 4. `auth/complete`
Recebe a `assertion` do navegador. Quando a verificação for implementada,
deve retornar `session_token` (JWT) que a página externa repassa para o
fluxo de redirecionamento já existente.

**Body**
```json
{
  "action": "auth/complete",
  "rp_id": "auth.leadseller.com.br",
  "email": "usuario@empresa.com",
  "credential": {
    "id": "...",
    "rawId": "<base64url>",
    "type": "public-key",
    "response": {
      "clientDataJSON": "<base64url>",
      "authenticatorData": "<base64url>",
      "signature": "<base64url>",
      "userHandle": "<base64url|null>"
    }
  }
}
```

**Resposta atual (stub)**
```json
{ "stub": true, "ok": true, "session_token": null, "note": "..." }
```

---

## TODOs para produção

1. Tabela `webauthn_credentials` (`user_id`, `credential_id` unique,
   `public_key` bytea, `counter` bigint, `transports` text[], `created_at`).
2. Tabela `webauthn_challenges` (`user_id` opcional, `challenge` text,
   `expires_at`, `purpose` ['register'|'auth']) — expirar em 60s.
3. Substituir os stubs por chamadas a `@simplewebauthn/server`:
   - `generateRegistrationOptions` / `verifyRegistrationResponse`
   - `generateAuthenticationOptions` / `verifyAuthenticationResponse`
4. Validar `origin` e `rpId` contra uma allowlist
   (`auth.leadseller.com.br`, `*.leadseller.com.br`).
5. Em `auth/complete`, emitir o mesmo formato de token que o login por
   email/senha hoje devolve para `connecto-center` / `leadseller.com.br`.

## Exemplo de uso (helpers prontos)

### Cadastro (Meu Perfil → Acesso biométrico)
Já implementado em `src/components/settings/BiometricCredentialsCard.tsx`.

### Login com fallback automático para senha
Use este snippet na página externa `auth.leadseller.com.br`:

```ts
import {
  isWebAuthnAvailable,
  isPlatformAuthenticatorAvailable,
  authenticateBiometric,
} from '@/lib/webauthn';

async function loginWithBiometricFallback(email: string, passwordPrompt: () => Promise<string>) {
  // 1) Tenta biometria primeiro se houver suporte.
  if (isWebAuthnAvailable() && (await isPlatformAuthenticatorAvailable())) {
    const r = await authenticateBiometric(email);
    if (r.ok && r.session_token) {
      return { method: 'biometric', token: r.session_token };
    }
    if (!r.fallback_to_password) {
      throw new Error(r.error || 'Falha na biometria');
    }
    // Mostra ao usuário a razão antes de pedir a senha:
    toast.info('Biometria indisponível', { description: r.error });
  }

  // 2) Fallback: pede a senha como já é feito hoje.
  const password = await passwordPrompt();
  const { data, error } = await supabase.functions.invoke('authenticate', {
    body: { email, password },
  });
  if (error) throw error;
  return { method: 'password', token: data.session_token };
}
```

Mensagens de erro padronizadas (em PT-BR) são geradas por
`describeWebAuthnError(err)` — use-as ao montar toasts no front-end externo.

### Razões comuns para cair no fallback de senha
| Sinal                         | Significado                          |
| ----------------------------- | ------------------------------------ |
| `fallback_to_password: true` + `no_credentials` | E-mail não tem passkey cadastrada |
| `NotAllowed` / `AbortError`   | Usuário cancelou ou expirou          |
| `SecurityError`               | RP ID/origin não autorizado          |
| `NotSupported`                | Dispositivo sem leitor compatível    |

