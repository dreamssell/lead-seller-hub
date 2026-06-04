-- Adiciona suporte a desfazer no crm_events
ALTER TABLE public.crm_events ADD COLUMN IF NOT EXISTS parent_event_id UUID REFERENCES public.crm_events(id);
ALTER TABLE public.crm_events ADD COLUMN IF NOT EXISTS undo_reason TEXT;

-- Tabela para configuração de Webhooks
CREATE TABLE IF NOT EXISTS public.crm_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{"kanban_move", "ai_action"}',
  secret_key TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_webhooks TO authenticated;
GRANT ALL ON public.crm_webhooks TO service_role;
ALTER TABLE public.crm_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view webhooks" ON public.crm_webhooks
  FOR SELECT TO authenticated USING (true);

-- Log de entregas de webhook para auditoria
CREATE TABLE IF NOT EXISTS public.crm_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES public.crm_webhooks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  error_message TEXT,
  correlation_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.crm_webhook_logs TO authenticated;
GRANT ALL ON public.crm_webhook_logs TO service_role;
ALTER TABLE public.crm_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view webhook logs" ON public.crm_webhook_logs
  FOR SELECT TO authenticated USING (true);

-- Comentários para documentação
COMMENT ON COLUMN public.crm_events.payload IS 'Armazena detalhes auditáveis incluindo X-Correlation-ID';
