# Credenciamento biométrico (WebAuthn / Passkeys)

> Status: **STUB**. O fluxo client-side está pronto; os endpoints do servidor
> recebem e devolvem payloads no formato correto mas **não verificam**
> assinaturas e **não persistem** credenciais. Antes de habilitar para
> usuários reais, finalize a parte do servidor com uma biblioteca WebAuthn
> (recomendado: [`@simplewebauthn/server`](https://simplewebauthn.dev)).

Existem hoje **0 endpoints biométricos prontos** no projeto Lead Seller —
nada de Face ID, Touch ID, Windows Hello ou hardware keys. Para suprir isso
foi adicionado:

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

```ts
import {
  isPlatformAuthenticatorAvailable,
  registerBiometric,
  authenticateBiometric,
} from '@/lib/webauthn';

if (await isPlatformAuthenticatorAvailable()) {
  // Cadastro (usuário já autenticado por outro meio)
  const r = await registerBiometric({
    user_id: currentUser.id,
    user_name: currentUser.email,
    user_display_name: currentUser.name,
  });

  // Login subsequente
  const a = await authenticateBiometric(email);
  if (a.ok && a.session_token) {
    // redirecionar com o token, como já é feito hoje
  }
}
```
