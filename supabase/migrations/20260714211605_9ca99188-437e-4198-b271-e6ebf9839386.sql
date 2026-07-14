-- Allow the WAHA import owner / account admin / platform admin to request
-- cancellation of an in-progress run by flipping status to 'cancel_requested'.
-- The edge function loop polls the row and stops gracefully.
GRANT UPDATE ON public.waha_import_runs TO authenticated;

CREATE POLICY "Owner or account admin can cancel import runs"
ON public.waha_import_runs FOR UPDATE
TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.user_account_access uaa
    WHERE uaa.user_id = auth.uid()
      AND uaa.owner_id = waha_import_runs.owner_id
      AND uaa.is_account_admin = true
  )
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.user_account_access uaa
    WHERE uaa.user_id = auth.uid()
      AND uaa.owner_id = waha_import_runs.owner_id
      AND uaa.is_account_admin = true
  )
  OR public.has_role(auth.uid(), 'admin')
);