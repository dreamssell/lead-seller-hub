ALTER TABLE public.crm_webhook_logs ADD COLUMN IF NOT EXISTS retry_strategy JSONB DEFAULT '{"backoff": "exponential", "max_attempts": 5, "delay_seconds": 300}';
ALTER TABLE public.crm_webhook_logs ADD COLUMN IF NOT EXISTS retry_history JSONB DEFAULT '[]';

COMMENT ON COLUMN public.crm_webhook_logs.retry_history IS 'Stores an array of objects with {timestamp, attempt, reason, strategy_used}';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_webhook_logs TO authenticated;
GRANT ALL ON public.crm_webhook_logs TO service_role;