# Plano — Integração WAHA (estilo ChatWoot App) em 3 Etapas

O objetivo é transformar a integração WAHA atual (apenas envio HTTP) em uma integração completa e "pronta para produção", replicando o modelo do app oficial ChatWoot da WAHA: painel de configuração com todos os campos, webhook inbound gerando conversas/mensagens no Lead Seller, e envio/ACKs bidirecionais — tudo isolado dos providers UAZ, Evolution e Wavoip.

---

## Etapa 1 — Painel de Configuração WAHA (UI + Persistência)

**Entrega:** Formulário completo na página `WhatsAppPage` (e/ou card em `ConnectionsTab`) para criar/editar uma conexão WAHA com todos os campos que a VPS WAHA exige, salvos com segurança em `whatsapp_connections.metadata`.

Campos do formulário (obrigatórios marcados *):
- **WAHA Base URL** * (ex.: `https://waha.meudominio.com`)
- **WAHA API Key / Token** * (mascarado)
- **Session name** * (default `default`)
- **App ID WAHA** (ex.: `app_7efff04b58ce44ff9c2eb034a571d0df`)
- **Chatwoot-compat block** (mantidos por paridade com a UI da WAHA):
  - Chatwoot URL (default `https://app.chatwoot.com` — usaremos como "target URL" ou deixamos vazio se apontar para o Lead Seller)
  - Account ID *
  - Account Token * (mascarado)
  - Inbox ID *
  - Inbox Identifier * (mascarado)
- **Conversation behavior**: `create_new` | `reuse_open` | `reuse_last`
- **Mark as read on WhatsApp ack** (toggle)
- **Message link preview** (toggle)
- **Templates com nome do agente** (toggle)
- **Language** (pt-BR default) + textarea de "Language Overrides" (YAML/Mustache livre)

Extras técnicos:
- Botão **"Copiar Webhook URL"** exibindo `${SUPABASE_FUNCTIONS_URL}/waha-inbound?connection=<id>` — a URL que o usuário cola no painel WAHA/Chatwoot App.
- Botão **"Testar conexão"** que chama `whatsapp-status` (já existe) e mostra `status` + `me.id`.
- Validação Zod no client antes de salvar; segredos nunca vão para logs/telemetria.
- Componente novo `WahaConfigDialog.tsx` — isolado, não toca em componentes de UAZ/Evolution/Wavoip.

Testes desta etapa:
- Unit test do schema Zod da config (campos obrigatórios, formato URL, mínimo tokens).
- Snapshot do dialog para garantir que nenhum campo desaparece em refactors.

---

## Etapa 2 — Webhook Inbound WAHA → Lead Seller

**Entrega:** Nova edge function `waha-inbound` que recebe eventos WAHA (`message`, `message.ack`, `session.status`) e persiste no schema existente (`customers`, `chat_messages`), sem tocar no `handle-inbound-webhook` genérico (isolamento).

Passos:
1. Criar `supabase/functions/waha-inbound/index.ts`:
   - CORS + `verify_jwt = false` (WAHA não manda JWT).
   - Valida `?connection=<uuid>` → carrega `whatsapp_connections` e confirma `provider = 'waha'`.
   - Autentica o webhook via header `X-Api-Key` comparado com o token salvo (defesa contra spoof).
   - Parseia payload WAHA com Zod (`event`, `session`, `payload.from`, `payload.body`, `payload.hasMedia`, `payload.ack`, etc.).
   - Roteia por `event`:
     - `message` / `message.any` → upsert `customer` por telefone (normalizado), insert `chat_messages` com `sender_type='customer'`, `channel='whatsapp'`, `provider_message_id`.
     - `message.ack` → update `chat_messages.status` (`sent` → `delivered` → `read`) via `provider_message_id`.
     - `session.status` → atualiza `whatsapp_connections.status` (connected/disconnected).
   - Idempotência: usa `webhook_idempotency_keys` com chave `waha:<connection_id>:<payload.id>`.
2. Registrar em `supabase/config.toml` apenas se precisar de override; caso contrário, deploy padrão já resolve.

