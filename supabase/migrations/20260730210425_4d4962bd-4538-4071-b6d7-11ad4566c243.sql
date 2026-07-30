ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS raw_payload jsonb;

CREATE TABLE IF NOT EXISTS public.lead_integration_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  sub_company_id uuid,
  provider text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  pipeline_id uuid,
  stage_id uuid,
  default_status text NOT NULL DEFAULT 'novo',
  create_crm_event boolean NOT NULL DEFAULT true,
  save_contact boolean NOT NULL DEFAULT true,
  create_attendance boolean NOT NULL DEFAULT true,
  attendance_stage text NOT NULL DEFAULT 'auto',
  queue_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_integration_settings_scope_uniq
  ON public.lead_integration_settings (owner_id, provider, COALESCE(sub_company_id, '00000000-0000-0000-0000-000000000000'::uuid));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_integration_settings TO authenticated;
GRANT ALL ON public.lead_integration_settings TO service_role;

ALTER TABLE public.lead_integration_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_integration_settings_manage"
ON public.lead_integration_settings
FOR ALL
TO authenticated
USING (public.is_manager_or_owner_of(owner_id))
WITH CHECK (public.is_manager_or_owner_of(owner_id));

CREATE TRIGGER trg_touch_lead_integration_settings
BEFORE UPDATE ON public.lead_integration_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();