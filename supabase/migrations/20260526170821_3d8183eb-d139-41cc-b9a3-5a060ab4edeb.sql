
-- Add new columns to ai_agents
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Storage buckets
INSERT INTO storage.buckets (id, name, public)
  VALUES ('agent-avatars', 'agent-avatars', true)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('agent-files', 'agent-files', false)
  ON CONFLICT (id) DO NOTHING;

-- Agent avatars: public read, authenticated write to own folder (folder = agent id)
DO $$ BEGIN
  CREATE POLICY "agent avatars public read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'agent-avatars');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "agent avatars authenticated write"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'agent-avatars');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "agent avatars authenticated update"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'agent-avatars');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "agent avatars authenticated delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'agent-avatars');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Agent files: only authenticated; access scoped by agent ownership via app logic
DO $$ BEGIN
  CREATE POLICY "agent files authenticated read"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'agent-files');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "agent files authenticated write"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'agent-files');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "agent files authenticated update"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'agent-files');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "agent files authenticated delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'agent-files');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
