-- Adiciona colunas de alerta à tabela de webhooks
ALTER TABLE public.webhooks 
ADD COLUMN IF NOT EXISTS alert_slack_url TEXT,
ADD COLUMN IF NOT EXISTS alert_email TEXT,
ADD COLUMN IF NOT EXISTS alert_threshold INTEGER DEFAULT 3;

-- Adiciona metadados de timeout aos logs
ALTER TABLE public.webhook_logs
ADD COLUMN IF NOT EXISTS timeout_limit INTEGER;
