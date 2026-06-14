# Integração de Autenticação — Página Externa de Login ↔ Hub Lead Seller

**Versão:** 1.0
**Data:** 2026-06-14
**Público-alvo:** Equipe de TI / Desenvolvimento responsável pela página externa de login (`https://leadseller.com.br`)
**Objetivo:** Documentar o contrato técnico entre a página externa de credenciamento e a plataforma Hub (`https://hub.leadseller.com.br`), de forma que alterações no site externo **não quebrem** a integração com o backend (Supabase) nem violem as políticas de segurança (RLS) deste projeto.

---

## 1. Visão Geral do Fluxo

```
┌──────────────────────────┐     1. POST /authenticate    ┌──────────────────────────┐
│  Página Externa de Login │ ────────────────────────────▶│  Edge Function           │
│  leadseller.com.br       │   { email, password,         │  authenticate            │
│                          │     api_key }                │  (Supabase / Lovable)    │
└──────────────────────────┘                              └────────────┬─────────────┘
            ▲                                                          │
            │                                                          │ 2. valida api_key
            │                                                          │    valida/provisiona user
            │                                                          │    gera session
            │                                                          ▼
            │                                              ┌──────────────────────────┐
            │  3. Resposta JSON com redirectUrl            │  Supabase Auth           │
            │     OU redirect direto                       │  (auth.users)            │
            │                                              └──────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Browser → hub.leadseller.com.br/auth/callback                           │
│      ?access_token=XXX&refresh_token=YYY                                 │
│                                                                          │
│  AuthCallbackPage chama supabase.auth.setSession(...)                    │
│  e redireciona para "/" (dashboard).                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

**Pontos-chave:**
- A página externa **não acessa diretamente** o banco de dados nem o Supabase.
- Toda autenticação passa pela Edge Function `authenticate`, que é o **único ponto de entrada**.
- A página externa precisa apenas: (a) coletar credenciais, (b) chamar a function, (c) redirecionar o usuário para a `redirectUrl` retornada.

---

## 2. Contrato da Edge Function `authenticate`

### 2.1. Endpoint

```
POST https://<PROJECT-REF>.supabase.co/functions/v1/authenticate
Content-Type: application/json
```

> O Hub fornece a URL completa para a equipe de TI. Não armazenar `PROJECT-REF` em código público no site externo — usar variável de ambiente.

### 2.2. Headers obrigatórios

| Header | Valor |
|--------|-------|
| `Content-Type` | `application/json` |
| `apikey` | Chave **anon/public** do projeto Supabase (fornecida pelo Hub) |
| `Authorization` | `Bearer <ANON_KEY>` (mesma chave acima) |

> ⚠️ **Nunca** usar a `service_role_key` no site externo. Apenas a `anon key` é pública e segura para o navegador.

### 2.3. Body (request)

```json
{
  "email": "usuario@empresa.com.br",
  "password": "senha-em-texto-plano",
  "api_key": "chave-de-api-emitida-pelo-hub"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `email` | string | sim | E-mail do usuário. Normalizado para lowercase pela function. |
| `password` | string | sim | Senha. Mínimo de 6 caracteres para provisionamento de novos usuários. |
| `api_key` | string | sim | Chave de API emitida pelo painel do Hub (tabela `api_keys`). Identifica o site/origem que está autenticando. |

### 2.4. Respostas

#### ✅ Sucesso (HTTP 200)
```json
{
  "success": true,
  "session": {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "v1.M2Q5...",
    "expires_at": 1750000000
  },
  "redirectUrl": "https://hub.leadseller.com.br/auth/callback?access_token=...&refresh_token=..."
}
```

**Ação esperada do site externo:**
- Redirecionar o navegador para `redirectUrl` (`window.location.href = data.redirectUrl`).
- **Não** armazenar os tokens em localStorage/cookies no domínio externo — o Hub cuida disso ao receber o callback.

#### ❌ Falhas previsíveis (HTTP 200 com `success: false`)
Tratar como "credenciais/usuário inválido" e exibir mensagem amigável:

```json
{ "success": false, "error": "Credenciais inválidas" }
{ "success": false, "error": "Usuário não encontrado" }
{ "success": false, "error": "Acesso bloqueado. Contate o administrador." }
{ "success": false, "error": "Acesso desativado. Contate o administrador." }
{ "success": false, "error": "Senha deve ter pelo menos 6 caracteres" }
{ "success": false, "error": "Provisionamento em andamento. Tente novamente." }
```

#### ❌ Erros de autorização/validação
| HTTP | Causa | `error` |
|------|-------|---------|
| 400 | Campos obrigatórios ausentes | `"Email, password e api_key são obrigatórios"` |
| 403 | `api_key` inválida ou inativa | `"Chave de API inválida"` |
| 500 | Erro interno | `"Erro interno do servidor"` |

---

## 3. Página de Callback no Hub

URL: `https://hub.leadseller.com.br/auth/callback`

Recebe `access_token` e `refresh_token` via query string e chama `supabase.auth.setSession(...)`. Em caso de sucesso, redireciona para `/` (dashboard). Em caso de falha, exibe mensagem de erro.

> ⚠️ Esta página é gerenciada pelo Hub. **O site externo não precisa replicar nada.**

---

## 4. Variável `PLATFORM_URL`

A Edge Function gera o `redirectUrl` usando a variável de ambiente `PLATFORM_URL` (padrão: `https://hub.leadseller.com.br`). Se o domínio do Hub mudar, a equipe do Hub atualiza essa variável — **nenhuma alteração no site externo é necessária**.

---

## 5. Exemplo de Implementação no Site Externo

```html
<form id="login-form">
  <input type="email" name="email" required />
  <input type="password" name="password" required minlength="6" />
  <button type="submit">Entrar</button>
</form>

<script>
const AUTH_ENDPOINT = "https://<PROJECT-REF>.supabase.co/functions/v1/authenticate";
const ANON_KEY = "<ANON_KEY_FORNECIDA_PELO_HUB>";
const API_KEY  = "<API_KEY_DO_SITE>";

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);

  try {
    const resp = await fetch(AUTH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": ANON_KEY,
        "Authorization": `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
        api_key: API_KEY,
      }),
    });

    const data = await resp.json();

    if (data.success && data.redirectUrl) {
      window.location.href = data.redirectUrl;
      return;
    }
    alert(data.error || "Falha ao autenticar.");
  } catch (err) {
    console.error(err);
    alert("Erro de conexão. Tente novamente.");
  }
});
</script>
```

---

## 6. O Que a Equipe de TI **PODE** Alterar Livremente

✅ Layout, HTML, CSS, frameworks (React, Vue, etc.)
✅ Validações de UX (máscaras, força de senha, captcha, rate-limit no front).
✅ Branding, idioma, mensagens de erro exibidas ao usuário.
✅ Adicionar telemetria/analytics no site externo.
✅ Mudar o domínio do site externo (basta avisar o Hub para atualizar `VITE_EXTERNAL_LOGIN_URL`).
✅ Adicionar páginas de "Esqueci minha senha", "Cadastro", etc., desde que **não** tentem gravar diretamente no banco do Hub.

---

## 7. O Que a Equipe de TI **NÃO PODE** Alterar (quebraria a integração)

❌ Mudar o nome dos campos enviados (`email`, `password`, `api_key`).
❌ Enviar a senha em hash/criptografada — a function espera texto plano dentro do canal HTTPS.
❌ Usar a `service_role_key` no front-end.
❌ Criar usuários diretamente via `supabase.auth.admin.*` no site externo — o provisionamento é feito **exclusivamente** pela function `authenticate`, que respeita as regras de `sub_companies`, `user_account_access` e bloqueios.
❌ Inserir/alterar registros nas tabelas do Hub (`profiles`, `user_account_access`, `sub_companies`, `api_keys`, etc.) — todas estão protegidas por **RLS**; qualquer tentativa direta será bloqueada.
❌ Redirecionar para o Hub **sem passar pela function** (não há como gerar sessão válida fora dela).
❌ Persistir `access_token` ou `refresh_token` no domínio externo (LocalStorage, cookies). Tokens devem viver apenas no domínio do Hub.

---

## 8. Segurança e RLS (resumo)

- Todas as tabelas do banco do Hub têm **Row Level Security** ativada.
- Acesso é validado por `auth.uid()` + a função `has_role(user_id, role)`.
- A `anon key` exposta no site externo **só** consegue chamar Edge Functions configuradas como públicas (ex.: `authenticate`). Ela **não** consegue ler/escrever em nenhuma tabela diretamente.
- A função `authenticate` roda com `service_role` no servidor, mas executa apenas operações controladas:
  1. Valida `api_key` contra a tabela `api_keys` (status ativo).
  2. Verifica se existe `sub_company` correspondente ao e-mail.
  3. Provisiona usuário (uma única vez, com lock de idempotência).
  4. Cria perfil em `profiles` e permissões em `user_account_access` conforme `blocked_pages` da sub-empresa.
  5. Faz `signInWithPassword` e devolve a sessão.
- Todas as tentativas (sucesso e falha) são registradas em `auth_audit_logs` com IP e user-agent, para auditoria.

---

## 9. Credenciais a Solicitar ao Hub

Para configurar o site externo, a equipe de TI deve solicitar ao responsável pelo Hub:

| Item | Onde usar |
|------|-----------|
| URL da Edge Function `authenticate` | Constante `AUTH_ENDPOINT` |
| `ANON_KEY` (chave pública do Supabase) | Headers `apikey` e `Authorization` |
| `API_KEY` (chave específica do site emitida no painel) | Body `api_key` |
| Domínio do Hub (`PLATFORM_URL`) | Apenas para conferência / configuração de CORS no Hub |

> 🔐 A `API_KEY` pode ser revogada a qualquer momento pelo Hub. Caso isso ocorra, todas as tentativas de login passarão a retornar `403 - Chave de API inválida` até que uma nova chave seja emitida.

---

## 10. Diagnóstico de Problemas

| Sintoma | Causa provável | Onde investigar |
|---------|----------------|-----------------|
| `403 Chave de API inválida` | `api_key` errada, revogada ou inativa | Painel do Hub → API Keys |
| `Usuário não encontrado` | E-mail não vinculado a nenhuma `sub_company` | Hub precisa cadastrar a sub-empresa antes |
| `Acesso bloqueado` | Sub-empresa com `status = 'blocked'` | Administrador do Hub |
| Redirect para `/auth/callback` mostra "Falha ao autenticar" | Tokens não chegaram completos na URL | Verificar se o site não está modificando/encurtando a `redirectUrl` |
| CORS bloqueado | Origem do site externo não está liberada | Edge Function já aceita `*`; verificar firewall/proxy corporativo |
| Loop de login | Cookies/sessão antiga corrompida no domínio do Hub | Usuário deve limpar dados de `hub.leadseller.com.br` |

Logs detalhados estão disponíveis no Hub em:
- Edge Function logs (Lovable Cloud → Functions → `authenticate`)
- Tabela `auth_audit_logs` (visível ao admin do Hub)

---

## 11. Contato

Qualquer alteração estrutural no site externo (mudança de domínio, troca de framework com impacto na chamada HTTP, integração com SSO/OAuth, etc.) deve ser **comunicada previamente** à equipe do Hub para validação conjunta.

— Fim do documento —
