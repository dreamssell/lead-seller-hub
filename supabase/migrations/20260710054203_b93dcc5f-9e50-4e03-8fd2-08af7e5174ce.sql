
-- 1) license_change_audit
CREATE TABLE IF NOT EXISTS public.license_change_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid,
  sub_company_id uuid,
  account_kind text NOT NULL, -- 'company' | 'sub_company'
  account_ref_id uuid NOT NULL, -- client_companies.id or sub_companies.id
  account_name text,
  plan_slug text,
  field text NOT NULL,        -- 'max_users_override' | 'seat_additions_blocked'
  old_value text,
  new_value text,
  changed_by uuid,
  changed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.license_change_audit TO authenticated;
GRANT ALL ON public.license_change_audit TO service_role;

ALTER TABLE public.license_change_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin or owner can view license audit" ON public.license_change_audit;
CREATE POLICY "admin or owner can view license audit"
  ON public.license_change_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS idx_license_change_audit_owner ON public.license_change_audit(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_license_change_audit_sub ON public.license_change_audit(sub_company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_license_change_audit_ref ON public.license_change_audit(account_ref_id, created_at DESC);

-- 2) Trigger function for client_companies
CREATE OR REPLACE FUNCTION public.log_license_change_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
BEGIN
  SELECT COALESCE(display_name, email, v_actor::text) INTO v_actor_name
    FROM public.profiles WHERE user_id = v_actor;

  IF COALESCE(OLD.max_users_override::text, '') IS DISTINCT FROM COALESCE(NEW.max_users_override::text, '') THEN
    INSERT INTO public.license_change_audit(
      owner_id, sub_company_id, account_kind, account_ref_id, account_name, plan_slug,
      field, old_value, new_value, changed_by, changed_by_name
    ) VALUES (
      NEW.auth_user_id, NULL, 'company', NEW.id, NEW.name, NEW.plan_slug,
      'max_users_override',
      COALESCE(OLD.max_users_override::text, 'padrão do plano'),
      COALESCE(NEW.max_users_override::text, 'padrão do plano'),
      v_actor, v_actor_name
    );
  END IF;

  IF COALESCE(OLD.seat_additions_blocked, false) IS DISTINCT FROM COALESCE(NEW.seat_additions_blocked, false) THEN
    INSERT INTO public.license_change_audit(
      owner_id, sub_company_id, account_kind, account_ref_id, account_name, plan_slug,
      field, old_value, new_value, changed_by, changed_by_name
    ) VALUES (
      NEW.auth_user_id, NULL, 'company', NEW.id, NEW.name, NEW.plan_slug,
      'seat_additions_blocked',
      CASE WHEN COALESCE(OLD.seat_additions_blocked,false) THEN 'pausado' ELSE 'liberado' END,
      CASE WHEN COALESCE(NEW.seat_additions_blocked,false) THEN 'pausado' ELSE 'liberado' END,
      v_actor, v_actor_name
    );
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_license_change_company ON public.client_companies;
CREATE TRIGGER trg_log_license_change_company
  AFTER UPDATE ON public.client_companies
  FOR EACH ROW EXECUTE FUNCTION public.log_license_change_company();

-- 3) Trigger function for sub_companies
CREATE OR REPLACE FUNCTION public.log_license_change_sub()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
BEGIN
  SELECT COALESCE(display_name, email, v_actor::text) INTO v_actor_name
    FROM public.profiles WHERE user_id = v_actor;

  IF COALESCE(OLD.max_users_override::text, '') IS DISTINCT FROM COALESCE(NEW.max_users_override::text, '') THEN
    INSERT INTO public.license_change_audit(
      owner_id, sub_company_id, account_kind, account_ref_id, account_name, plan_slug,
      field, old_value, new_value, changed_by, changed_by_name
    ) VALUES (
      NEW.owner_id, NEW.id, 'sub_company', NEW.id, NEW.name, NEW.plan_slug,
      'max_users_override',
      COALESCE(OLD.max_users_override::text, 'padrão do plano'),
      COALESCE(NEW.max_users_override::text, 'padrão do plano'),
      v_actor, v_actor_name
    );
  END IF;

  IF COALESCE(OLD.seat_additions_blocked, false) IS DISTINCT FROM COALESCE(NEW.seat_additions_blocked, false) THEN
    INSERT INTO public.license_change_audit(
      owner_id, sub_company_id, account_kind, account_ref_id, account_name, plan_slug,
      field, old_value, new_value, changed_by, changed_by_name
    ) VALUES (
      NEW.owner_id, NEW.id, 'sub_company', NEW.id, NEW.name, NEW.plan_slug,
      'seat_additions_blocked',
      CASE WHEN COALESCE(OLD.seat_additions_blocked,false) THEN 'pausado' ELSE 'liberado' END,
      CASE WHEN COALESCE(NEW.seat_additions_blocked,false) THEN 'pausado' ELSE 'liberado' END,
      v_actor, v_actor_name
    );
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_license_change_sub ON public.sub_companies;
CREATE TRIGGER trg_log_license_change_sub
  AFTER UPDATE ON public.sub_companies
  FOR EACH ROW EXECUTE FUNCTION public.log_license_change_sub();

