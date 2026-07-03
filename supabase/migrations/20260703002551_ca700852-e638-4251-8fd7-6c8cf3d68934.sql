
-- SIP Configurations: encrypted at rest, admin-only access via edge function.
CREATE TABLE IF NOT EXISTS public.sip_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  sub_company_id uuid NULL REFERENCES public.sub_companies(id) ON DELETE CASCADE,
  client_company_id uuid NULL REFERENCES public.client_companies(id) ON DELETE CASCADE,
  server text NOT NULL,
  port text,
  ws_uri text,
  username text NOT NULL,
  password_ciphertext text NOT NULL,
  password_iv text NOT NULL,
  display_name text,
  transport text DEFAULT 'WSS',
  auto_record boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS sip_cfg_scope_uidx
  ON public.sip_configurations (
    owner_id,
    COALESCE(sub_company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(client_company_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sip_configurations TO authenticated;
GRANT ALL ON public.sip_configurations TO service_role;

ALTER TABLE public.sip_configurations ENABLE ROW LEVEL SECURITY;

-- Only platform admins can read/write directly. Regular users must never touch this table.
CREATE POLICY "Admins can read SIP configs"
  ON public.sip_configurations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert SIP configs"
  ON public.sip_configurations FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update SIP configs"
  ON public.sip_configurations FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete SIP configs"
  ON public.sip_configurations FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER sip_configurations_set_updated_at
  BEFORE UPDATE ON public.sip_configurations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit trail
CREATE TABLE IF NOT EXISTS public.sip_config_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid,
  owner_id uuid,
  sub_company_id uuid,
  client_company_id uuid,
  action text NOT NULL, -- create | update | delete | read
  changes jsonb,
  changed_by uuid,
  changed_by_email text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.sip_config_audit TO authenticated;
GRANT ALL ON public.sip_config_audit TO service_role;

ALTER TABLE public.sip_config_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read SIP audit"
  ON public.sip_config_audit FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role writes SIP audit"
  ON public.sip_config_audit FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
