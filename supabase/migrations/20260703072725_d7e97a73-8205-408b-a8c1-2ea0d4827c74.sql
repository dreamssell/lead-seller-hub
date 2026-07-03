
CREATE TABLE IF NOT EXISTS public.user_pipeline_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sub_company_id uuid,
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_pipeline_assignments_unique_scope
  ON public.user_pipeline_assignments (user_id, owner_id, pipeline_id, COALESCE(sub_company_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS user_pipeline_assignments_user_idx ON public.user_pipeline_assignments(user_id);
CREATE INDEX IF NOT EXISTS user_pipeline_assignments_owner_idx ON public.user_pipeline_assignments(owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_pipeline_assignments TO authenticated;
GRANT ALL ON public.user_pipeline_assignments TO service_role;

ALTER TABLE public.user_pipeline_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_can_view_own_pipeline_assignments"
  ON public.user_pipeline_assignments FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = user_pipeline_assignments.owner_id
        AND (a.sub_company_id = user_pipeline_assignments.sub_company_id OR a.sub_company_id IS NULL)
        AND a.is_account_admin
    )
  );

CREATE POLICY "owners_manage_pipeline_assignments"
  ON public.user_pipeline_assignments FOR ALL TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = user_pipeline_assignments.owner_id
        AND (a.sub_company_id = user_pipeline_assignments.sub_company_id OR a.sub_company_id IS NULL)
        AND a.is_account_admin
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = user_pipeline_assignments.owner_id
        AND (a.sub_company_id = user_pipeline_assignments.sub_company_id OR a.sub_company_id IS NULL)
        AND a.is_account_admin
    )
  );
