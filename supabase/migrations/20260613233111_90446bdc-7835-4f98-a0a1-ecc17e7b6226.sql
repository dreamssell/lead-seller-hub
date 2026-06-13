
-- Fix search_path on remaining functions
ALTER FUNCTION public.calculate_next_retry(integer) SET search_path = public;
ALTER FUNCTION public.check_video_health() SET search_path = public;
ALTER FUNCTION public.cleanup_connection_events() SET search_path = public;
ALTER FUNCTION public.cleanup_expired_idempotency_keys(integer) SET search_path = public;
ALTER FUNCTION public.get_idempotency_expiration_report(uuid) SET search_path = public;
ALTER FUNCTION public.get_webhook_idempotency_stats(uuid, timestamptz, timestamptz) SET search_path = public;
ALTER FUNCTION public.log_denied_attempt() SET search_path = public;
ALTER FUNCTION public.log_video_action(uuid, text, uuid, text, uuid) SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.update_video_participant_presence() SET search_path = public;

-- Revoke EXECUTE on internal SECURITY DEFINER functions from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.cleanup_connection_events() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_idempotency_keys(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_idempotency_keys_v2() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_idempotency_expiration_report(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_webhook_idempotency_stats(uuid, timestamptz, timestamptz) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_video_action(uuid, text, uuid, text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.try_acquire_provision_lock(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_provision_lock(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_sub_company_credit_alert() FROM anon, authenticated;

-- Realtime: restrict channel subscriptions to authenticated users
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='realtime' AND c.relname='messages') THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can subscribe" ON realtime.messages';
    EXECUTE $p$CREATE POLICY "Authenticated users can subscribe" ON realtime.messages
              FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL)$p$;
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can send" ON realtime.messages';
    EXECUTE $p$CREATE POLICY "Authenticated users can send" ON realtime.messages
              FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL)$p$;
  END IF;
END $$;
