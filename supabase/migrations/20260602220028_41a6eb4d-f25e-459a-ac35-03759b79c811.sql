-- Adiciona ID de correlação aos logs
ALTER TABLE public.webhook_logs 
ADD COLUMN IF NOT EXISTS request_id TEXT;

-- Index para busca rápida por requestId
CREATE INDEX IF NOT EXISTS idx_webhook_logs_request_id ON public.webhook_logs(request_id);

COMMENT ON COLUMN public.webhook_logs.request_id IS 'ID de correlação único para rastrear a tentativa de ponta a ponta.';
