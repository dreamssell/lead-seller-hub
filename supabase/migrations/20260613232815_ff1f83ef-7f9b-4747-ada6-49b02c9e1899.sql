
DROP POLICY IF EXISTS "Users can view webhooks" ON public.crm_webhooks;
CREATE POLICY "Admins can view webhooks" ON public.crm_webhooks
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view webhook logs" ON public.crm_webhook_logs;
CREATE POLICY "Admins can view webhook logs" ON public.crm_webhook_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view mcp_servers of their sub_company or master" ON public.mcp_servers;
CREATE POLICY "Users can view mcp_servers of their sub_company or master" ON public.mcp_servers
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL AND (
      sub_company_id IS NULL
      OR EXISTS (SELECT 1 FROM public.user_account_access uaa
                 WHERE uaa.user_id = auth.uid() AND uaa.sub_company_id = mcp_servers.sub_company_id)
    )
  );

ALTER TABLE public.connection_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage connection alerts" ON public.connection_alerts;
CREATE POLICY "Admins manage connection alerts" ON public.connection_alerts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can manage their company audit logs" ON public.wavoip_audit_logs;
CREATE POLICY "Members can view their company audit logs" ON public.wavoip_audit_logs
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_account_access uaa
               WHERE uaa.user_id = auth.uid() AND uaa.sub_company_id::text = wavoip_audit_logs.sub_company_id)
  );
CREATE POLICY "Members can insert their company audit logs" ON public.wavoip_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_account_access uaa
               WHERE uaa.user_id = auth.uid() AND uaa.sub_company_id::text = wavoip_audit_logs.sub_company_id)
  );

DROP POLICY IF EXISTS "Users can manage their company presets" ON public.wavoip_filter_presets;
CREATE POLICY "Members can manage their company presets" ON public.wavoip_filter_presets
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_account_access uaa
               WHERE uaa.user_id = auth.uid() AND uaa.sub_company_id::text = wavoip_filter_presets.sub_company_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_account_access uaa
               WHERE uaa.user_id = auth.uid() AND uaa.sub_company_id::text = wavoip_filter_presets.sub_company_id)
  );

DROP POLICY IF EXISTS "Users can manage their company settings" ON public.wavoip_settings;
CREATE POLICY "Members can manage their company settings" ON public.wavoip_settings
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_account_access uaa
               WHERE uaa.user_id = auth.uid() AND uaa.sub_company_id::text = wavoip_settings.sub_company_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_account_access uaa
               WHERE uaa.user_id = auth.uid() AND uaa.sub_company_id::text = wavoip_settings.sub_company_id)
  );

DROP POLICY IF EXISTS "Users can manage their company sync state" ON public.wavoip_sync_state;
CREATE POLICY "Members can manage their company sync state" ON public.wavoip_sync_state
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_account_access uaa
               WHERE uaa.user_id = auth.uid() AND uaa.sub_company_id::text = wavoip_sync_state.sub_company_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_account_access uaa
               WHERE uaa.user_id = auth.uid() AND uaa.sub_company_id::text = wavoip_sync_state.sub_company_id)
  );

DROP POLICY IF EXISTS "Users can manage their own contacts" ON public.contacts;
CREATE POLICY "Users can manage their own contacts" ON public.contacts
  FOR ALL TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can manage crm events" ON public.crm_events;
CREATE POLICY "Users can manage crm events" ON public.crm_events
  FOR ALL TO authenticated
  USING (auth.uid() = actor_id OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = actor_id OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Public status view" ON public.uaz_audit_logs;

DROP POLICY IF EXISTS "Anyone with token can view active room" ON public.video_rooms;
CREATE POLICY "Authenticated users can view active rooms" ON public.video_rooms
  FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Participants can update their own status" ON public.video_participants;
CREATE POLICY "Participants can update their own status" ON public.video_participants
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view cleanup history" ON public.log_cleanup_history;
CREATE POLICY "Admins can view cleanup history" ON public.log_cleanup_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view their own connection attempts" ON public.unauthorized_embed_attempts;
CREATE POLICY "Admins can view embed attempts" ON public.unauthorized_embed_attempts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
