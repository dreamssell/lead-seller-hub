
-- 1) Add scopes to api_keys
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT ARRAY['auth:verify','auth:login']::text[];

-- 2) Friendly view over audit_logs
CREATE OR REPLACE VIEW public.audit_logs_view
WITH (security_invoker = true)
AS
SELECT
  a.id,
  a.created_at,
  a.table_name,
  a.action,
  a.record_id,
  a.record_label,
  a.changed_by,
  COALESCE(p.display_name, a.changed_by::text) AS changed_by_name,
  a.changes
FROM public.audit_logs a
LEFT JOIN public.profiles p ON p.user_id = a.changed_by;

-- 3) Paginated/filterable search function
CREATE OR REPLACE FUNCTION public.search_audit_logs(
  p_table text DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_user uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  table_name text,
  action text,
  record_id uuid,
  record_label text,
  changed_by uuid,
  changed_by_name text,
  changes jsonb,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT *
    FROM public.audit_logs_view v
    WHERE (p_table  IS NULL OR v.table_name = p_table)
      AND (p_action IS NULL OR v.action = p_action)
      AND (p_user   IS NULL OR v.changed_by = p_user)
      AND (p_from   IS NULL OR v.created_at >= p_from)
      AND (p_to     IS NULL OR v.created_at <= p_to)
  )
  SELECT f.*, (SELECT count(*) FROM filtered) AS total_count
  FROM filtered f
  ORDER BY f.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200))
  OFFSET GREATEST(0, p_offset);
$$;
