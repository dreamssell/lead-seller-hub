
-- 1) Add scope columns to audit_logs
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS owner_id uuid,
  ADD COLUMN IF NOT EXISTS sub_company_id uuid;

CREATE INDEX IF NOT EXISTS idx_audit_logs_owner_created ON public.audit_logs(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_sub_created ON public.audit_logs(sub_company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_by_created ON public.audit_logs(changed_by, created_at DESC);

-- 2) Extend audit_logs_view to include scope
CREATE OR REPLACE VIEW public.audit_logs_view
WITH (security_invoker = true) AS
SELECT
  a.id, a.created_at, a.table_name, a.action, a.record_id, a.record_label,
  a.changed_by, COALESCE(p.display_name, p.email, a.changed_by::text) AS changed_by_name,
  a.changes, a.owner_id, a.sub_company_id
FROM public.audit_logs a
LEFT JOIN public.profiles p ON p.user_id = a.changed_by;

-- 3) Generic trigger to auto-log critical tables
CREATE OR REPLACE FUNCTION public.tg_audit_scoped()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_sub uuid;
  v_label text;
  v_action text;
  v_record_id uuid;
  v_changes jsonb;
  v_row jsonb;
  v_old jsonb;
BEGIN
  v_action := lower(TG_OP);
  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD);
    v_record_id := (OLD).id;
  ELSE
    v_row := to_jsonb(NEW);
    v_record_id := (NEW).id;
    IF TG_OP = 'UPDATE' THEN v_old := to_jsonb(OLD); END IF;
  END IF;

  -- Resolve owner/sub from row (columns may not exist for some tables)
  v_owner := NULLIF(v_row->>'owner_id','')::uuid;
  v_sub := NULLIF(v_row->>'sub_company_id','')::uuid;

  -- Fallback for profiles: derive owner from user_account_access
  IF v_owner IS NULL AND TG_TABLE_NAME = 'profiles' THEN
    SELECT owner_id INTO v_owner
      FROM public.user_account_access
     WHERE user_id = COALESCE(NULLIF(v_row->>'user_id','')::uuid, v_record_id)
     LIMIT 1;
  END IF;

  -- Human label
  v_label := COALESCE(
    v_row->>'name', v_row->>'email', v_row->>'display_name',
    v_row->>'phone_number', v_row->>'sip_user',
    v_record_id::text
  );

  IF TG_OP = 'UPDATE' THEN
    -- Only log meaningful diffs
    SELECT jsonb_object_agg(k, jsonb_build_object('from', v_old->k, 'to', v_row->k))
      INTO v_changes
      FROM (
        SELECT k FROM jsonb_object_keys(v_row) k
        WHERE k NOT IN ('updated_at','created_at')
          AND (v_old->k) IS DISTINCT FROM (v_row->k)
      ) diff;
    IF v_changes IS NULL OR v_changes = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
    -- Skip role_label trigger noise when column unchanged (profiles)
    IF TG_TABLE_NAME = 'profiles' AND NOT v_changes ? 'role_label' THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    v_changes := v_row;
  ELSE
    v_changes := v_old;
  END IF;

  -- Mask common sensitive fields
  IF v_changes IS NOT NULL THEN
    v_changes := v_changes - 'password' - 'senha' - 'sip_password' - 'api_key' - 'secret' - 'token';
  END IF;

  INSERT INTO public.audit_logs(table_name, record_id, action, record_label, changes, changed_by, owner_id, sub_company_id)
  VALUES (
    TG_TABLE_NAME, v_record_id, v_action, left(v_label, 200), v_changes,
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    v_owner, v_sub
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 4) Attach triggers
DROP TRIGGER IF EXISTS trg_audit_user_account_access ON public.user_account_access;
CREATE TRIGGER trg_audit_user_account_access
AFTER INSERT OR UPDATE OR DELETE ON public.user_account_access
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_scoped();

