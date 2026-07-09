
CREATE OR REPLACE FUNCTION public.get_platform_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz := now() - interval '24 hours';
  v_since_7d timestamptz := now() - interval '7 days';
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT jsonb_build_object(
    'generated_at', now(),
    'errors', (
      SELECT jsonb_build_object(
        'last_24h', count(*),
        'critical', count(*) FILTER (WHERE severity = 'critical'),
        'by_severity', COALESCE(jsonb_object_agg(severity, cnt) FILTER (WHERE severity IS NOT NULL), '{}'::jsonb)
      )
      FROM (
        SELECT severity, count(*) AS cnt
          FROM public.error_reports
         WHERE created_at >= v_since
         GROUP BY severity
      ) s
    ),
    'errors_recent', (
      SELECT COALESCE(jsonb_agg(row_to_json(e) ORDER BY e.created_at DESC), '[]'::jsonb)
        FROM (
          SELECT id, created_at, severity, source, message, route, owner_id, user_id
            FROM public.error_reports
           WHERE created_at >= v_since
           ORDER BY created_at DESC
           LIMIT 20
        ) e
    ),
    'messages', (
      SELECT jsonb_build_object(
        'last_24h', count(*),
        'delivered', count(*) FILTER (WHERE delivery_status IN ('delivered','read')),
        'failed', count(*) FILTER (WHERE delivery_status = 'failed'),
        'sent', count(*) FILTER (WHERE delivery_status = 'sent'),
        'deadletter', (SELECT count(*) FROM public.chat_message_deadletter WHERE created_at >= v_since)
      )
      FROM public.chat_messages
      WHERE created_at >= v_since
    ),
    'calls', (
      SELECT jsonb_build_object(
        'last_24h', count(*),
        'answered', count(*) FILTER (WHERE status IN ('answered','completed')),
        'missed', count(*) FILTER (WHERE status IN ('missed','no-answer','failed')),
        'avg_duration', COALESCE(ROUND(AVG(duration_seconds) FILTER (WHERE duration_seconds > 0))::int, 0)
      )
      FROM public.call_history
      WHERE created_at >= v_since
    ),
    'whatsapp', (
      SELECT jsonb_build_object(
        'total', count(*),
        'online', count(*) FILTER (WHERE status = 'connected' OR status = 'online' OR status = 'WORKING'),
        'offline', count(*) FILTER (WHERE status NOT IN ('connected','online','WORKING') OR status IS NULL),
        'by_status', COALESCE(jsonb_object_agg(COALESCE(status,'unknown'), cnt), '{}'::jsonb)
      )
      FROM (
        SELECT status, count(*) AS cnt
          FROM public.whatsapp_connections
         GROUP BY status
      ) w
    ),
    'video', (
      SELECT jsonb_build_object(
        'errors_24h', (SELECT count(*) FROM public.video_error_logs WHERE created_at >= v_since),
        'alerts_open', (SELECT count(*) FROM public.video_alerts WHERE created_at >= v_since_7d)
      )
    ),
    'sub_alerts_open', (
      SELECT COALESCE(jsonb_agg(row_to_json(a) ORDER BY a.created_at DESC), '[]'::jsonb)
        FROM (
          SELECT sa.id, sa.created_at, sa.type, sa.message, sa.percent, sa.action_taken,
                 sc.name AS sub_company_name
            FROM public.sub_company_alerts sa
            LEFT JOIN public.sub_companies sc ON sc.id = sa.sub_company_id
           WHERE sa.created_at >= v_since_7d
           ORDER BY sa.created_at DESC
           LIMIT 15
        ) a
    ),
    'accounts', (
      SELECT jsonb_build_object(
        'companies', (SELECT count(*) FROM public.client_companies),
        'blocked_companies', (SELECT count(*) FROM public.client_companies WHERE status = 'blocked'),
        'sub_companies', (SELECT count(*) FROM public.sub_companies),
        'blocked_sub_companies', (SELECT count(*) FROM public.sub_companies WHERE status = 'blocked'),
        'active_users_24h', (SELECT count(DISTINCT changed_by) FROM public.audit_logs WHERE created_at >= v_since)
      )
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_health() TO authenticated;
