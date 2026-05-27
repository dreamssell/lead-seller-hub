
CREATE TABLE IF NOT EXISTS public.agent_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  created_by uuid NOT NULL,
  provider text NOT NULL,
  label text,
  status text NOT NULL DEFAULT 'disconnected',
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_tested_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_agent_integrations_agent ON public.agent_integrations(agent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_integrations TO authenticated;
GRANT ALL ON public.agent_integrations TO service_role;

ALTER TABLE public.agent_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_integrations_select" ON public.agent_integrations
  FOR SELECT TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "agent_integrations_insert" ON public.agent_integrations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "agent_integrations_update" ON public.agent_integrations
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "agent_integrations_delete" ON public.agent_integrations
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_agent_integrations_updated
  BEFORE UPDATE ON public.agent_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
