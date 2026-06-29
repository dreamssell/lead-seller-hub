
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS presence text,
  ADD COLUMN IF NOT EXISTS presence_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='customers';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.customers';
  END IF;
END $$;
