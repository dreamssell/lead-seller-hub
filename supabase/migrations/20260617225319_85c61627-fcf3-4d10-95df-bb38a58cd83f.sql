
-- ========== ENUMS ==========
CREATE TYPE public.signature_role AS ENUM ('agente', 'supervisor', 'coordenador', 'diretor');
CREATE TYPE public.signature_method AS ENUM ('canvas', 'email', 'sms');
CREATE TYPE public.signature_status AS ENUM ('draft', 'pending', 'viewed', 'authenticating', 'signed', 'expired', 'cancelled');

-- ========== user_signature_roles ==========
CREATE TABLE public.user_signature_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sub_company_id uuid REFERENCES public.sub_companies(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  role public.signature_role NOT NULL DEFAULT 'agente',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sub_company_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_signature_roles TO authenticated;
GRANT ALL ON public.user_signature_roles TO service_role;
ALTER TABLE public.user_signature_roles ENABLE ROW LEVEL SECURITY;

-- Helper: get signature role for current user in a sub_company
CREATE OR REPLACE FUNCTION public.get_my_signature_role(p_sub_company_id uuid)
RETURNS public.signature_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_signature_roles
  WHERE user_id = auth.uid()
    AND (sub_company_id = p_sub_company_id OR sub_company_id IS NULL)
  ORDER BY (sub_company_id = p_sub_company_id) DESC NULLS LAST
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_signature_leader(p_sub_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_signature_roles
    WHERE user_id = auth.uid()
      AND (sub_company_id = p_sub_company_id OR sub_company_id IS NULL)
      AND role IN ('supervisor','coordenador','diretor')
  ) OR public.has_role(auth.uid(), 'admin'::app_role)
$$;

CREATE POLICY "users read own role" ON public.user_signature_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "owner manages roles" ON public.user_signature_roles
  FOR ALL TO authenticated USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));

-- ========== signature_documents ==========
CREATE TABLE public.signature_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  sub_company_id uuid REFERENCES public.sub_companies(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  contact_id uuid,
  title text NOT NULL,
  description text,
  original_file_path text NOT NULL,
  signed_file_path text,
  method public.signature_method NOT NULL DEFAULT 'canvas',
  status public.signature_status NOT NULL DEFAULT 'draft',
  signer_name text,
  signer_email text,
  signer_phone text,
  validation_hash text,
  signed_ip text,
  signed_user_agent text,
  signed_at timestamptz,
  viewed_at timestamptz,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sigdoc_owner ON public.signature_documents(owner_id);
CREATE INDEX idx_sigdoc_sub ON public.signature_documents(sub_company_id);
CREATE INDEX idx_sigdoc_lead ON public.signature_documents(lead_id);
CREATE INDEX idx_sigdoc_status ON public.signature_documents(status);
CREATE INDEX idx_sigdoc_created_by ON public.signature_documents(created_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.signature_documents TO authenticated;
GRANT ALL ON public.signature_documents TO service_role;
ALTER TABLE public.signature_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents see own, leaders see sub-company"
  ON public.signature_documents FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR owner_id = auth.uid()
    OR public.is_signature_leader(sub_company_id)
  );

CREATE POLICY "users create own documents"
  ON public.signature_documents FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "users update own, leaders update sub"
  ON public.signature_documents FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR owner_id = auth.uid()
    OR public.is_signature_leader(sub_company_id)
  );

CREATE POLICY "owners and leaders delete"
  ON public.signature_documents FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR owner_id = auth.uid()
    OR public.is_signature_leader(sub_company_id)
  );

-- ========== signature_events (timeline) ==========
CREATE TABLE public.signature_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.signature_documents(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  status public.signature_status,
  ip text,
  user_agent text,
  actor_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sigevt_doc ON public.signature_events(document_id, created_at DESC);

GRANT SELECT, INSERT ON public.signature_events TO authenticated;
GRANT ALL ON public.signature_events TO service_role;
ALTER TABLE public.signature_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read events follows document"
  ON public.signature_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.signature_documents d
    WHERE d.id = document_id
      AND (d.created_by = auth.uid() OR d.owner_id = auth.uid() OR public.is_signature_leader(d.sub_company_id))
  ));

CREATE POLICY "insert events follows document"
  ON public.signature_events FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.signature_documents d
    WHERE d.id = document_id
      AND (d.created_by = auth.uid() OR d.owner_id = auth.uid() OR public.is_signature_leader(d.sub_company_id))
  ));

-- ========== signature_tokens (public portal access) ==========
CREATE TABLE public.signature_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.signature_documents(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  sms_pin text,
  email_verified_at timestamptz,
  sms_verified_at timestamptz,
  used_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sigtoken_doc ON public.signature_tokens(document_id);

GRANT SELECT ON public.signature_tokens TO authenticated;
GRANT ALL ON public.signature_tokens TO service_role;
ALTER TABLE public.signature_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read tokens via document"
  ON public.signature_tokens FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.signature_documents d
    WHERE d.id = document_id
      AND (d.created_by = auth.uid() OR d.owner_id = auth.uid() OR public.is_signature_leader(d.sub_company_id))
  ));

-- ========== updated_at triggers ==========
CREATE TRIGGER trg_sigdoc_updated BEFORE UPDATE ON public.signature_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_sigrole_updated BEFORE UPDATE ON public.user_signature_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== Storage policies for signed-documents bucket ==========
CREATE POLICY "signed-docs read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'signed-documents'
    AND EXISTS (
      SELECT 1 FROM public.signature_documents d
      WHERE (d.original_file_path = name OR d.signed_file_path = name)
        AND (d.created_by = auth.uid() OR d.owner_id = auth.uid() OR public.is_signature_leader(d.sub_company_id))
    )
  );

CREATE POLICY "signed-docs insert by authenticated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'signed-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "signed-docs delete own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'signed-documents'
    AND EXISTS (
      SELECT 1 FROM public.signature_documents d
      WHERE (d.original_file_path = name OR d.signed_file_path = name)
        AND (d.created_by = auth.uid() OR d.owner_id = auth.uid() OR public.is_signature_leader(d.sub_company_id))
    )
  );
