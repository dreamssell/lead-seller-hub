-- Função para obter estatísticas de idempotência por webhook
CREATE OR REPLACE FUNCTION public.get_webhook_idempotency_stats(
    p_webhook_id UUID,
    p_start_date TIMESTAMP WITH TIME ZONE,
    p_end_date TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE (
    webhook_id UUID,
    total_requests BIGINT,
    idempotency_hits BIGINT,
    hit_ratio NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.webhook_id,
        count(*) as total_requests,
        count(*) FILTER (WHERE l.is_idempotent_hit = true) as idempotency_hits,
        ROUND((count(*) FILTER (WHERE l.is_idempotent_hit = true)::numeric / count(*)::numeric) * 100, 2) as hit_ratio
    FROM public.webhook_logs l
    WHERE l.webhook_id = p_webhook_id
      AND l.created_at BETWEEN p_start_date AND p_end_date
    GROUP BY l.webhook_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para relatório de auditoria de expiração de TTL (simulado/logado)
-- Como o TTL remove os registros, a auditoria real vem dos logs de limpeza se existirem, 
-- ou simplesmente listando o que está prestes a expirar.
CREATE OR REPLACE FUNCTION public.get_idempotency_expiration_report(p_webhook_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'webhook_id', p_webhook_id,
        'generated_at', now(),
        'active_keys_count', (SELECT count(*) FROM public.webhook_idempotency_keys WHERE webhook_id = p_webhook_id),
        'keys_near_expiration', (
            SELECT json_agg(t) FROM (
                SELECT 
                    idempotency_key, 
                    created_at, 
                    (created_at + (interval '1 hour' * COALESCE(w.idempotency_ttl_hours, 24))) as expires_at
                FROM public.webhook_idempotency_keys k
                JOIN public.webhooks w ON w.id = k.webhook_id
                WHERE k.webhook_id = p_webhook_id
                ORDER BY created_at ASC
                LIMIT 50
            ) t
        )
    ) INTO result;
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_webhook_idempotency_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_idempotency_expiration_report TO authenticated;