DROP TRIGGER IF EXISTS trg_audit_sub_companies ON public.sub_companies;
CREATE TRIGGER trg_audit_sub_companies
AFTER UPDATE ON public.sub_companies
FOR EACH ROW WHEN (
  OLD.blocked_pages IS DISTINCT FROM NEW.blocked_pages
  OR OLD.status IS DISTINCT FROM NEW.status
)
EXECUTE FUNCTION public.tg_audit_scoped();

DROP TRIGGER IF EXISTS trg_audit_profiles_role ON public.profiles;
CREATE TRIGGER trg_audit_profiles_role
AFTER UPDATE ON public.profiles
FOR EACH ROW WHEN (OLD.role_label IS DISTINCT FROM NEW.role_label)
EXECUTE FUNCTION public.tg_audit_scoped();

DROP TRIGGER IF EXISTS trg_audit_sip_configurations ON public.sip_configurations;
CREATE TRIGGER trg_audit_sip_configurations
AFTER INSERT OR UPDATE OR DELETE ON public.sip_configurations
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_scoped();

DROP TRIGGER IF EXISTS trg_audit_whatsapp_connections ON public.whatsapp_connections;
CREATE TRIGGER trg_audit_whatsapp_connections
AFTER INSERT OR UPDATE OR DELETE ON public.whatsapp_connections
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_scoped();

-- 5) Scoped search RPC (owner sees own account; admin sees everything)
CREATE OR REPLACE FUNCTION public.search_audit_logs_scoped(
  p_owner uuid DEFAULT NULL,
  p_sub uuid DEFAULT NULL,
  p_table text DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_user uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid, created_at timestamptz, table_name text, action text,
  record_id uuid, record_label text, changed_by uuid, changed_by_name text,
  changes jsonb, owner_id uuid, sub_company_id uuid, total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := public.has_role(auth.uid(), 'admin'::app_role);
  v_effective_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF v_is_admin THEN
    v_effective_owner := p_owner;
  ELSE
    -- Non-admins only see their own account
    v_effective_owner := auth.uid();
    IF p_owner IS NOT NULL AND p_owner <> auth.uid() THEN
      RAISE EXCEPTION 'not_allowed';
    END IF;
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT v.*
    FROM public.audit_logs_view v
    WHERE (v_effective_owner IS NULL OR v.owner_id = v_effective_owner)
      AND (p_sub    IS NULL OR v.sub_company_id = p_sub)
      AND (p_table  IS NULL OR v.table_name = p_table)
      AND (p_action IS NULL OR v.action = p_action)
      AND (p_user   IS NULL OR v.changed_by = p_user)
      AND (p_from   IS NULL OR v.created_at >= p_from)
      AND (p_to     IS NULL OR v.created_at <= p_to)
  )
  SELECT f.id, f.created_at, f.table_name, f.action, f.record_id, f.record_label,
         f.changed_by, f.changed_by_name, f.changes, f.owner_id, f.sub_company_id,
         (SELECT count(*) FROM filtered) AS total_count
  FROM filtered f
  ORDER BY f.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200))
  OFFSET GREATEST(0, p_offset);
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_audit_logs_scoped(uuid,uuid,text,text,uuid,timestamptz,timestamptz,int,int) TO authenticated;

-- 6) List actors (for filter dropdown)
CREATE OR REPLACE FUNCTION public.list_audit_actors(p_owner uuid DEFAULT NULL)
RETURNS TABLE(user_id uuid, name text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := public.has_role(auth.uid(), 'admin'::app_role);
  v_scope uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  v_scope := CASE WHEN v_is_admin THEN p_owner ELSE auth.uid() END;
  RETURN QUERY
    SELECT DISTINCT a.changed_by, COALESCE(p.display_name, p.email, a.changed_by::text)
      FROM public.audit_logs a
      LEFT JOIN public.profiles p ON p.user_id = a.changed_by
     WHERE (v_scope IS NULL OR a.owner_id = v_scope)
     ORDER BY 2 ASC
     LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_audit_actors(uuid) TO authenticated;
