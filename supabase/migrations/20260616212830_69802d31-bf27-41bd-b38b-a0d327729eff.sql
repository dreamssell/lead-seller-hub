
-- 1) Permission flag on user_account_access
ALTER TABLE public.user_account_access
  ADD COLUMN IF NOT EXISTS can_manage_pipelines boolean NOT NULL DEFAULT false;

-- 2) RPC: can the current auth user manage pipelines for owner/sub?
CREATE OR REPLACE FUNCTION public.can_user_manage_pipelines(p_owner_id uuid, p_sub_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    auth.uid() = p_owner_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = p_owner_id
        AND (a.sub_company_id = p_sub_company_id OR a.sub_company_id IS NULL)
        AND (a.is_account_admin OR a.can_manage_pipelines)
    );
$$;

-- 3) Open RLS on pipelines / pipeline_stages so account admins / managers can also CRUD
DROP POLICY IF EXISTS "owner manages pipelines" ON public.pipelines;
CREATE POLICY "manage pipelines via permission"
  ON public.pipelines
  USING (public.can_user_manage_pipelines(owner_id, sub_company_id))
  WITH CHECK (public.can_user_manage_pipelines(owner_id, sub_company_id));

DROP POLICY IF EXISTS "manage stages via pipeline" ON public.pipeline_stages;
CREATE POLICY "manage stages via permission"
  ON public.pipeline_stages
  USING (EXISTS (
    SELECT 1 FROM public.pipelines p
    WHERE p.id = pipeline_stages.pipeline_id
      AND public.can_user_manage_pipelines(p.owner_id, p.sub_company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.pipelines p
    WHERE p.id = pipeline_stages.pipeline_id
      AND public.can_user_manage_pipelines(p.owner_id, p.sub_company_id)
  ));

-- 4) Audit table
CREATE TABLE IF NOT EXISTS public.pipeline_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  sub_company_id uuid,
  pipeline_id uuid,
  stage_id uuid,
  entity text NOT NULL CHECK (entity IN ('pipeline','stage')),
  action text NOT NULL CHECK (action IN ('create','update','delete','reorder','link_channel')),
  label text,
  before jsonb,
  after jsonb,
  actor_id uuid,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.pipeline_audit_logs TO authenticated;
GRANT ALL ON public.pipeline_audit_logs TO service_role;

ALTER TABLE public.pipeline_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read pipeline audit via access"
  ON public.pipeline_audit_logs FOR SELECT
  USING (
    auth.uid() = owner_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = pipeline_audit_logs.owner_id
        AND (a.sub_company_id IS NULL OR a.sub_company_id = pipeline_audit_logs.sub_company_id)
    )
  );

CREATE POLICY "insert pipeline audit by managers"
  ON public.pipeline_audit_logs FOR INSERT
  WITH CHECK (
    public.can_user_manage_pipelines(owner_id, sub_company_id)
    AND actor_id = auth.uid()
  );

CREATE INDEX IF NOT EXISTS idx_pipeline_audit_owner_created ON public.pipeline_audit_logs(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_audit_pipeline ON public.pipeline_audit_logs(pipeline_id, created_at DESC);
