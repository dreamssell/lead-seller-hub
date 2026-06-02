-- Adiciona configurações de retry e schema aos webhooks
ALTER TABLE public.webhooks 
ADD COLUMN IF NOT EXISTS payload_schema JSONB,
ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3;

-- Adiciona controle de tentativas aos logs
ALTER TABLE public.webhook_logs
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed';

-- Índice para facilitar a busca por logs pendentes de retry
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status_retry ON public.webhook_logs(status) WHERE status = 'pending_retry';

-- Função para calcular o próximo retry (backoff exponencial: 2^retry_count * 30 segundos)
CREATE OR REPLACE FUNCTION public.calculate_next_retry(retry_count INTEGER) 
RETURNS TIMESTAMP WITH TIME ZONE AS $$
BEGIN
  RETURN now() + (POWER(2, retry_count) * interval '30 seconds');
END;
$$ LANGUAGE plpgsql;
