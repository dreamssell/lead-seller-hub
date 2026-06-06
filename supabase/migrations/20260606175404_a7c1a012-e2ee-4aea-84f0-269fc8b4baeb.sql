ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS authorized_domains TEXT[] DEFAULT '{}';
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS log_retention_days INTEGER DEFAULT 30;

CREATE TABLE IF NOT EXISTS public.unauthorized_embed_attempts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    connection_id UUID REFERENCES public.whatsapp_connections(id),
    domain TEXT NOT NULL,
    user_agent TEXT,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.unauthorized_embed_attempts TO authenticated;
GRANT ALL ON public.unauthorized_embed_attempts TO service_role;
ALTER TABLE public.unauthorized_embed_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own connection attempts" ON public.unauthorized_embed_attempts FOR SELECT USING (true);

ALTER TABLE public.connection_events ADD COLUMN IF NOT EXISTS test_event_id TEXT;
