
-- 1. Remove sensitive tables from realtime publication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sub_companies') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.sub_companies';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sub_company_login_tokens') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.sub_company_login_tokens';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sub_company_api_keys') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.sub_company_api_keys';
  END IF;
END$$;

-- 2. Restrict mcp_servers write policies to authenticated only
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='mcp_servers' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.mcp_servers', p.policyname);
  END LOOP;
END$$;

CREATE POLICY "mcp_servers_select" ON public.mcp_servers FOR SELECT TO authenticated
USING (
  (sub_company_id IS NULL AND public.has_role(auth.uid(), 'admin'::app_role))
  OR (sub_company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_account_access ua
    WHERE ua.user_id = auth.uid() AND ua.sub_company_id = mcp_servers.sub_company_id
  ))
);

CREATE POLICY "mcp_servers_insert" ON public.mcp_servers FOR INSERT TO authenticated
WITH CHECK (
  (sub_company_id IS NULL AND public.has_role(auth.uid(), 'admin'::app_role))
  OR (sub_company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_account_access ua
    WHERE ua.user_id = auth.uid() AND ua.sub_company_id = mcp_servers.sub_company_id AND ua.is_account_admin = true
  ))
);

CREATE POLICY "mcp_servers_update" ON public.mcp_servers FOR UPDATE TO authenticated
USING (
  (sub_company_id IS NULL AND public.has_role(auth.uid(), 'admin'::app_role))
  OR (sub_company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_account_access ua
    WHERE ua.user_id = auth.uid() AND ua.sub_company_id = mcp_servers.sub_company_id AND ua.is_account_admin = true
  ))
);

CREATE POLICY "mcp_servers_delete" ON public.mcp_servers FOR DELETE TO authenticated
USING (
  (sub_company_id IS NULL AND public.has_role(auth.uid(), 'admin'::app_role))
  OR (sub_company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_account_access ua
    WHERE ua.user_id = auth.uid() AND ua.sub_company_id = mcp_servers.sub_company_id AND ua.is_account_admin = true
  ))
);

-- 3. Column-level: hide signing secrets from client roles. Edge functions use service_role and remain unaffected.
REVOKE SELECT (secret_key) ON public.crm_webhooks FROM authenticated, anon;
REVOKE SELECT (secret, previous_secret) ON public.webhooks FROM authenticated, anon;
