DROP POLICY IF EXISTS "Users can update messages for their customers" ON public.chat_messages;

CREATE POLICY "Users can update messages for their customers"
ON public.chat_messages
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = chat_messages.customer_id
      AND (
        c.created_by = auth.uid()
        OR c.owner_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::app_role)
        OR EXISTS (
          SELECT 1
          FROM public.user_account_access a
          WHERE a.user_id = auth.uid()
            AND a.owner_id = COALESCE(c.owner_id, c.created_by)
            AND (a.sub_company_id = c.sub_company_id OR a.sub_company_id IS NULL)
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = chat_messages.customer_id
      AND (
        c.created_by = auth.uid()
        OR c.owner_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::app_role)
        OR EXISTS (
          SELECT 1
          FROM public.user_account_access a
          WHERE a.user_id = auth.uid()
            AND a.owner_id = COALESCE(c.owner_id, c.created_by)
            AND (a.sub_company_id = c.sub_company_id OR a.sub_company_id IS NULL)
        )
      )
  )
);