
GRANT SELECT ON public.connection_events TO authenticated;

DROP POLICY IF EXISTS "Owners view connection events" ON public.connection_events;
CREATE POLICY "Owners view connection events"
ON public.connection_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.whatsapp_connections c
    WHERE c.id = connection_events.connection_id
      AND (
        c.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.user_account_access a
          WHERE a.user_id = auth.uid()
            AND a.owner_id = c.owner_id
            AND (
              (a.is_account_admin AND a.sub_company_id IS NULL)
              OR (c.sub_company_id IS NOT NULL AND a.sub_company_id = c.sub_company_id)
            )
        )
      )
  )
);