-- 4) search_seat_limit_audit
CREATE OR REPLACE FUNCTION public.search_seat_limit_audit(
  p_owner uuid DEFAULT NULL,
  p_sub uuid DEFAULT NULL,
  p_plan text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
) RETURNS TABLE(
  id uuid, created_at timestamptz, owner_id uuid, sub_company_id uuid,
  plan_slug text, max_users int, current_users int,
  target_user_id uuid, target_name text,
  attempted_by uuid, attempted_by_name text,
  reason text, message text, total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_admin boolean := public.has_role(auth.uid(), 'admin'::app_role);
  v_scope uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_is_admin THEN
    v_scope := p_owner;
  ELSE
    v_scope := auth.uid();
    IF p_owner IS NOT NULL AND p_owner <> auth.uid() THEN
      RAISE EXCEPTION 'not_allowed';
    END IF;
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT s.*,
           tp.email AS target_email, tp.display_name AS target_display,
           ap.email AS attempter_email, ap.display_name AS attempter_display
      FROM public.seat_limit_audit s
      LEFT JOIN public.profiles tp ON tp.user_id = s.target_user_id
      LEFT JOIN public.profiles ap ON ap.user_id = s.attempted_by
     WHERE (v_scope IS NULL OR s.owner_id = v_scope)
       AND (p_sub IS NULL OR s.sub_company_id = p_sub)
       AND (p_plan IS NULL OR s.plan_slug = p_plan)
       AND (p_from IS NULL OR s.created_at >= p_from)
       AND (p_to IS NULL OR s.created_at <= p_to)
       AND (p_search IS NULL OR p_search = '' OR
            tp.email ILIKE '%'||p_search||'%' OR
            tp.display_name ILIKE '%'||p_search||'%' OR
            ap.email ILIKE '%'||p_search||'%' OR
            ap.display_name ILIKE '%'||p_search||'%' OR
            s.message ILIKE '%'||p_search||'%')
  )
  SELECT f.id, f.created_at, f.owner_id, f.sub_company_id,
         f.plan_slug, f.max_users, f.current_users,
         f.target_user_id, COALESCE(f.target_display, f.target_email, f.target_user_id::text),
         f.attempted_by, COALESCE(f.attempter_display, f.attempter_email, f.attempted_by::text),
         f.reason, f.message,
         (SELECT count(*) FROM filtered) AS total_count
    FROM filtered f
   ORDER BY f.created_at DESC
   LIMIT GREATEST(1, LEAST(p_limit, 500))
   OFFSET GREATEST(0, p_offset);
END $$;

