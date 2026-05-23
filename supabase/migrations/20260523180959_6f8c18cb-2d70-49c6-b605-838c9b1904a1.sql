
-- =========================
-- PLAN PACKAGES (catálogo)
-- =========================
CREATE TABLE IF NOT EXISTS public.plan_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  tagline text,
  monthly_price numeric(12,2) NOT NULL DEFAULT 0,
  credits_included integer NOT NULL DEFAULT 0,
  max_users integer,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_most_chosen boolean NOT NULL DEFAULT false,
  is_custom boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_packages_select_all"
  ON public.plan_packages FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "plan_packages_admin_write"
  ON public.plan_packages FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_plan_packages_updated
  BEFORE UPDATE ON public.plan_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.plan_packages (slug,name,tagline,monthly_price,credits_included,max_users,features,is_most_chosen,is_custom,sort_order)
VALUES
  ('start','Start','Uso essencial do CRM',1500.00,15000,10,
    '["CRM completo para até 10 usuários","Integração com redes sociais","Automações de fluxo","IA de texto (respostas e resumos)","Pipeline e gestão de leads","Suporte por e-mail"]'::jsonb,
    false,false,1),
  ('elite','Elite','Tudo do Start + VoIP',2500.00,28000,25,
    '["Tudo do plano Start","Integração VoIP — ligações normais","Gravação e histórico de chamadas","Discador inteligente","Relatórios avançados de atendimento","SLA e filas de atendimento","Suporte prioritário"]'::jsonb,
    false,false,2),
  ('platinum','Platinum','Tudo do Elite + PABX e Agentes IA',3500.00,45000,50,
    '["Tudo do plano Elite","VoIP/PABX — ligações + WhatsApp Voice","Agentes de IA com automações","Roteamento inteligente por IA","Transcrição e sentimento de chamadas","API completa e webhooks","Sub-empresas (White Label) incluso","Gerente de sucesso dedicado"]'::jsonb,
    true,false,3),
  ('personalite','Personalité','Plataforma completa + customização',0,0,NULL,
    '["Plataforma completa","Implementação dedicada","Customizações sob medida","Integrações personalizadas","SLA contratual","Treinamento da equipe","Suporte 24/7"]'::jsonb,
    false,true,4)
ON CONFLICT (slug) DO NOTHING;

-- =========================
-- WHITE LABEL SETTINGS
-- =========================
CREATE TABLE IF NOT EXISTS public.white_label_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE,
  company_name text,
  logo_light_url text,
  logo_dark_url text,
  logo_icon_url text,
  primary_color text,
  custom_domain text,
  domain_active boolean NOT NULL DEFAULT false,
  login_panel_style text NOT NULL DEFAULT 'gradient',
  login_headline text,
  login_subtext text,
  login_image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.white_label_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wl_owner_all"
  ON public.white_label_settings FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER trg_wl_updated
  BEFORE UPDATE ON public.white_label_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- SUB COMPANIES
-- =========================
CREATE TABLE IF NOT EXISTS public.sub_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  admin_name text NOT NULL,
  admin_email text NOT NULL,
  whatsapp_limit integer NOT NULL DEFAULT 10,
  plan_slug text NOT NULL DEFAULT 'start' REFERENCES public.plan_packages(slug),
  monthly_fee numeric(12,2) NOT NULL DEFAULT 0,
  inherit_branding boolean NOT NULL DEFAULT true,
  byok_inherit boolean NOT NULL DEFAULT true,
  byok_api_key text,
  blocked_pages text[] NOT NULL DEFAULT ARRAY[]::text[],
  credit_limit integer NOT NULL DEFAULT 0,
  credit_balance numeric(14,2) NOT NULL DEFAULT 0,
  credits_used_today numeric(14,2) NOT NULL DEFAULT 0,
  credits_used_30d numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_companies_owner ON public.sub_companies(owner_id);

ALTER TABLE public.sub_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sub_owner_all"
  ON public.sub_companies FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER trg_sub_companies_updated
  BEFORE UPDATE ON public.sub_companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sub_companies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.white_label_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.plan_packages;
