-- Tabela para armazenar as chaves de idempotência e suas respostas
CREATE TABLE IF NOT EXISTS public.webhook_idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    response_status INTEGER,
    response_body TEXT,
    latency_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(webhook_id, idempotency_key)
);

-- Adicionando colunas de rastreamento nos logs
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS is_idempotent_hit BOOLEAN DEFAULT FALSE;

-- Garantindo permissões
GRANT ALL ON public.webhook_idempotency_keys TO authenticated;
GRANT ALL ON public.webhook_idempotency_keys TO service_role;

-- Habilitando RLS
ALTER TABLE public.webhook_idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Política de acesso básica (pode ser refinada se necessário)
CREATE POLICY "Users can manage idempotency keys" 
ON public.webhook_idempotency_keys 
FOR ALL 
TO authenticated 
USING (true);

-- Função para limpeza de chaves antigas (padrão 24h)
CREATE OR REPLACE FUNCTION public.cleanup_expired_idempotency_keys(ttl_hours integer DEFAULT 24)
RETURNS integer AS $$
DECLARE
    deleted_count integer;
BEGIN
    DELETE FROM public.webhook_idempotency_keys
    WHERE created_at < now() - (ttl_hours || ' hours')::interval;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Índice para acelerar a busca por chave
CREATE INDEX IF NOT EXISTS idx_idempotency_lookup ON public.webhook_idempotency_keys (webhook_id, idempotency_key);
