CREATE TABLE public.connection_events (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    connection_id UUID NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- 'lead', 'message', 'failure', 'sync', 'webhook'
    status TEXT NOT NULL, -- 'success', 'failure'
    payload JSONB,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.connection_events ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "Users can view their connection events" ON public.connection_events
    FOR SELECT TO authenticated USING (true);

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.connection_events TO authenticated;
GRANT ALL ON public.connection_events TO service_role;

-- Índice para performance
CREATE INDEX idx_connection_events_connection_id ON public.connection_events(connection_id);
CREATE INDEX idx_connection_events_created_at ON public.connection_events(created_at);
