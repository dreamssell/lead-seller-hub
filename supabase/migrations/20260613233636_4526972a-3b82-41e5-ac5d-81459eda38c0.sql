
-- crm_email_templates
DROP POLICY IF EXISTS "Admins can manage templates" ON public.crm_email_templates;
CREATE POLICY "Admins can read templates" ON public.crm_email_templates
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can modify templates" ON public.crm_email_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update templates" ON public.crm_email_templates
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete templates" ON public.crm_email_templates
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- connection_events
DROP POLICY IF EXISTS "Users can view connection events" ON public.connection_events;
DROP POLICY IF EXISTS "Authenticated can view connection events" ON public.connection_events;
CREATE POLICY "Admins can view connection events" ON public.connection_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- mcp_server_logs
DROP POLICY IF EXISTS "Users can view mcp logs" ON public.mcp_server_logs;
DROP POLICY IF EXISTS "Authenticated can view mcp_server_logs" ON public.mcp_server_logs;
CREATE POLICY "Admins can view mcp_server_logs" ON public.mcp_server_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- mcp_servers: master rows (sub_company_id IS NULL) only readable by admins
DROP POLICY IF EXISTS "Users can view mcp_servers of their sub_company or master" ON public.mcp_servers;
CREATE POLICY "Users can view mcp_servers of their sub_company or master" ON public.mcp_servers
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL AND (
      (sub_company_id IS NULL AND public.has_role(auth.uid(), 'admin'::app_role))
      OR EXISTS (SELECT 1 FROM public.user_account_access uaa
                 WHERE uaa.user_id = auth.uid() AND uaa.sub_company_id = mcp_servers.sub_company_id)
    )
  );

-- telemetry_logs
DROP POLICY IF EXISTS "Users can view telemetry logs" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Authenticated can view telemetry_logs" ON public.telemetry_logs;
CREATE POLICY "Admins can view telemetry_logs" ON public.telemetry_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- video_error_logs: require auth on insert
DROP POLICY IF EXISTS "Anyone can insert error logs" ON public.video_error_logs;
CREATE POLICY "Authenticated users can insert error logs" ON public.video_error_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- realtime.messages: tighten to admin-only
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='realtime' AND c.relname='messages') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can subscribe" ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can send" ON realtime.messages';
    EXECUTE $p$CREATE POLICY "Admins can subscribe" ON realtime.messages
              FOR SELECT TO authenticated
              USING (public.has_role(auth.uid(), 'admin'::app_role))$p$;
    EXECUTE $p$CREATE POLICY "Admins can broadcast" ON realtime.messages
              FOR INSERT TO authenticated
              WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role))$p$;
  END IF;
END $$;
