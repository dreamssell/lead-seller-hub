-- Adiciona suporte a Dead Letter
ALTER TABLE public.crm_webhook_logs ADD COLUMN IF NOT EXISTS is_dead_letter BOOLEAN DEFAULT false;
ALTER TABLE public.crm_webhook_logs ADD COLUMN IF NOT EXISTS last_error_details TEXT;

-- Comentário para auditoria
COMMENT ON COLUMN public.crm_webhook_logs.is_dead_letter IS 'Indica se a notificação esgotou todas as tentativas e foi para a fila de erro crítico';
