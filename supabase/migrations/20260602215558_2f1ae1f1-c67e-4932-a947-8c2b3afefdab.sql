-- Adiciona colunas de idempotência
ALTER TABLE public.webhooks 
ADD COLUMN IF NOT EXISTS idempotency_header TEXT DEFAULT 'X-Idempotency-Key',
ADD COLUMN IF NOT EXISTS idempotency_missing_behavior TEXT DEFAULT 'generate';

-- Comentários para documentação
COMMENT ON COLUMN public.webhooks.idempotency_header IS 'Nome do header de idempotência a ser enviado na requisição.';
COMMENT ON COLUMN public.webhooks.idempotency_missing_behavior IS 'Comportamento se a chave de idempotência não for fornecida: generate (gera UUID), fail (erro), skip (não envia header).';
