CREATE TABLE IF NOT EXISTS public.log_cleanup_history (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    connection_id UUID REFERENCES public.whatsapp_connections(id),
    deleted_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'success',
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.log_cleanup_history TO authenticated;
GRANT ALL ON public.log_cleanup_history TO service_role;
ALTER TABLE public.log_cleanup_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view cleanup history" ON public.log_cleanup_history FOR SELECT USING (true);

ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS last_cleanup_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS next_cleanup_at TIMESTAMP WITH TIME ZONE;

CREATE OR REPLACE FUNCTION public.cleanup_connection_events() RETURNS void AS $$
DECLARE
    conn RECORD;
    deleted_count_local INTEGER;
BEGIN
    FOR conn IN SELECT id, log_retention_days FROM public.whatsapp_connections WHERE log_retention_days IS NOT NULL LOOP
        DELETE FROM public.connection_events 
        WHERE connection_id = conn.id 
        AND created_at < (now() - (conn.log_retention_days || ' days')::interval)
        RETURNING count(*) INTO deleted_count_local;
        
        INSERT INTO public.log_cleanup_history (connection_id, deleted_count, status)
        VALUES (conn.id, COALESCE(deleted_count_local, 0), 'success');
        
        UPDATE public.whatsapp_connections 
        SET last_cleanup_at = now(),
            next_cleanup_at = now() + interval '24 hours'
        WHERE id = conn.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
