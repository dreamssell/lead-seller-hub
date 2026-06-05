-- Adiciona a coluna channel na tabela customers se não existir
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS channel TEXT;

-- Expande o enum whatsapp_provider para incluir novos canais
-- Nota: Enums não podem ser alterados dentro de um bloco de transação com IF NOT EXISTS de forma simples em algumas versões de Postgres,
-- mas podemos usar ALTER TYPE ... ADD VALUE.
ALTER TYPE public.whatsapp_provider ADD VALUE IF NOT EXISTS 'instagram';
ALTER TYPE public.whatsapp_provider ADD VALUE IF NOT EXISTS 'telegram';
ALTER TYPE public.whatsapp_provider ADD VALUE IF NOT EXISTS 'facebook';
ALTER TYPE public.whatsapp_provider ADD VALUE IF NOT EXISTS 'linkedin';
ALTER TYPE public.whatsapp_provider ADD VALUE IF NOT EXISTS 'tiktok';
ALTER TYPE public.whatsapp_provider ADD VALUE IF NOT EXISTS 'youtube';

-- Garante permissões
GRANT ALL ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
GRANT ALL ON public.whatsapp_connections TO authenticated;
GRANT ALL ON public.whatsapp_connections TO service_role;