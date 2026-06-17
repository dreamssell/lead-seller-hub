
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.connection_events;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_connections;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE public.connection_events REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_connections REPLICA IDENTITY FULL;
