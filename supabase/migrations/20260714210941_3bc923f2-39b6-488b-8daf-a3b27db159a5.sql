
CREATE TABLE public.waha_import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  triggered_by UUID,
  status TEXT NOT NULL DEFAULT 'running',
  chats_total INTEGER NOT NULL DEFAULT 0,
  chats_processed INTEGER NOT NULL DEFAULT 0,
  current_chat_label TEXT,
  messages_considered INTEGER NOT NULL DEFAULT 0,
  messages_inserted INTEGER NOT NULL DEFAULT 0,
  messages_skipped INTEGER NOT NULL DEFAULT 0,
  customers_created INTEGER NOT NULL DEFAULT 0,
  failed_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.waha_import_runs TO authenticated;
GRANT ALL ON public.waha_import_runs TO service_role;

ALTER TABLE public.waha_import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or account admin can view import runs"
ON public.waha_import_runs FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.user_account_access uaa
    WHERE uaa.user_id = auth.uid()
      AND uaa.owner_id = waha_import_runs.owner_id
      AND uaa.is_account_admin = true
  )
  OR public.has_role(auth.uid(), 'admin')
);

CREATE INDEX idx_waha_import_runs_owner_started ON public.waha_import_runs(owner_id, started_at DESC);
CREATE INDEX idx_waha_import_runs_connection ON public.waha_import_runs(connection_id, started_at DESC);

CREATE TRIGGER trg_waha_import_runs_updated
BEFORE UPDATE ON public.waha_import_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.waha_import_runs;
