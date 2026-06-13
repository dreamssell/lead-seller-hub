
-- Revoke EXECUTE from PUBLIC on all SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.cleanup_connection_events() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_idempotency_keys(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_idempotency_keys_v2() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_sub_login_token(uuid, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_idempotency_expiration_report(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_webhook_idempotency_stats(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_sub_company_credit_alert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_video_action(uuid, text, uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_provision_lock(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.try_acquire_provision_lock(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_sub_login_token(text) FROM PUBLIC;

-- Keep necessary grants
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_sub_login_token(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_sub_login_token(text) TO anon, authenticated;

-- provision_locks: admin-only policy
DROP POLICY IF EXISTS "Admins manage provision locks" ON public.provision_locks;
CREATE POLICY "Admins manage provision locks" ON public.provision_locks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- quick_replies: scope by ownership (created_by) or admin
DROP POLICY IF EXISTS "Team can insert quick replies" ON public.quick_replies;
DROP POLICY IF EXISTS "Team can update quick replies" ON public.quick_replies;
DROP POLICY IF EXISTS "Team can delete quick replies" ON public.quick_replies;
CREATE POLICY "Users insert their quick replies" ON public.quick_replies
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users update their quick replies" ON public.quick_replies
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users delete their quick replies" ON public.quick_replies
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::app_role));

-- telemetry_logs: insert only by authenticated user; restrict to admins (no user_id col)
DROP POLICY IF EXISTS "Users can insert their own logs" ON public.telemetry_logs;
CREATE POLICY "Authenticated can insert telemetry" ON public.telemetry_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- webhook_idempotency_keys: admin-only
DROP POLICY IF EXISTS "Users can manage idempotency keys" ON public.webhook_idempotency_keys;
CREATE POLICY "Admins manage idempotency keys" ON public.webhook_idempotency_keys
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Storage public buckets: drop SELECT policies; files still served via public CDN URL
DROP POLICY IF EXISTS "Avatars listable by authenticated" ON storage.objects;
DROP POLICY IF EXISTS "Company logos listable by authenticated" ON storage.objects;
DROP POLICY IF EXISTS "agent avatars listable by authenticated" ON storage.objects;
CREATE POLICY "Avatars listable by admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Company logos listable by admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'company-logos' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Agent avatars listable by admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'agent-avatars' AND public.has_role(auth.uid(), 'admin'::app_role));
