# Integração Yeastar P-Series — Requisitos Técnicos

**Objetivo:** alimentar os Dashboards de CEOs, Gestores/Supervisores/Coordenadores, o CRM 360 e as Notas Internas com histórico de ligações, KPIs, gravações e rankings de desempenho (por empresa, usuário e período).

**Resumo executivo:** precisamos de **API Key (Client ID/Secret)** com escopos de CDR, Recording, Queue e Call Control **e** de **Webhooks assinados** para eventos em tempo real. Os dois são necessários: o webhook alimenta o tempo real (status de linha, bolhas de chamada no chat, notas), a API alimenta histórico, KPIs, rankings e download de gravações.

---

## 1. Acessos e credenciais (por empresa/tenant)

| Item | Uso |
|---|---|
| URL do PBX (FQDN + IP público) | Base das chamadas de API |
| Porta da API (padrão 8088 / 443 HTTPS) | Conectividade |
| **API Client ID / Client Secret** (Integrations > API) | Autenticação OAuth (`/openapi/v1.0/get_token`, refresh a cada 30 min) |
| IP de origem liberado (allowlist) | Firewall para nossos servidores/edge functions |
| Certificado TLS válido no FQDN | Requisito para HTTPS/WSS sem erro |
| Usuário administrativo somente-leitura | Consulta de CDR/gravações |
| Escopos/permissões da API Key | CDR, Recording, Extension, Queue, Call Control, PBX Status |
| Mapa de ramais e filas por usuário/empresa | Vincular chamada ↔ usuário ↔ tenant |

## 2. Webhooks (push em tempo real)

Habilitar *Event Notification / Webhook* apontando para nossa URL HTTPS, com:

- URL de callback + **token/segredo HMAC** (assinatura em header) e retry automático
- Formato JSON, entrega ordenada, com `event_id` único (idempotência)
- Eventos necessários:
  - `NewCall` / `CallStatus` (ringing, answered, hangup)
  - `CallTransfer`, `CallHold/Resume`, `CallForward`
  - `CDR ready` (chamada finalizada, dados consolidados)
  - `Recording ready` (gravação disponível)
  - `ExtensionStatus` / `Presence` (livre, ocupado, DND, offline)
  - `QueueStatus` / `AgentStatus` (login/logout, pausa e motivo)
  - `Voicemail` recebido
  - `SystemStatus` (PBX online/offline, falha de tronco)

## 3. Campos obrigatórios do CDR (histórico de ligações)

`call_id` (único), `linked_id/session_id`, `timestamp_start`, `timestamp_ring`, `timestamp_answer`, `timestamp_end` (ISO 8601 com timezone), `direction` (inbound/outbound/internal), `src_number`, `dst_number`, `caller_name`, `extension`, `agent_id/usuário`, `queue_id`/nome, `trunk_id`/nome, `did` (número discado), `disposition` (answered / no answer / busy / failed / voicemail), `hangup_cause`, `hangup_side` (quem desligou), `ring_duration`, `talk_duration`, `hold_duration`, `total_duration`, `wrap_up_time`, `transferred_from/to` + tipo (cega/assistida), `conference_flag`, `recording_id`, `recording_url`, `recording_duration`, `cost` (se tarifado), `tenant/company_id`, `sip_response_code`, `mos`/`jitter`/`packet_loss` (qualidade), `user_field`/`custom_variables` (para carimbar `lead_id`/`customer_id` nossos).

## 4. Gravações

- Endpoints de listagem e **download autenticado** (`/openapi/v1.0/recording/list` e `/download`)
- URL assinada com expiração ou token; formato (WAV/MP3), taxa e tamanho
- Política de retenção (dias) e storage externo (SFTP/S3) que possamos espelhar
- Relação garantida `recording_id ↔ call_id`
- Permissão granular: quem pode ouvir/baixar (dono, CEO, gestor, próprio agente)

## 5. KPIs e endpoints de relatório

Indicadores exigidos pelos painéis:

- Volume de chamadas (recebidas, efetuadas, atendidas, perdidas, abandonadas)
- **SLA / Service Level** (% atendidas até X segundos) e tempo médio de espera (ASA)
- TMA (talk time médio), TME, pós-atendimento (ACW), tempo total logado
- Taxa de atendimento e de abandono por fila e por período
- Chamadas por hora/dia/semana/mês (série temporal)
- Ocupação e produtividade por ramal/agente; pausas por motivo
- **Ranking por empresa, usuário, fila e período** (filtros de data/turno)
- Primeira chamada resolvida e transferências por chamada

Endpoints necessários: `cdr/search` (paginação, filtro por data e tenant), `queue/report`, `extension/list`, `agent/status`, `trunk/status`, `pbx/status`.

Informar também: **rate limit**, tamanho máximo de página, janela histórica disponível e possibilidade de *bulk export* inicial (backfill dos últimos 12 meses).

## 6. Multi-tenant e vínculo com o CRM

- Identificador de empresa/sub-empresa em todo evento e CDR
- Mapeamento ramal → usuário da plataforma (e-mail), fornecido pelo PBX
- Campo livre (`user_field` / variável customizada) para injetarmos `lead_id`, `customer_id`, `ticket_id` — essencial para **CRM 360** e **Notas Internas**
- Click-to-call / originate API (`call/dial`) para discagem a partir do CRM
- Call Control API: atender, transferir, gravar sob demanda, escuta/sussurro (supervisor)

## 7. Tempo real (desejável)

- WebRTC / Linkus SDK ou WSS para status de linha ao vivo e discador embutido
- Eventos de presença para o indicador de "linha ocupada"

## 8. Governança

- Ambiente de **sandbox/homologação** separado
- Documentação oficial da versão de firmware instalada
- Contato técnico e SLA de suporte
- LGPD: base legal das gravações, aviso ao chamador, retenção e anonimização
- Log de auditoria de acesso às gravações

---

## Checklist de entrega para o setor de Desenvolvimento

- [ ] Client ID + Client Secret por empresa (com escopos listados)
- [ ] FQDN/IP, porta e allowlist configurada
- [ ] Webhook habilitado com URL, segredo HMAC e lista de eventos
- [ ] Documentação dos campos de CDR retornados
- [ ] Endpoint de download de gravações + política de retenção
- [ ] Mapa ramal ↔ usuário ↔ empresa
- [ ] Rate limits e janela de histórico/backfill
- [ ] Credenciais de sandbox
