
CREATE TABLE public.client_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  sub_company_id UUID REFERENCES public.sub_companies(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  document TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  segment TEXT,
  plan_slug TEXT DEFAULT 'basic',
  status TEXT NOT NULL DEFAULT 'active',
  logo_url TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_companies_owner ON public.client_companies(owner_id);
CREATE INDEX idx_client_companies_sub ON public.client_companies(sub_company_id);
CREATE INDEX idx_client_companies_status ON public.client_companies(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_companies TO authenticated;
GRANT ALL ON public.client_companies TO service_role;

ALTER TABLE public.client_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner or admin full access"
ON public.client_companies FOR ALL
TO authenticated
USING (
  auth.uid() = owner_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.user_account_access a
    WHERE a.user_id = auth.uid()
      AND a.owner_id = client_companies.owner_id
      AND (a.sub_company_id = client_companies.sub_company_id OR a.sub_company_id IS NULL)
  )
)
WITH CHECK (
  auth.uid() = owner_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.user_account_access a
    WHERE a.user_id = auth.uid()
      AND a.owner_id = client_companies.owner_id
      AND (a.sub_company_id = client_companies.sub_company_id OR a.sub_company_id IS NULL)
  )
);

CREATE TRIGGER update_client_companies_updated_at
BEFORE UPDATE ON public.client_companies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
