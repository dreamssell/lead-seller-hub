DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_companies'
      AND policyname = 'Company login can view own company'
  ) THEN
    CREATE POLICY "Company login can view own company"
    ON public.client_companies
    FOR SELECT
    TO authenticated
    USING (auth.uid() = auth_user_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_account_access()
 RETURNS TABLE(owner_id uuid, sub_company_id uuid, sub_company_name text, allowed_pages text[], is_account_admin boolean, blocked_pages text[], status text, allow_custom_logic boolean, feature_landing_builder boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH access_pick AS (
    SELECT a.owner_id,
           a.sub_company_id,
           s.name AS sub_name,
           COALESCE(a.allowed_pages, ARRAY[]::text[]) AS allowed_pages,
           COALESCE(a.is_account_admin, false) AS is_account_admin,
           COALESCE(a.is_owner, false) AS is_owner,
           s.blocked_pages AS sub_blocked,
           s.status AS sub_status,
           s.allow_custom_logic AS sub_allow_custom_logic,
           s.feature_landing_builder AS sub_feature_landing_builder,
           a.created_at,
           1 AS priority
      FROM public.user_account_access a
      LEFT JOIN public.sub_companies s ON s.id = a.sub_company_id
     WHERE a.user_id = auth.uid()
  ),
  direct_company AS (
    SELECT cc.auth_user_id AS owner_id,
           NULL::uuid AS sub_company_id,
           NULL::text AS sub_name,
           ARRAY[]::text[] AS allowed_pages,
           true AS is_account_admin,
           true AS is_owner,
           NULL::text[] AS sub_blocked,
           cc.status AS sub_status,
           true AS sub_allow_custom_logic,
           false AS sub_feature_landing_builder,
           cc.created_at,
           2 AS priority
      FROM public.client_companies cc
     WHERE cc.auth_user_id = auth.uid()
  ),
  picked AS (
    SELECT *
      FROM (
        SELECT * FROM access_pick
        UNION ALL
        SELECT * FROM direct_company
      ) candidates
     ORDER BY is_owner DESC, is_account_admin DESC, priority ASC, created_at ASC
     LIMIT 1
  ),
  parent_cc AS (
    SELECT cc.blocked_pages, cc.status
      FROM public.client_companies cc, picked p
     WHERE (p.sub_company_id IS NOT NULL AND cc.auth_user_id = (SELECT owner_id FROM public.sub_companies WHERE id = p.sub_company_id))
        OR (p.sub_company_id IS NULL AND cc.auth_user_id = p.owner_id)
     LIMIT 1
  ),
  merged AS (
    SELECT
      ARRAY(
        SELECT DISTINCT unnest(
          COALESCE((SELECT sub_blocked FROM picked), ARRAY[]::text[])
          || COALESCE((SELECT blocked_pages FROM parent_cc), ARRAY[]::text[])
        )
      ) AS blocked_pages_merged,
      CASE
        WHEN (SELECT status FROM parent_cc) = 'blocked' THEN 'blocked'
        ELSE COALESCE((SELECT sub_status FROM picked), (SELECT status FROM parent_cc), 'active')
      END AS effective_status
  )
  SELECT p.owner_id,
         p.sub_company_id,
         p.sub_name,
         p.allowed_pages,
         p.is_account_admin,
         (SELECT blocked_pages_merged FROM merged),
         (SELECT effective_status FROM merged),
         COALESCE(p.sub_allow_custom_logic, true),
         COALESCE(p.sub_feature_landing_builder, false)
    FROM picked p;
$function$;

CREATE OR REPLACE FUNCTION public.can_current_user_access(_page text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN RETURN true; END IF;

  SELECT * INTO r FROM public.get_my_account_access() LIMIT 1;
  IF NOT FOUND THEN RETURN _page = 'profile'; END IF;

  IF r.status = 'blocked' THEN
    RETURN _page = 'profile';
  END IF;

  IF r.blocked_pages IS NOT NULL AND _page = ANY(r.blocked_pages) THEN
    RETURN false;
  END IF;

  IF r.is_account_admin OR COALESCE(array_length(r.allowed_pages, 1), 0) = 0 THEN
    RETURN true;
  END IF;

  RETURN _page = ANY(r.allowed_pages) OR _page = 'profile';
END;
$function$;