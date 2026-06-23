
-- Feature toggle on sub-companies
ALTER TABLE public.sub_companies
  ADD COLUMN IF NOT EXISTS feature_landing_builder boolean NOT NULL DEFAULT false;

-- Landing pages (the "Outros" simple page builder)
CREATE TABLE IF NOT EXISTS public.landing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  sub_company_id uuid REFERENCES public.sub_companies(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  headline text,
  subheadline text,
  page_bg_color text NOT NULL DEFAULT '#0F172A',
  text_color text NOT NULL DEFAULT '#FFFFFF',
  align text NOT NULL DEFAULT 'center', -- left | center | right
  tracking_label text,
  status text NOT NULL DEFAULT 'draft', -- draft | published
  pipeline_id uuid,
  auto_create_lead boolean NOT NULL DEFAULT true,
  form_mode text NOT NULL DEFAULT 'none', -- none | simple | full | choice
  form_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  view_count integer NOT NULL DEFAULT 0,
  click_count integer NOT NULL DEFAULT 0,
  lead_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_pages TO authenticated;
GRANT SELECT ON public.landing_pages TO anon;
GRANT ALL ON public.landing_pages TO service_role;
ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read published pages"
  ON public.landing_pages FOR SELECT TO anon
  USING (status = 'published');

CREATE POLICY "authenticated read pages they can access"
  ON public.landing_pages FOR SELECT TO authenticated
  USING (
    auth.uid() = owner_id
    OR auth.uid() = created_by
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = landing_pages.owner_id
        AND (a.sub_company_id = landing_pages.sub_company_id OR a.sub_company_id IS NULL)
    )
    OR public.is_signature_leader(landing_pages.sub_company_id)
  );

CREATE POLICY "authorized users manage pages"
  ON public.landing_pages FOR ALL TO authenticated
  USING (
    auth.uid() = owner_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = landing_pages.owner_id
        AND (a.sub_company_id = landing_pages.sub_company_id OR a.sub_company_id IS NULL)
        AND a.is_account_admin = true
    )
    OR public.is_signature_leader(landing_pages.sub_company_id)
  )
  WITH CHECK (
    auth.uid() = owner_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = landing_pages.owner_id
        AND (a.sub_company_id = landing_pages.sub_company_id OR a.sub_company_id IS NULL)
        AND a.is_account_admin = true
    )
    OR public.is_signature_leader(landing_pages.sub_company_id)
  );

CREATE TRIGGER set_landing_pages_updated_at
  BEFORE UPDATE ON public.landing_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Buttons / CTAs on each page
CREATE TABLE IF NOT EXISTS public.landing_buttons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  label text NOT NULL,
  url text NOT NULL,
  action_type text NOT NULL DEFAULT 'link', -- whatsapp | site | link | form
  bg_color text NOT NULL DEFAULT '#3B82F6',
  text_color text NOT NULL DEFAULT '#FFFFFF',
  shape text NOT NULL DEFAULT 'rounded', -- rounded | square | pill
  size text NOT NULL DEFAULT 'lg',
  sort_order integer NOT NULL DEFAULT 0,
  click_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_buttons TO authenticated;
GRANT SELECT ON public.landing_buttons TO anon;
GRANT ALL ON public.landing_buttons TO service_role;
ALTER TABLE public.landing_buttons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read buttons of published pages"
  ON public.landing_buttons FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.landing_pages p
    WHERE p.id = landing_buttons.page_id AND p.status = 'published'
  ));

CREATE POLICY "authenticated read buttons by page access"
  ON public.landing_buttons FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.landing_pages p WHERE p.id = landing_buttons.page_id
  ));

CREATE POLICY "manage buttons via page access"
  ON public.landing_buttons FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.landing_pages p
    WHERE p.id = landing_buttons.page_id
      AND (
        auth.uid() = p.owner_id
        OR public.has_role(auth.uid(), 'admin'::app_role)
        OR EXISTS (
          SELECT 1 FROM public.user_account_access a
          WHERE a.user_id = auth.uid() AND a.owner_id = p.owner_id
            AND (a.sub_company_id = p.sub_company_id OR a.sub_company_id IS NULL)
            AND a.is_account_admin = true
        )
        OR public.is_signature_leader(p.sub_company_id)
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.landing_pages p
    WHERE p.id = landing_buttons.page_id
      AND (
        auth.uid() = p.owner_id
        OR public.has_role(auth.uid(), 'admin'::app_role)
        OR EXISTS (
          SELECT 1 FROM public.user_account_access a
          WHERE a.user_id = auth.uid() AND a.owner_id = p.owner_id
            AND (a.sub_company_id = p.sub_company_id OR a.sub_company_id IS NULL)
            AND a.is_account_admin = true
        )
        OR public.is_signature_leader(p.sub_company_id)
      )
  ));

CREATE TRIGGER set_landing_buttons_updated_at
  BEFORE UPDATE ON public.landing_buttons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Events: view / click / lead
CREATE TABLE IF NOT EXISTS public.landing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  button_id uuid REFERENCES public.landing_buttons(id) ON DELETE SET NULL,
  type text NOT NULL, -- view | click | lead
  lead_id uuid,
  referrer text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.landing_events TO authenticated;
GRANT INSERT ON public.landing_events TO anon;
GRANT ALL ON public.landing_events TO service_role;
ALTER TABLE public.landing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can log events on published pages"
  ON public.landing_events FOR INSERT TO anon, authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.landing_pages p
    WHERE p.id = landing_events.page_id AND p.status = 'published'
  ));

CREATE POLICY "read events by page access"
  ON public.landing_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.landing_pages p
    WHERE p.id = landing_events.page_id
      AND (
        auth.uid() = p.owner_id
        OR public.has_role(auth.uid(), 'admin'::app_role)
        OR EXISTS (
          SELECT 1 FROM public.user_account_access a
          WHERE a.user_id = auth.uid() AND a.owner_id = p.owner_id
            AND (a.sub_company_id = p.sub_company_id OR a.sub_company_id IS NULL)
        )
        OR public.is_signature_leader(p.sub_company_id)
      )
  ));

CREATE INDEX IF NOT EXISTS landing_events_page_id_idx ON public.landing_events(page_id);
CREATE INDEX IF NOT EXISTS landing_events_created_at_idx ON public.landing_events(created_at DESC);
CREATE INDEX IF NOT EXISTS landing_buttons_page_id_idx ON public.landing_buttons(page_id, sort_order);
CREATE INDEX IF NOT EXISTS landing_pages_owner_idx ON public.landing_pages(owner_id, sub_company_id);
