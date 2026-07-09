-- Wave 4 · Frente 1: índices para os top ofensores do pg_stat_statements

-- 1. chat_messages: ordenação global por created_at (realtime prefetch, PostgREST list)
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at
  ON public.chat_messages (created_at DESC);

-- 2. customers: ordenação global por updated_at (listagens de conversas recentes)
CREATE INDEX IF NOT EXISTS idx_customers_updated_at
  ON public.customers (updated_at DESC);

-- 3. customers: filtro combinado tenant + updated_at (dashboards)
CREATE INDEX IF NOT EXISTS idx_customers_tenant_updated
  ON public.customers (owner_id, sub_company_id, updated_at DESC);

-- 4. whatsapp_connections: filtro por status (polling de disponibilidade)
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_status
  ON public.whatsapp_connections (status);

-- 5. notifications: filtro por owner (bell + admin feed)
CREATE INDEX IF NOT EXISTS idx_notifications_owner_created
  ON public.notifications (owner_id, created_at DESC);

-- 6. lead_events: timeline por owner
CREATE INDEX IF NOT EXISTS idx_lead_events_owner_created
  ON public.lead_events (owner_id, created_at DESC);

-- 7. audit_logs: filtro por record (auditoria de uma linha específica)
CREATE INDEX IF NOT EXISTS idx_audit_logs_record
  ON public.audit_logs (table_name, record_id, created_at DESC);

-- Atualiza estatísticas para o planner reconhecer os novos índices imediatamente
ANALYZE public.chat_messages;
ANALYZE public.customers;
ANALYZE public.whatsapp_connections;
ANALYZE public.notifications;
ANALYZE public.lead_events;
ANALYZE public.audit_logs;