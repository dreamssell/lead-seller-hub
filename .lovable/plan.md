# Fluxo de Atendimento Omnichannel + Flow Builder

Vou entregar em **5 etapas incrementais**, validando cada uma antes de avançar. Cada etapa é isolada — não afeta WhatsApp completo, Modo Foco, Wavoip, WAHA ou funis existentes.

---

## Etapa 0 — Ajuste rápido (nesta primeira entrega)

**Botão "+" no Modo Foco** com paridade total ao WhatsApp completo:
- Anexar mídia (dropzone), agendar mensagem, respostas rápidas, gravar áudio, emoji, template.
- Reaproveita componentes já existentes do `ChatComposer`.

---

## Etapa 1 — Backend: modelo de distribuição e permissões

**Novas tabelas** (RLS + GRANT completos, isoladas por `owner_id`/`sub_company_id`):

- `attendance_queues` — filas por funil/setor (id, name, pipeline_id, sub_company_id, routing_strategy: `round_robin|skill|load_balance|manual`, sla_overflow_seconds, fallback_queue_id).
- `queue_members` — membros da fila (user_id, queue_id, skills[], is_active, current_load).
- `lead_assignments` — atribuição atual do lead (customer_id, assigned_to, queue_id, stage: `manual|auto|waiting|active|snoozed|closed`, assigned_at, first_response_at, closed_at, close_value, close_status_tag).
- `assignment_events` — histórico completo (para CRM 360: entrada, transbordo, devolução, snooze, encerramento).
- `quick_replies_shortcuts` — já existe `quick_replies`; adiciono coluna `shortcut` (ex.: `/boasvindas`).

**Funções SECURITY DEFINER:**
- `assign_lead_round_robin(queue_id)` — próximo membro ativo.
- `assign_lead_load_balance(queue_id)` — membro com menor `current_load`.
- `sla_overflow_scan()` — cron 1min: devolve leads sem `first_response_at` após SLA.

**Realtime** habilitado em `lead_assignments` e `assignment_events` para atualizar as abas ao vivo.

---

## Etapa 2 — Frontend: 4 abas no WhatsApp (completo + Modo Foco)

Novo componente `AttendanceTabs` acima da lista de conversas, com filtro por permissão via `useUserProfileLevel`:

1. **Entrada Manual** — botão flutuante **Quick Add** (Nome, Telefone, Origem), auto-atribuição opcional, campo obrigatório "Primeira Nota" → gravada em `customer_notes` e disparada como evento no CRM 360.
2. **Distribuição Automática** — visualiza leads roteados por webhook/bot; badge com estratégia aplicada; log de transbordo.
3. **Aguardando Você** — fila pessoal do atendente; cards com cor dinâmica de SLA (verde/amarelo/vermelho); resumo IA do bot (reusa `chat-ai-assist`); botão **Devolver para Fila Geral**.
4. **Em Atendimento** — chats ativos; ações: **Snooze**, **@ menção interna** (usa `internal_messages`), **Respostas Rápidas** (`/atalho`), **Encerrar** (modal com valor negociado + tag de status → grava em `lead_assignments.close_value/close_status_tag` e emite evento CRM 360 + métrica dashboards).

Gestores (supervisor/coordenador/diretor/dono) veem todas as abas de todos; atendentes só veem seus funis atribuídos (reusa `user_pipeline_assignments`).

---

## Etapa 3 — Backend: Rule Engine e Orquestração

- `routing_rules` já existe — estendo com `conditions_jsonb` (canal, origem webhook, palavras-chave, horário, região) e `actions_jsonb` (fila destino, atendente direto, tag, prioridade).
- Edge Function `route-inbound-lead` — chamada pelos webhooks existentes (`handle-inbound-webhook`, `landing-capture`, `waha-inbound`, integrações Holmes/DealerSpace). Avalia regras em ordem, aplica estratégia da fila, grava assignment e evento.
- Cron `sla-overflow-scan` (pg_cron 1min) — devolve leads estagnados.

---

## Etapa 4 — Flow Builder no Developer Center

- Novo botão **Flow** no `DeveloperPage` (ao lado de MCP/Webhooks) → rota `/automations/flows`.
- Reaproveita `AutomationsPage` já existente; adiciona:
  - Header com métricas: Automações Ativas / Execuções Hoje / Taxa Sucesso / Leads Processados (query em `bot_flow_runs` + `routing_rules`).
  - Botão **+** abre modal **"Criar Novo Fluxo"** com 2 cards: *Começar do Zero* / *Usar Template*.
  - Templates prontos: "Round-Robin Comercial", "Skill-Based Suporte", "SLA Overflow", "Captura Landing".
- Editor visual reusa infraestrutura de `bot_flows` (nodes/edges JSON) — sem nova dependência.

---

## Etapa 5 — Integração final e testes

- Testes E2E: permissões por cargo, SLA overflow, quick add, encerramento com valor.
- Integração com dashboards CEO/Gestor (novo card "Leads encerrados hoje" + soma `close_value`).
- Documentação em `/documentation`.

---

## Diagrama do fluxo

```text
Webhook/Bot/Manual
        │
        ▼
  ┌───────────────┐    Rule Engine
  │ route-inbound │──► (routing_rules)
  └───────┬───────┘
          ▼
  attendance_queues ──► strategy (round_robin | skill | load_balance)
          │
          ▼
  lead_assignments (stage: waiting)
          │
   ┌──────┼──────────────┐
   ▼      ▼              ▼
Aguardando  SLA overflow  Devolver
(atendente) (cron 1min)   (manual)
   │
   ▼
Em Atendimento ──► Snooze / @menção / /respostas
   │
   ▼
Encerrar (valor + tag) ──► CRM 360 + Dashboards
```

---

## Confirmação antes de começar

Vou iniciar pela **Etapa 0 (botão + no Modo Foco)** e **Etapa 1 (backend do modelo de distribuição)** nesta rodada, sem tocar em nada que já funciona. Confirma que posso seguir por essa ordem? Se preferir outra sequência (ex.: começar pelo Flow Builder), me avise.
