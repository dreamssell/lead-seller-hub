
# Fase 2 — Colaboração Interna + SLA

Entrega em 7 frentes, todas ativadas sem quebrar o que já existe (Evolution, Wavoip, importação, Composer Fase 1).

---

## 1. Banco (uma migration única)

**Novas colunas em `customers`**
- `assigned_to uuid` — atendente responsável.
- `queue_id uuid` — fila atual.
- `priority text` — `low | medium | high | urgent` (default `medium`).
- `ticket_status text` — `open | pending | snoozed | resolved | closed` (default `open`).
- `tags text[]` — IDs de tags coloridas.
- `sla_first_response_due_at`, `sla_next_response_due_at`, `sla_resolution_due_at timestamptz`.
- `first_response_at`, `resolved_at timestamptz`.
- `ai_handoff jsonb` — `{ mode: 'human'|'ai', last_handoff_at, context_summary }`.

**Novas tabelas**
- `chat_queues (id, owner_id, name, color, sla_policy_id, business_hours jsonb, created_at)`.
- `chat_tags (id, owner_id, name, color, created_at)`.
- `sla_policies (id, owner_id, name, first_response_minutes, next_response_minutes, resolution_minutes, business_hours_only bool)`.
- `conversation_assignments (id, customer_id, from_user_id, to_user_id, to_queue_id, reason, created_at, created_by)` — auditoria de transferências.
- `note_mentions (id, note_id, mentioned_user_id, customer_id, owner_id, read_at, created_at)` — feed de @menções.
- `supervisor_whispers (id, customer_id, from_supervisor_id, to_agent_id, content, read_at, created_at)` — só agente vê.
- `routing_rules (id, owner_id, name, priority int, channel text, skill text, schedule jsonb, max_load int, target_queue_id, target_user_id, active bool)`.

Todas com `GRANT SELECT, INSERT, UPDATE, DELETE … authenticated` + `service_role`, RLS por `owner_id`/escopo de equipe, e índices em `customer_id`, `assigned_to`, `due_at`.

**Triggers**
- `customers` UPDATE: quando `assigned_to`/`queue_id` muda → registra em `conversation_assignments` e em `customer_notes` cria nota automática "Transferido por X para Y · motivo: …".
- `chat_messages` AFTER INSERT: se for primeira resposta do agente, preenche `first_response_at` e zera `sla_first_response_due_at`. Recalcula `sla_next_response_due_at` para cada mensagem recebida.
- `customer_notes` AFTER INSERT: parse `@usuario` no conteúdo e popular `note_mentions` + `notifications` ("Você foi mencionado em…").

---

## 2. UI — Transferir / Atribuir conversa

- Novo componente `TransferConversationDialog.tsx` no header do chat: select de colega (busca em `profiles`/`user_account_access`) **ou** fila, campo motivo obrigatório, botão "Transferir".
- Botão "Atribuir a mim" rápido (1 clique).
- Mostra atendente atual + fila como `Badge` no header.
- Linha do tempo de transferências dentro de `ChatRightPanel` (nova aba **Histórico**).

## 3. @menção + notificações

- No `Textarea` de nota interna de `ChatRightPanel`, autocomplete `@` (lista usuários do owner via `user_account_access`).
- Highlight `@nome` ao renderizar.
- Trigger no banco cria notificação (toast em tempo real via `notifications` realtime já existente).
- Aba "Menções" no `NotificationsBell`.

## 4. Modo Supervisor + Sussurro

- Hook `useIsSupervisor()` (papel `supervisor`/`coordenador`/`diretor` ou `admin`).
- Quando supervisor abre uma conversa atribuída a outro atendente:
  - Banner "👁 Modo Supervisor — observando atendimento de **Fulano**".
  - Botão **Sussurrar**: abre popover com `Textarea` → grava em `supervisor_whispers`.
- No painel do atendente, sussurros aparecem como bolha amarela só para ele, com badge "🔒 Supervisor".

## 5. Tags coloridas + Prioridade + Status de ticket

