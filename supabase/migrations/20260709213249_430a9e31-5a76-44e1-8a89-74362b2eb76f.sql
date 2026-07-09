
CREATE TABLE public.call_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  sub_company_id UUID REFERENCES public.sub_companies(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  contact_name TEXT,
  phone_number TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'outbound',
  channel TEXT NOT NULL DEFAULT 'wavoip',
  connection_label TEXT,
  connection_id UUID,
  status TEXT NOT NULL DEFAULT 'initiated',
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  recording_url TEXT,
  recording_path TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_call_history_owner ON public.call_history(owner_id, started_at DESC);
CREATE INDEX idx_call_history_sub ON public.call_history(sub_company_id, started_at DESC);
CREATE INDEX idx_call_history_user ON public.call_history(user_id, started_at DESC);
CREATE INDEX idx_call_history_customer ON public.call_history(customer_id, started_at DESC);
CREATE INDEX idx_call_history_phone ON public.call_history(phone_number);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_history TO authenticated;
GRANT ALL ON public.call_history TO service_role;

ALTER TABLE public.call_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view call history"
  ON public.call_history FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = call_history.owner_id
        AND (a.sub_company_id = call_history.sub_company_id OR a.sub_company_id IS NULL)
    )
  );

CREATE POLICY "Members can insert call history"
  ON public.call_history FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = call_history.owner_id
        AND (a.sub_company_id = call_history.sub_company_id OR a.sub_company_id IS NULL)
    )
  );

CREATE POLICY "Members can update own call history"
  ON public.call_history FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = call_history.owner_id
        AND (a.sub_company_id = call_history.sub_company_id OR a.sub_company_id IS NULL)
        AND a.is_account_admin
    )
  );

CREATE POLICY "Owners/admins can delete call history"
  ON public.call_history FOR DELETE TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER trg_call_history_updated_at
  BEFORE UPDATE ON public.call_history
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.customer_assignments_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  sub_company_id UUID REFERENCES public.sub_companies(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  source TEXT,
  channel TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_assign_hist_customer ON public.customer_assignments_history(customer_id, created_at DESC);
CREATE INDEX idx_customer_assign_hist_owner ON public.customer_assignments_history(owner_id, created_at DESC);

GRANT SELECT, INSERT ON public.customer_assignments_history TO authenticated;
GRANT ALL ON public.customer_assignments_history TO service_role;

ALTER TABLE public.customer_assignments_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view assignment history"
  ON public.customer_assignments_history FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = customer_assignments_history.owner_id
        AND (a.sub_company_id = customer_assignments_history.sub_company_id OR a.sub_company_id IS NULL)
    )
  );

CREATE POLICY "Members can insert assignment history"
  ON public.customer_assignments_history FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = customer_assignments_history.owner_id
        AND (a.sub_company_id = customer_assignments_history.sub_company_id OR a.sub_company_id IS NULL)
    )
  );
