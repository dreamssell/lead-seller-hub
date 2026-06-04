-- Tabela company_settings pode já ter uma estrutura fixa, vamos adicionar uma coluna JSONB para flexibilidade se não existir
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'config') THEN
        ALTER TABLE public.company_settings ADD COLUMN config JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- Garantir GRANTs caso a tabela seja nova ou tenha sido alterada
GRANT SELECT, UPDATE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;