Testes desta etapa:
- Deno integration test (`waha-inbound/index_test.ts`) com:
  - payload de mensagem de texto → cria customer + message
  - payload de ACK → atualiza status
  - payload duplicado (mesma `id`) → segunda chamada é no-op
  - header `X-Api-Key` inválido → 401
  - `connection` inexistente ou provider ≠ waha → 404
- Teste que confirma que a função **não** chama `handle-inbound-webhook`, `uaz-*`, `evolution-*` nem `wavoip-*`.

---

## Etapa 3 — Envio Bidirecional, ACKs no Chat e Mapeamento de Templates

**Entrega:** Fechar o loop: mensagens enviadas pelo Lead Seller vão via `wahaAdapter` já existente, mas agora com metadados do painel (session, overrides, templates), e ACKs recebidos na Etapa 2 atualizam a UI do chat.

Escopo:
1. **`wahaAdapter.sendMessage/sendMedia/sendAudio`** passa a:
   - Ler `session` da nova config (fallback `default`).
   - Aplicar `chatwoot.to.whatsapp.message.text` como template Mustache no `content` quando `templates_com_nome_agente` estiver ligado (prefixa `*Nome*:` no texto).
   - Registrar `provider_message_id` retornado pela WAHA no `chat_messages` correspondente (para casar ACKs da Etapa 2).
2. **UI de chat** (`WhatsAppConnectionCard` + componente de mensagem):
   - Consumir os ACKs (`delivered`/`read`) e atualizar o ícone (✓ / ✓✓ / ✓✓ azul) apenas para mensagens WAHA — sem afetar renderização das mensagens UAZ/Evolution/Wavoip.
   - Banner de status já existente ganha estados: `sending`, `sent`, `delivered`, `read`, `failed`, `disconnected`.
3. **Fallback**: se `whatsapp-status` reportar WAHA desconectado por >30s, botão de envio desabilita com tooltip "WAHA desconectado — reconecte na configuração. UAZ/Wavoip/Evolution não afetados".
4. **Rate limit + retry** já cobertos pelo `wahaFetch`; adicionar métrica simples em `telemetry_logs` (`event='waha_send'`, sucesso/falha/duração).

Testes desta etapa:
- Unit: template Mustache produz o texto esperado com/sem `sender.name`.
- Unit: ACK recebido atualiza `chat_messages.status` correto (mock do subscribe realtime).
- E2E (Playwright, adicionar a `e2e/whatsapp-send-recovery.spec.ts` ou novo `waha-flow.spec.ts`):
  1. Cria conexão WAHA fake apontando para um servidor local mock.
  2. Envia mensagem pela UI → verifica POST em `/api/sendText`.
  3. Dispara webhook `message.ack` no `waha-inbound` mockado → UI mostra ✓✓.
  4. Confirma que nenhuma request foi feita para endpoints UAZ/Evolution/Wavoip.

---

## Detalhes Técnicos Transversais

- **Isolamento**: nenhum arquivo novo importa de `uaz*`, `evolution*` ou `wavoip*`. Toda lógica WAHA vive em `src/components/whatsapp/waha*`, `supabase/functions/waha-inbound/` e no card dedicado em `ConnectionsTab`.
- **Segurança**: `Account Token`, `Inbox Identifier` e `WAHA token` sempre mascarados na UI; nunca logados; validação server-side do `X-Api-Key` no webhook.
- **Schema DB**: não requer novas tabelas — usamos `whatsapp_connections.metadata` (JSONB) para toda a config, `chat_messages.provider_message_id` (já existe) para ACKs, e `webhook_idempotency_keys` para deduplicação.
- **Migrations**: nenhuma nova migration necessária (enum `waha` já existe).
- **Rollback**: cada etapa é independente; remover o card WAHA + a edge function `waha-inbound` desativa a integração sem afetar os demais providers.

---

Aprove esta divisão e eu inicio pela **Etapa 1** (painel de configuração + persistência), depois Etapa 2 (webhook), depois Etapa 3 (bidirecional + ACKs).
