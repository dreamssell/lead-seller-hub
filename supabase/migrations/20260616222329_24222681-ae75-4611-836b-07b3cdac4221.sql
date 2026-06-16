DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_audit_logs;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
ALTER TABLE public.pipeline_audit_logs REPLICA IDENTITY FULL;