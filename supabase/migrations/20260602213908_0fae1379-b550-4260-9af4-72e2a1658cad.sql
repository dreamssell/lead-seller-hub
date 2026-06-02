-- Adiciona timeout configurável aos webhooks
ALTER TABLE public.webhooks 
ADD COLUMN IF NOT EXISTS timeout_seconds INTEGER DEFAULT 30;