-- 5) Extend get_owner_company_detail: add optional date range + include seat/license audit
CREATE OR REPLACE FUNCTION public.get_owner_company_detail(
  p_owner_id uuid,
  p_sub_company_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from timestamptz := COALESCE(p_from, now() - interval '30 days');
  v_to   timestamptz := COALESCE(p_to, now());
  v_from14 timestamptz := GREATEST(v_from, v_to - interval '14 days');
  v_since24 timestamptz := v_to - interval '24 hours';
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
    'range', jsonb_build_object('from', v_from, 'to', v_to),
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
      WHERE created_at BETWEEN v_from AND v_to AND (
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
      WHERE m.created_at BETWEEN v_from AND v_to AND (
        (p_sub_company_id IS NULL AND c.owner_id = p_owner_id)
        OR (p_sub_company_id IS NOT NULL AND c.sub_company_id = p_sub_company_id))
    ),
    'messages_by_day', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day),'[]'::jsonb) FROM (
        SELECT to_char(date_trunc('day', m.created_at),'YYYY-MM-DD') AS day, count(*) AS value
        FROM public.chat_messages m JOIN public.customers c ON c.id=m.customer_id
        WHERE m.created_at BETWEEN v_from14 AND v_to AND (
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
      WHERE created_at BETWEEN v_from AND v_to AND (
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
            WHERE er.created_at BETWEEN v_from AND v_to AND (
              (p_sub_company_id IS NULL AND er.owner_id = p_owner_id)
              OR (p_sub_company_id IS NOT NULL AND er.sub_company_id = p_sub_company_id))
            ORDER BY created_at DESC LIMIT 100
          ) e
        )
      )
    ),
    'audit_recent', (
      SELECT COALESCE(jsonb_agg(row_to_json(a) ORDER BY a.created_at DESC),'[]'::jsonb) FROM (
        SELECT al.id, al.created_at, al.table_name, al.action, al.record_label,
               COALESCE(p.display_name, p.email, 'Sistema') AS changed_by_name
        FROM public.audit_logs al LEFT JOIN public.profiles p ON p.user_id = al.changed_by
        WHERE al.created_at BETWEEN v_from AND v_to AND (
          (p_sub_company_id IS NULL AND al.owner_id = p_owner_id)
          OR (p_sub_company_id IS NOT NULL AND al.sub_company_id = p_sub_company_id))
        ORDER BY al.created_at DESC LIMIT 100
      ) a
    ),
    'seat_audit', (
      SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.created_at DESC),'[]'::jsonb) FROM (
        SELECT sa.id, sa.created_at, sa.plan_slug, sa.max_users, sa.current_users,
               sa.reason, sa.message,
               COALESCE(tp.display_name, tp.email, sa.target_user_id::text) AS target_name,
               COALESCE(ap.display_name, ap.email, sa.attempted_by::text) AS attempted_by_name
        FROM public.seat_limit_audit sa
        LEFT JOIN public.profiles tp ON tp.user_id = sa.target_user_id
        LEFT JOIN public.profiles ap ON ap.user_id = sa.attempted_by
        WHERE sa.created_at BETWEEN v_from AND v_to AND (
          (p_sub_company_id IS NULL AND sa.owner_id = p_owner_id)
          OR (p_sub_company_id IS NOT NULL AND sa.sub_company_id = p_sub_company_id))
        ORDER BY sa.created_at DESC LIMIT 100
      ) s
    ),
    'license_audit', (
      SELECT COALESCE(jsonb_agg(row_to_json(l) ORDER BY l.created_at DESC),'[]'::jsonb) FROM (
        SELECT lca.id, lca.created_at, lca.field, lca.old_value, lca.new_value,
               lca.changed_by_name
        FROM public.license_change_audit lca
        WHERE lca.created_at BETWEEN v_from AND v_to AND (
          (p_sub_company_id IS NULL AND lca.owner_id = p_owner_id AND lca.sub_company_id IS NULL)
          OR (p_sub_company_id IS NOT NULL AND lca.sub_company_id = p_sub_company_id))
        ORDER BY lca.created_at DESC LIMIT 100
      ) l
    )
  );
  RETURN v_result;
END $$;
