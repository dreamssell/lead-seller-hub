# Dashboards personalizados por perfil de usuário

Reestruturação do `/` (Dashboard) para exibir conteúdo, KPIs e módulos conforme o nível de acesso do usuário logado. Divisão em 3 fases entregáveis independentemente.

## Detecção do perfil

Uso combinado de:
- `usePlatformOwner` → dono/admin da plataforma
- `useIsSupervisor` (`user_signature_roles`) → `agente | supervisor | coordenador | diretor | admin`
- `access.is_account_admin` (do `AuthContext`) → admin da conta

Mapeamento:
- **Agente** → level `agente` e não é admin da conta
- **Gestão** → level `supervisor | coordenador` OU `is_account_admin` sem ser diretor/dono
- **Executivo** → level `diretor | admin` OU dono da plataforma OU CEO

## Fase 1 — Dashboard do Agente

- Novo componente `AgentDashboard.tsx`.
- Cards de topo (dados **apenas do usuário logado**, escopo `assigned_to = user.id`):
  - Conversas Ativas (customers com `status='open'`)
  - Chamadas Hoje (via `wavoip_audit_logs` do próprio user)
  - Leads no Funil (leads onde `owner_id/assignee = user.id`)
  - Taxa de Conversão (leads ganhos ÷ leads totais desse user, 30d)
- Remove seção "Serviços & Módulos".
- Adiciona KPIs pessoais com gráficos (recharts já disponível):
  - Linha: mensagens enviadas por dia (últimos 14 dias)
  - Barra: leads por estágio do funil (só desse user)
  - Donut: distribuição por canal (WhatsApp/Voz/Vídeo)
  - Ranking pessoal: tempo médio de resposta, SLA cumprido, top 5 clientes atendidos

## Fase 2 — Dashboard de Gestão (supervisor/coordenador)

- Novo componente `ManagerDashboard.tsx`.
- Cards de topo com dados **de toda a empresa/sub-empresa** do escopo do usuário.
- Serviços & Módulos filtrados: remove **Agentes de I.A.**, **Gestão de Acessos & API**, **Automações & Integrações**, **WhatsApp Business**.
- Adiciona painel de performance da empresa:
  - Linha: volume de conversas por dia (30d)
  - Barra: leads capturados por canal
  - Área empilhada: conversões por SDR/Closer
  - Tabela: SLA por fila, backlog, tempo médio de resposta

## Fase 3 — Dashboard Executivo (admin/diretor/CEO)

- Renomear o item de menu atual **Dashboard** → **Ferramentas** (mantém rota `/` como landing das ferramentas para esse perfil? Não — o item Ferramentas será uma página nova em `/ferramentas` com o layout atual completo de Serviços & Módulos).
- O botão **Dashboard CEO** ocupa a posição de destaque (primeiro item da sidebar) e sua rota vira `/` para admins/diretores.
- O novo `/` para executivos renderiza `ExecutiveDashboard.tsx`:
  - Cards de topo (empresa inteira): Conversas Ativas, Chamadas Hoje, Leads no Funil, Taxa de Conversão
  - Cards de performance por supervisor/coordenador (nome, leads geridos, conversão, SLA, ticket médio)
  - Todos os Cards de Serviços & Módulos completos
  - Mantém acesso aos sub-dashboards CEO existentes (Leads, Ligações, Assinaturas)

## Detalhes técnicos

- `src/pages/Dashboard.tsx` vira um **roteador de perfil**: detecta o role e renderiza `AgentDashboard | ManagerDashboard | ExecutiveDashboard`.
- Novos arquivos em `src/components/dashboard/`:
  - `AgentDashboard.tsx`, `ManagerDashboard.tsx`, `ExecutiveDashboard.tsx`
  - `charts/` com componentes reutilizáveis (LineTrend, BarByStage, DonutChannel, SupervisorPerformanceCard)
- Hook `useDashboardMetrics(scope: 'self' | 'company')` que centraliza queries ao Supabase (customers, leads, chat_messages, wavoip_audit_logs) e retorna estados de loading.
- Sidebar (`src/lib/navigation.ts`): novo item **Ferramentas** (`/ferramentas`) visível a todos; **Dashboard CEO** promovido para executivos e apontando para `/`.
- Nova rota `/ferramentas` em `App.tsx` renderizando a versão atual (cards de Serviços & Módulos completa).
- Todas as queries respeitam RLS existente — nenhum ajuste de policy necessário.

## Ordem de entrega

1. **Fase 1** — Agente (isolado, baixo risco)
2. **Fase 2** — Gestão (reaproveita hook de métricas com escopo `company`)
3. **Fase 3** — Executivo + reorganização de menu (`Ferramentas` / `Dashboard CEO` como home)

Cada fase é independente e o Dashboard atual continua funcionando como fallback até a Fase 3.
