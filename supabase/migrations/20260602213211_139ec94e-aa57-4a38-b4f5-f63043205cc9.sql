-- Adiciona campos de segurança HMAC à tabela de webhooks
ALTER TABLE public.webhooks 
ADD COLUMN IF NOT EXISTS secret_version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS previous_secret TEXT,
ADD COLUMN IF NOT EXISTS last_rotated_at TIMESTAMP WITH TIME ZONE;

-- Melhora a performance dos logs com índices para filtros comuns
CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_status ON public.webhook_logs(webhook_id, response_status);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON public.webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type ON public.webhook_logs(event_type);
