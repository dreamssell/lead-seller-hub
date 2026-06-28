
-- 1) Audit runs table
CREATE TABLE IF NOT EXISTS public.evolution_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  owner_id uuid,
  sub_company_id uuid,
  started_by uuid,
  dry_run boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'running', -- running | success | partial | error | cancelled
  evolution_totals jsonb NOT NULL DEFAULT '{}'::jsonb, -- { contacts, chats, messages }
  db_totals jsonb NOT NULL DEFAULT '{}'::jsonb,        -- { customers, messages, media }
  imported jsonb NOT NULL DEFAULT '{}'::jsonb,         -- counts inserted this run
  skipped jsonb NOT NULL DEFAULT '{}'::jsonb,          -- reason -> count
  endpoint_failures jsonb NOT NULL DEFAULT '{}'::jsonb,-- endpoint -> error info
  congruence text,                                     -- congruent | pending | divergent
  notes text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.evolution_import_runs TO authenticated;
GRANT ALL ON public.evolution_import_runs TO service_role;

ALTER TABLE public.evolution_import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners and admins read import runs"
  ON public.evolution_import_runs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR owner_id = auth.uid()
    OR started_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = evolution_import_runs.owner_id
        AND (a.sub_company_id IS NULL OR a.sub_company_id = evolution_import_runs.sub_company_id)
    )
  );

CREATE POLICY "service writes import runs"
  ON public.evolution_import_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_import_runs_connection ON public.evolution_import_runs(connection_id, started_at DESC);

CREATE TRIGGER trg_import_runs_updated
  BEFORE UPDATE ON public.evolution_import_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Storage policies for whatsapp-media (private bucket)
-- Service role writes (edge function). Authenticated users read media of
-- connections they can access. Path convention: {owner_id}/{connection_id}/{msg_id}.{ext}
CREATE POLICY "service writes whatsapp media"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'whatsapp-media')
  WITH CHECK (bucket_id = 'whatsapp-media');

CREATE POLICY "authorized users read whatsapp media"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'whatsapp-media' AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.whatsapp_connections c
        WHERE (storage.foldername(name))[1] = c.owner_id::text
          AND (storage.foldername(name))[2] = c.id::text
          AND (
            c.owner_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.user_account_access a
              WHERE a.user_id = auth.uid()
                AND a.owner_id = c.owner_id
                AND (a.sub_company_id IS NULL OR a.sub_company_id = c.sub_company_id)
            )
          )
      )
    )
  );
