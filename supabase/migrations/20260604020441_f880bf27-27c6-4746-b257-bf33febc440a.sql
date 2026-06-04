ALTER TABLE public.crm_webhook_logs ADD COLUMN IF NOT EXISTS is_dead_letter BOOLEAN DEFAULT false;
ALTER TABLE public.crm_webhook_logs ADD COLUMN IF NOT EXISTS last_error_summary TEXT;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_webhook_logs TO authenticated;
GRANT ALL ON public.crm_webhook_logs TO service_role;