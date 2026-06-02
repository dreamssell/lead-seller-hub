-- Drop function first to change return type
DROP FUNCTION IF EXISTS public.cleanup_expired_idempotency_keys_v2();

-- Tabela de logs de limpeza de idempotência
CREATE TABLE IF NOT EXISTS public.idempotency_cleanup_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID REFERENCES public.webhooks(id) ON DELETE CASCADE,
    keys_removed INTEGER NOT NULL,
    clean_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
    reason TEXT DEFAULT 'TTL Expiration'
);

-- Habilitar RLS
ALTER TABLE public.idempotency_cleanup_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.idempotency_cleanup_logs TO authenticated;
GRANT ALL ON public.idempotency_cleanup_logs TO service_role;

-- Política de acesso
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view cleanup logs for their webhooks') THEN
        CREATE POLICY "Users can view cleanup logs for their webhooks"
        ON public.idempotency_cleanup_logs
        FOR SELECT
        USING (EXISTS (
            SELECT 1 FROM public.webhooks w 
            WHERE w.id = idempotency_cleanup_logs.webhook_id 
            AND w.created_by = auth.uid()
        ));
    END IF;
END $$;

-- Nova função de limpeza com registro de auditoria
CREATE OR REPLACE FUNCTION public.cleanup_expired_idempotency_keys_v2()
RETURNS TABLE (webhook_id UUID, removed_count INTEGER) AS $$
DECLARE
    r RECORD;
    v_deleted_count INTEGER;
BEGIN
    FOR r IN SELECT id, idempotency_ttl_hours FROM public.webhooks WHERE type = 'outbound' LOOP
        WITH deleted AS (
            DELETE FROM public.webhook_idempotency_keys k
            WHERE k.webhook_id = r.id
              AND k.created_at < (now() - (interval '1 hour' * COALESCE(r.idempotency_ttl_hours, 24)))
            RETURNING *
        )
        SELECT count(*) INTO v_deleted_count FROM deleted;
        
        IF v_deleted_count > 0 THEN
            INSERT INTO public.idempotency_cleanup_logs (webhook_id, keys_removed)
            VALUES (r.id, v_deleted_count);
        END IF;
        
        webhook_id := r.id;
        removed_count := v_deleted_count;
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
