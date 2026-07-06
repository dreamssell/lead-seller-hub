
-- 1) Multi-tenant RLS on whatsapp_connections so each empresa/sub-empresa
-- manages its own WAHA (and other providers) sessions in isolation.
DROP POLICY IF EXISTS "Admins manage whatsapp connections" ON public.whatsapp_connections;

-- Global admins keep full access
CREATE POLICY "Admins manage whatsapp connections"
ON public.whatsapp_connections
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Owners see & manage their own connections
CREATE POLICY "Owners read whatsapp connections"
ON public.whatsapp_connections
FOR SELECT
TO authenticated
USING (
  auth.uid() = owner_id
  OR EXISTS (
    SELECT 1 FROM public.user_account_access a
    WHERE a.user_id = auth.uid()
      AND a.owner_id = whatsapp_connections.owner_id
      AND (
        a.sub_company_id IS NULL
        OR a.sub_company_id = whatsapp_connections.sub_company_id
      )
  )
);

CREATE POLICY "Owners insert whatsapp connections"
ON public.whatsapp_connections
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = owner_id
  OR EXISTS (
    SELECT 1 FROM public.user_account_access a
    WHERE a.user_id = auth.uid()
      AND a.owner_id = whatsapp_connections.owner_id
      AND a.is_account_admin
      AND (
        a.sub_company_id IS NULL
        OR a.sub_company_id = whatsapp_connections.sub_company_id
      )
  )
);

CREATE POLICY "Owners update whatsapp connections"
ON public.whatsapp_connections
FOR UPDATE
TO authenticated
USING (
  auth.uid() = owner_id
  OR EXISTS (
    SELECT 1 FROM public.user_account_access a
    WHERE a.user_id = auth.uid()
      AND a.owner_id = whatsapp_connections.owner_id
      AND a.is_account_admin
      AND (
        a.sub_company_id IS NULL
        OR a.sub_company_id = whatsapp_connections.sub_company_id
      )
  )
)
WITH CHECK (
  auth.uid() = owner_id
  OR EXISTS (
    SELECT 1 FROM public.user_account_access a
    WHERE a.user_id = auth.uid()
      AND a.owner_id = whatsapp_connections.owner_id
      AND a.is_account_admin
      AND (
        a.sub_company_id IS NULL
        OR a.sub_company_id = whatsapp_connections.sub_company_id
      )
  )
);

CREATE POLICY "Owners delete whatsapp connections"
ON public.whatsapp_connections
FOR DELETE
TO authenticated
USING (
  auth.uid() = owner_id
  OR EXISTS (
    SELECT 1 FROM public.user_account_access a
    WHERE a.user_id = auth.uid()
      AND a.owner_id = whatsapp_connections.owner_id
      AND a.is_account_admin
      AND (
        a.sub_company_id IS NULL
        OR a.sub_company_id = whatsapp_connections.sub_company_id
      )
  )
);

-- 2) Guard rail: prevent two rows sharing the same WAHA (base_url, session)
-- within the same tenant scope — avoids silent hijacks between sub-empresas.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_connections_waha_session_unique
ON public.whatsapp_connections (
  (metadata->>'url'),
  (metadata->>'session')
)
WHERE provider = 'waha'
  AND metadata->>'session' IS NOT NULL
  AND metadata->>'session' <> '';
