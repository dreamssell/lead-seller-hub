-- Adiciona coluna de configuração de TTL por webhook
ALTER TABLE public.webhooks ADD COLUMN IF NOT EXISTS idempotency_ttl_hours INTEGER DEFAULT 24;

-- Atualiza a função de limpeza para ser mais flexível ou usada em conjunto com cron
CREATE OR REPLACE FUNCTION public.cleanup_expired_idempotency_keys_v2()
RETURNS integer AS $$
DECLARE
    deleted_count integer;
BEGIN
    -- Deleta chaves baseadas no TTL configurado no webhook correspondente
    DELETE FROM public.webhook_idempotency_keys ik
    USING public.webhooks w
    WHERE ik.webhook_id = w.id
    AND ik.created_at < now() - (COALESCE(w.idempotency_ttl_hours, 24) || ' hours')::interval;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
