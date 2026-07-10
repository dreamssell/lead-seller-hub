
UPDATE public.plan_packages SET max_users = 5  WHERE slug = 'start';
UPDATE public.plan_packages SET max_users = 10 WHERE slug = 'elite';
UPDATE public.plan_packages SET max_users = 15 WHERE slug = 'platinum';

INSERT INTO public.plan_packages (slug, name, max_users)
VALUES ('enterprise', 'Enterprise', NULL)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

ALTER TABLE public.client_companies ADD COLUMN IF NOT EXISTS max_users_override integer;
ALTER TABLE public.sub_companies    ADD COLUMN IF NOT EXISTS max_users_override integer;

CREATE OR REPLACE FUNCTION public.enforce_member_seat_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text; v_plan_max int; v_override int; v_max int; v_count int;
BEGIN
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.sub_company_id IS NOT NULL THEN
    SELECT plan_slug, max_users_override INTO v_plan, v_override
      FROM public.sub_companies WHERE id = NEW.sub_company_id;
    SELECT count(*) INTO v_count FROM public.user_account_access
     WHERE sub_company_id = NEW.sub_company_id AND user_id <> NEW.user_id;
  ELSE
    SELECT plan_slug, max_users_override INTO v_plan, v_override
      FROM public.client_companies WHERE auth_user_id = NEW.owner_id LIMIT 1;
    SELECT count(*) INTO v_count FROM public.user_account_access
     WHERE owner_id = NEW.owner_id AND sub_company_id IS NULL AND user_id <> NEW.user_id;
  END IF;
  SELECT max_users INTO v_plan_max FROM public.plan_packages WHERE slug = v_plan;
  v_max := COALESCE(v_override, v_plan_max);
  IF v_max IS NOT NULL AND v_count >= v_max THEN
    RAISE EXCEPTION 'plan_seat_limit_reached: o plano % permite no máximo % usuários (já em uso: %)',
      COALESCE(v_plan,'sem_plano'), v_max, v_count
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_member_seat_usage(p_owner_id uuid, p_sub_company_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(plan_slug text, max_users integer, current_users integer, remaining integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_plan text; v_override int; v_plan_max int; v_max int; v_count int;
BEGIN
  IF p_sub_company_id IS NOT NULL THEN
    SELECT s.plan_slug, s.max_users_override INTO v_plan, v_override
      FROM public.sub_companies s WHERE s.id = p_sub_company_id;
    SELECT count(*) INTO v_count FROM public.user_account_access WHERE sub_company_id = p_sub_company_id;
  ELSE
    SELECT c.plan_slug, c.max_users_override INTO v_plan, v_override
      FROM public.client_companies c WHERE c.auth_user_id = p_owner_id LIMIT 1;
    SELECT count(*) INTO v_count FROM public.user_account_access
     WHERE owner_id = p_owner_id AND sub_company_id IS NULL;
  END IF;
  SELECT max_users INTO v_plan_max FROM public.plan_packages WHERE slug = v_plan;
  v_max := COALESCE(v_override, v_plan_max);
  plan_slug := v_plan; max_users := v_max; current_users := COALESCE(v_count,0);
  remaining := CASE WHEN v_max IS NULL THEN NULL ELSE GREATEST(v_max - COALESCE(v_count,0),0) END;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_owner_company_detail(
  p_owner_id uuid, p_sub_company_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_since30 timestamptz := now() - interval '30 days';
  v_since14 timestamptz := now() - interval '14 days';
  v_since24 timestamptz := now() - interval '24 hours';
  v_result jsonb; v_company jsonb; v_seat jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_sub_company_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'kind','sub_company','id',s.id,'name',s.name,'plan_slug',s.plan_slug,
      'status',s.status,'owner_id',s.owner_id,
      'max_users_override',s.max_users_override,'created_at',s.created_at,
      'credit_limit',s.credit_limit,'credit_balance',s.credit_balance,
      'parent_name',(SELECT name FROM public.client_companies WHERE auth_user_id = s.owner_id LIMIT 1)
    ) INTO v_company FROM public.sub_companies s WHERE s.id = p_sub_company_id;
  ELSE
    SELECT jsonb_build_object(
      'kind','company','id',c.id,'name',c.name,'plan_slug',c.plan_slug,
      'status',c.status,'owner_id',c.auth_user_id,'login_email',c.login_email,
      'segment',c.segment,'max_users_override',c.max_users_override,
      'created_at',c.created_at
    ) INTO v_company FROM public.client_companies c WHERE c.auth_user_id = p_owner_id LIMIT 1;
  END IF;
  IF v_company IS NULL THEN RAISE EXCEPTION 'account_not_found'; END IF;

  SELECT to_jsonb(g.*) INTO v_seat FROM public.get_member_seat_usage(p_owner_id, p_sub_company_id) g;

  v_result := jsonb_build_object(
    'generated_at', now(),
    'company', v_company,
    'seat_usage', v_seat,
    'kpis', (
      SELECT jsonb_build_object(
        'leads_30d', count(*),
        'leads_won', count(*) FILTER (WHERE status='ganho'),
        'leads_lost', count(*) FILTER (WHERE status='perdido'),
        'leads_open', count(*) FILTER (WHERE status NOT IN ('ganho','perdido')),
        'revenue', COALESCE(sum(estimated_value) FILTER (WHERE status='ganho'),0),
        'conversion_rate', CASE WHEN count(*)>0
          THEN round((count(*) FILTER (WHERE status='ganho'))::numeric/count(*)*100,1) ELSE 0 END
      ) FROM public.leads
      WHERE created_at >= v_since30 AND (
        (p_sub_company_id IS NULL AND owner_id = p_owner_id)
        OR (p_sub_company_id IS NOT NULL AND sub_company_id = p_sub_company_id))
    ),
    'messages', (
      SELECT jsonb_build_object(
        'last_30d', count(*),
        'sent', count(*) FILTER (WHERE delivery_status IN ('sent','delivered','read')),
        'delivered', count(*) FILTER (WHERE delivery_status IN ('delivered','read')),
        'failed', count(*) FILTER (WHERE delivery_status='failed'),
        'inbound', count(*) FILTER (WHERE sender_type IN ('client','customer'))
      ) FROM public.chat_messages m JOIN public.customers c ON c.id=m.customer_id
      WHERE m.created_at >= v_since30 AND (
        (p_sub_company_id IS NULL AND c.owner_id = p_owner_id)
        OR (p_sub_company_id IS NOT NULL AND c.sub_company_id = p_sub_company_id))
    ),
    'messages_by_day', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day),'[]'::jsonb) FROM (
        SELECT to_char(date_trunc('day', m.created_at),'YYYY-MM-DD') AS day, count(*) AS value
        FROM public.chat_messages m JOIN public.customers c ON c.id=m.customer_id
        WHERE m.created_at >= v_since14 AND (
          (p_sub_company_id IS NULL AND c.owner_id = p_owner_id)
          OR (p_sub_company_id IS NOT NULL AND c.sub_company_id = p_sub_company_id))
        GROUP BY 1
      ) t
    ),
    'leads_by_stage', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)),'[]'::jsonb) FROM (
        SELECT COALESCE(ps.name,'Sem estágio') AS name, count(*) AS value
        FROM public.leads l LEFT JOIN public.pipeline_stages ps ON ps.id = l.stage_id
        WHERE (
          (p_sub_company_id IS NULL AND l.owner_id = p_owner_id)
          OR (p_sub_company_id IS NOT NULL AND l.sub_company_id = p_sub_company_id))
        GROUP BY ps.name ORDER BY value DESC
      ) t
    ),
    'calls', (
      SELECT jsonb_build_object(
        'total_30d', count(*),
        'answered', count(*) FILTER (WHERE status IN ('answered','completed')),
        'missed', count(*) FILTER (WHERE status IN ('missed','no-answer','failed')),
        'avg_duration', COALESCE(round(avg(duration_seconds) FILTER (WHERE duration_seconds>0))::int,0)
      ) FROM public.call_history
      WHERE created_at >= v_since30 AND (
        (p_sub_company_id IS NULL AND owner_id = p_owner_id)
        OR (p_sub_company_id IS NOT NULL AND sub_company_id = p_sub_company_id))
    ),
    'whatsapp', (
      SELECT COALESCE(jsonb_agg(row_to_json(w)),'[]'::jsonb) FROM (
        SELECT id, name, phone_number, status, provider, updated_at
        FROM public.whatsapp_connections
        WHERE (
          (p_sub_company_id IS NULL AND owner_id = p_owner_id)
          OR (p_sub_company_id IS NOT NULL AND sub_company_id = p_sub_company_id))
        ORDER BY updated_at DESC NULLS LAST
      ) w
    ),
    'pipelines', (
      SELECT COALESCE(jsonb_agg(row_to_json(p)),'[]'::jsonb) FROM (
        SELECT pl.id, pl.name,
          (SELECT count(*) FROM public.leads l WHERE l.pipeline_id = pl.id) AS leads_total,
          (SELECT count(*) FROM public.leads l WHERE l.pipeline_id = pl.id AND l.status NOT IN ('ganho','perdido')) AS leads_open
        FROM public.pipelines pl
        WHERE (
          (p_sub_company_id IS NULL AND pl.owner_id = p_owner_id)
          OR (p_sub_company_id IS NOT NULL AND pl.sub_company_id = p_sub_company_id))
        ORDER BY pl.name
      ) p
    ),
    'agents', (
      SELECT jsonb_build_object('total', count(*), 'active', count(*) FILTER (WHERE is_active=true))
      FROM public.ai_agents
      WHERE (
        (p_sub_company_id IS NULL AND owner_id = p_owner_id)
        OR (p_sub_company_id IS NOT NULL AND sub_company_id = p_sub_company_id))
    ),
    'errors', (
      SELECT jsonb_build_object(
        'last_24h', (SELECT count(*) FROM public.error_reports er
                      WHERE er.created_at >= v_since24 AND (
                        (p_sub_company_id IS NULL AND er.owner_id = p_owner_id)
                        OR (p_sub_company_id IS NOT NULL AND er.sub_company_id = p_sub_company_id))),
        'critical', (SELECT count(*) FROM public.error_reports er
                      WHERE er.created_at >= v_since24 AND er.severity='critical' AND (
                        (p_sub_company_id IS NULL AND er.owner_id = p_owner_id)
                        OR (p_sub_company_id IS NOT NULL AND er.sub_company_id = p_sub_company_id))),
        'recent', (
          SELECT COALESCE(jsonb_agg(row_to_json(e) ORDER BY e.created_at DESC),'[]'::jsonb) FROM (
            SELECT id, created_at, severity, source, message, route, user_id
            FROM public.error_reports er
            WHERE er.created_at >= (now() - interval '7 days') AND (
              (p_sub_company_id IS NULL AND er.owner_id = p_owner_id)
              OR (p_sub_company_id IS NOT NULL AND er.sub_company_id = p_sub_company_id))
            ORDER BY created_at DESC LIMIT 20
          ) e
        )
      )
    ),
    'audit_recent', (
      SELECT COALESCE(jsonb_agg(row_to_json(a) ORDER BY a.created_at DESC),'[]'::jsonb) FROM (
        SELECT al.id, al.created_at, al.table_name, al.action, al.record_label,
               COALESCE(p.display_name, p.email, 'Sistema') AS changed_by_name
        FROM public.audit_logs al LEFT JOIN public.profiles p ON p.user_id = al.changed_by
        WHERE (
          (p_sub_company_id IS NULL AND al.owner_id = p_owner_id)
          OR (p_sub_company_id IS NOT NULL AND al.sub_company_id = p_sub_company_id))
        ORDER BY al.created_at DESC LIMIT 25
      ) a
    )
  );
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_owner_company_detail(uuid, uuid) TO authenticated;

UPDATE public.client_companies SET plan_slug = 'platinum'
 WHERE auth_user_id = 'eeaf2c65-9229-4249-8ea0-703769b9a319' AND plan_slug = 'enterprise';
