# Onda 2 — Isolamento multi-tenant, rastreabilidade e saúde de acessos

Foco: fechar brechas de RLS entre empresas/sub-empresas, dar rastreabilidade fim-a-fim ao ciclo de mensagens do WhatsApp e detectar contas com `user_account_access` inconsistente antes que virem ticket de suporte.

## 1. RLS e isolamento multi-tenant (crítico)

**Migração SQL corrigindo as tabelas apontadas na auditoria:**

- `customer_notes`, `company_settings`, `video_error_logs` — revisar policies e substituir qualquer `USING (true)` por escopo com `owner_id` + `user_account_access` (mesmo padrão de `customers`).
- Reforçar `chat_messages` / `customers`: garantir que INSERT/UPDATE também validem `sub_company_id` (não só `owner_id`), evitando que um usuário de outra sub-empresa da mesma matriz enxergue conversas.
- Criar índices compostos `(owner_id, sub_company_id, created_at DESC)` nas tabelas quentes (`chat_messages`, `customers`, `leads`, `call_history`) para manter performance com o filtro mais estrito.

**Gate de CI para RLS** (`.github/workflows/rls-guard.yml` + script Node):

- Varre `supabase/migrations/*.sql` e falha o pipeline se detectar:
  - `USING (true)` ou `WITH CHECK (true)` em tabela pública.
  - `CREATE POLICY ... FOR (INSERT|UPDATE|DELETE)` sem `WITH CHECK` ou sem referência a `auth.uid()` / `has_role` / `user_account_access`.
  - `CREATE TABLE public.*` sem `GRANT` na mesma migração.
- Roda também `src/lib/serverAccess.migrations.test.ts` e o novo teste de tenant.

**Testes de integração multi-tenant** (`src/__tests__/tenantIsolation.integration.test.ts`):

- Cria 2 owners + 1 sub-empresa cada via service role.
- Para cada tabela crítica (`customers`, `chat_messages`, `customer_notes`, `leads`, `call_history`, `company_settings`, `video_error_logs`) tenta ler/escrever cruzado usando a chave anon com JWT do owner B — assert 0 linhas / erro RLS.

## 2. correlationId fim-a-fim no WhatsApp

Reaproveita `src/lib/correlationId.ts` (já existe).

- **Composer → envio**: `ChatPage` gera `cid` antes do `insert` em `chat_messages` e grava em nova coluna `correlation_id text` (migração + índice).
- **Adapter WAHA** (`src/components/whatsapp/wahaAdapter.ts`): propaga `cid` no header `X-Correlation-Id` da chamada à edge function.
- **Edge `waha-send` / `uaz-send-message` / `waha-inbound`**: loga `cid` estruturado e escreve em `webhook_logs.correlation_id`.
- **ACK/inbound**: quando o webhook casa `provider_message_id`, atualiza a mesma linha e emite evento realtime.

**Timeline por mensagem**: nova tabela `message_events(id, message_id, correlation_id, stage, status, detail jsonb, created_at)` com stages `composed | queued | provider_sent | provider_ack | delivered | read | failed`. Popular via triggers no `chat_messages` + inserts explícitos no edge.

**UI**: popover no balão do chat listando os eventos ordenados (usa a tabela nova). Sem mudar layout — apenas ação "Ver rota da mensagem".

## 3. Detecção de acessos órfãos

**View + função**: `public.v_account_access_health` cobrindo:

- `client_companies` cujo `auth_user_id` não tem linha em `user_account_access` nem role admin.
- `user_account_access.owner_id` que não existe mais em `client_companies`.
- `sub_companies` sem nenhum usuário admin ativo.
- Usuários com `role_label` NULL/`Colaborador` em contas titulares (bug do backfill).

**Tela admin `/owner/access-health`** (só para dono da plataforma via `usePlatformOwner`):

- Lista os problemas categorizados, com botão "Corrigir" que chama uma edge function `access-health-fix` (idempotente, service role).
- Envia notificação para admins quando novos itens aparecerem (reaproveita `notifications` + `notify_admins_on_error` como padrão).

**Job diário**: cron da Supabase chama a edge `access-health-scan` uma vez ao dia e insere `notifications` para o dono se `count > 0`.

## 4. Entregáveis / arquivos

```text
supabase/migrations/<ts>_wave2_rls_hardening.sql
supabase/migrations/<ts>_wave2_correlation_and_events.sql
supabase/migrations/<ts>_wave2_access_health.sql
supabase/functions/access-health-scan/index.ts
supabase/functions/access-health-fix/index.ts
scripts/rls-guard.mjs
.github/workflows/rls-guard.yml
src/pages/owner/AccessHealthPage.tsx
src/components/chat/MessageRoutePopover.tsx
src/__tests__/tenantIsolation.integration.test.ts
```

Ajustes menores em: `ChatPage.tsx`, `wahaAdapter.ts`, `waha-inbound/index.ts`, `send-outbound-webhook/index.ts`, `App.tsx` (rota nova).

## 5. Ordem de execução

1. Migração RLS + índices (aprovação sua) → regenera tipos.
2. Testes de tenant + gate de CI (falha se regredir).
3. Migração `correlation_id` + `message_events` + wiring composer/adapter/edge.
4. Popover de timeline no chat.
5. Migração/view de access health + edges + página do dono + cron.

Se aprovar, executo tudo em sequência e paro só nas aprovações de migração.
