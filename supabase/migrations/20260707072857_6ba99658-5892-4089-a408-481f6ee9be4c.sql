-- Histórico de execuções do job role-label-backfill
CREATE TABLE public.role_label_backfill_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  titulares_ceo INTEGER NOT NULL DEFAULT 0,
  empty_defaulted INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'success',
  triggered_by TEXT NOT NULL DEFAULT 'cron',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rlbr_started ON public.role_label_backfill_runs (started_at DESC);

GRANT SELECT ON public.role_label_backfill_runs TO authenticated;
GRANT ALL ON public.role_label_backfill_runs TO service_role;

ALTER TABLE public.role_label_backfill_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform admin can view backfill runs"
ON public.role_label_backfill_runs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Histórico de alterações de role_label
CREATE TABLE public.role_label_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  owner_id UUID,
  sub_company_id UUID,
  from_label TEXT,
  to_label TEXT,
  source TEXT NOT NULL,
  changed_by UUID,
  changed_by_email TEXT,
  target_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rlh_user ON public.role_label_history (user_id, created_at DESC);
CREATE INDEX idx_rlh_owner ON public.role_label_history (owner_id, created_at DESC);
CREATE INDEX idx_rlh_created ON public.role_label_history (created_at DESC);

GRANT SELECT ON public.role_label_history TO authenticated;
GRANT ALL ON public.role_label_history TO service_role;

ALTER TABLE public.role_label_history ENABLE ROW LEVEL SECURITY;

-- Dono da plataforma vê tudo; dono da conta vê o histórico do próprio escopo.
CREATE POLICY "platform admin sees all role history"
ON public.role_label_history FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "account owner sees own scope role history"
ON public.role_label_history FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.user_account_access a
    WHERE a.user_id = auth.uid()
      AND a.owner_id = public.role_label_history.owner_id
      AND a.is_account_admin
  )
);