- `TagsManager.tsx` em Configurações (CRUD em `chat_tags`).
- Header do chat com:
  - `PrioritySelect` (4 níveis, cores: cinza / azul / laranja / vermelho).
  - `TicketStatusSelect` (open / pending / snoozed / resolved / closed).
  - `TagPicker` (popover multi-select com cores).
- Lista de conversas mostra prioridade como barra lateral colorida e tags como chips.
- Filtros laterais: por status, prioridade, tag, atendente, fila.

## 6. SLA com timer visível

- `SlaTimer.tsx`: componente que recebe `due_at` e renderiza badge animado:
  - Verde (>50% restante), amarelo (<50%), laranja (<20%), vermelho pulsante (vencido).
- Header do chat: 3 timers (1ª resposta, próxima resposta, resolução).
- Coluna na lista de conversas com o timer mais crítico.
- Configuração de `sla_policies` em **Configurações → Atendimento → SLA**.
- Edge Function `chat-sla-tick` agendada `*/1 * * * *` via `pg_cron`: gera `notifications` quando faltar <20% e quando vencer.

## 7. Roteamento por horário e carga

- Estender `ChannelRoutingTab.tsx`:
  - Aba **Regras avançadas**: tabela `routing_rules` com editor (canal, skill, horário/dias, carga máxima por agente, fila/agente alvo, prioridade da regra).
  - Toggle ativo/inativo.
- Função `route_conversation(customer_id)` em SQL aplica regras em ordem de `priority`.
- Trigger em `customers` (INSERT/quando `assigned_to` nulo) chama a função.

## 8. Handoff Humano ↔ IA

- Botão no header **"Assumir do bot" / "Passar para IA"**.
- Ao alternar:
  - Salva `customers.ai_handoff = { mode, last_handoff_at, context_summary }`.
  - Chama Edge Function `chat-ai-assist` (modo `summarize`) para gerar TL;DR das últimas 20 mensagens e gravar em `context_summary`.
  - Cria nota interna automática: "🤖 → 👤 Handoff: <resumo>".
- Quando IA está ativa, badge "🤖 IA respondendo" no header e composer mostra dica "Bot ativo — clique em Assumir para responder manualmente".

---

## Arquivos novos

```
src/components/chat/TransferConversationDialog.tsx
src/components/chat/PrioritySelect.tsx
src/components/chat/TicketStatusSelect.tsx
src/components/chat/TagPicker.tsx
src/components/chat/SlaTimer.tsx
src/components/chat/SupervisorBanner.tsx
src/components/chat/WhisperComposer.tsx
src/components/chat/AssignmentTimeline.tsx
src/components/chat/MentionTextarea.tsx
src/components/settings/TagsManager.tsx
src/components/settings/SlaPoliciesTab.tsx
src/components/settings/AdvancedRoutingRulesTab.tsx
src/hooks/useIsSupervisor.ts
src/hooks/useSlaCountdown.ts
src/hooks/useMentionSuggestions.ts
src/lib/slaUtils.ts
supabase/functions/chat-sla-tick/index.ts
```

## Arquivos alterados

- `src/pages/ChatPage.tsx` — header rico (transferir, prioridade, status, tags, timers, handoff), banner supervisor, sussurros inline.
- `src/components/chat/ChatRightPanel.tsx` — aba "Histórico" + autocomplete @ em notas.
- `src/components/settings/ChannelRoutingTab.tsx` — sub-aba "Regras avançadas".
- `src/components/notifications/NotificationsBell.tsx` — filtro "Menções".

---

## Ordem de execução

1. Migration completa (todas as tabelas/colunas/triggers/grants/RLS).
2. Hooks utilitários (`useIsSupervisor`, `useSlaCountdown`, `useMentionSuggestions`).
3. Componentes UI (transferir, prioridade, status, tags, sla, supervisor, sussurro, mention textarea).
4. Integração no `ChatPage.tsx` e `ChatRightPanel.tsx`.
5. Telas de configuração (tags, SLA, roteamento avançado).
6. Edge Function `chat-sla-tick` + `pg_cron`.
7. Typecheck e ajuste fino.

**Compatibilidade:** todos os campos novos têm default seguro, nada do fluxo atual quebra. Fase 1 (Composer) permanece intacta.

Posso seguir?
