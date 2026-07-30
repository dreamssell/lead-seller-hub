ALTER TABLE public.webhooks
  ADD COLUMN IF NOT EXISTS owner_id uuid,
  ADD COLUMN IF NOT EXISTS sub_company_id uuid REFERENCES public.sub_companies(id) ON DELETE CASCADE;

UPDATE public.webhooks w
SET owner_id = COALESCE(
  w.owner_id,
  (SELECT a.owner_id FROM public.user_account_access a
    WHERE a.user_id = w.created_by
    ORDER BY (a.is_owner) DESC, a.created_at ASC LIMIT 1),
  w.created_by
)
WHERE w.owner_id IS NULL;

ALTER TABLE public.webhooks ALTER COLUMN owner_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webhooks_owner ON public.webhooks(owner_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_sub ON public.webhooks(sub_company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhooks TO authenticated;
GRANT ALL ON public.webhooks TO service_role;

DROP POLICY IF EXISTS "Account managers manage own webhooks" ON public.webhooks;
CREATE POLICY "Account managers manage own webhooks"
ON public.webhooks
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_account_manager(auth.uid(), owner_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_account_manager(auth.uid(), owner_id)
);

DROP POLICY IF EXISTS "Account managers view own webhook logs" ON public.webhook_logs;
CREATE POLICY "Account managers view own webhook logs"
ON public.webhook_logs
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.webhooks w
    WHERE w.id = webhook_logs.webhook_id
      AND public.is_account_manager(auth.uid(), w.owner_id)
  )
);