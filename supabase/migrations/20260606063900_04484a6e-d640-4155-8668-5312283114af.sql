ALTER TABLE public.connection_events ADD COLUMN IF NOT EXISTS status_detail TEXT;
ALTER TABLE public.connection_events ADD COLUMN IF NOT EXISTS metadata_json JSONB;
GRANT ALL ON TABLE public.connection_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.connection_events TO authenticated;

-- Criar tabela para agendar verificações de falhas
CREATE TABLE IF NOT EXISTS public.connection_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID REFERENCES public.whatsapp_connections(id),
    consecutive_failures INTEGER DEFAULT 0,
    last_alert_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
GRANT ALL ON TABLE public.connection_alerts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.connection_alerts TO authenticated;