
-- Webhooks
CREATE TABLE public.webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  secret text,
  api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  events text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage webhooks" ON public.webhooks FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER webhooks_updated_at BEFORE UPDATE ON public.webhooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Custom fields
CREATE TABLE public.custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL DEFAULT 'lead',
  field_key text NOT NULL,
  label text NOT NULL,
  type text NOT NULL DEFAULT 'text',
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity, field_key)
);
ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage custom fields" ON public.custom_fields FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Authenticated view custom fields" ON public.custom_fields FOR SELECT TO authenticated USING (true);
CREATE TRIGGER custom_fields_updated_at BEFORE UPDATE ON public.custom_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SMTP
CREATE TABLE public.smtp_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host text NOT NULL,
  port integer NOT NULL DEFAULT 587,
  username text,
  password text,
  from_email text NOT NULL,
  from_name text,
  use_tls boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.smtp_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage smtp" ON public.smtp_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER smtp_settings_updated_at BEFORE UPDATE ON public.smtp_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- AI settings
CREATE TABLE public.ai_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  default_model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  default_temperature numeric NOT NULL DEFAULT 0.7,
  default_max_tokens integer NOT NULL DEFAULT 1024,
  system_prompt text DEFAULT 'Você é um assistente útil e profissional.',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage ai settings" ON public.ai_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Authenticated view ai settings" ON public.ai_settings FOR SELECT TO authenticated USING (true);
CREATE TRIGGER ai_settings_updated_at BEFORE UPDATE ON public.ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Integrations
CREATE TABLE public.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  name text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage integrations" ON public.integrations FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER integrations_updated_at BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
