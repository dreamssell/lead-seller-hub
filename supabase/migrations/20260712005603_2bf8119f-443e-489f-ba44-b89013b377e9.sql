DROP FUNCTION IF EXISTS public.get_my_account_access();

CREATE OR REPLACE FUNCTION public.get_my_account_access()
RETURNS TABLE(
  owner_id uuid,
  sub_company_id uuid,
  sub_name text,
  allowed_pages text[],
  is_account_admin boolean,
  blocked_pages text[],
  status text,
  allow_custom_logic boolean,
  feature_landing_builder boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH access_pick AS (
    SELECT a.owner_id,
           a.sub_company_id,
           s.name AS sub_name,
           COALESCE(a.allowed_pages, ARRAY[]::text[]) AS allowed_pages,
           COALESCE(a.is_account_admin, false) AS is_account_admin,
           COALESCE(a.is_owner, false) AS is_owner,
           (a.owner_id = a.user_id) AS is_self_owner,
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
    SELECT cc.owner_id AS owner_id,
           NULL::uuid AS sub_company_id,
           NULL::text AS sub_name,
           ARRAY[]::text[] AS allowed_pages,
           true AS is_account_admin,
           true AS is_owner,
           (cc.owner_id = auth.uid()) AS is_self_owner,
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
     ORDER BY is_self_owner ASC, is_owner DESC, is_account_admin DESC, priority ASC, created_at ASC
     LIMIT 1
  ),
  parent_cc AS (
    SELECT cc.blocked_pages, cc.status
      FROM public.client_companies cc, picked p
     WHERE (p.sub_company_id IS NOT NULL AND cc.auth_user_id = (SELECT owner_id FROM public.sub_companies WHERE id = p.sub_company_id))
        OR (p.sub_company_id IS NULL AND cc.owner_id = p.owner_id)
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
$$;

REVOKE ALL ON FUNCTION public.get_my_account_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_account_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_account_access() TO service_role;

-- Normalizar chamadas históricas para o owner canônico (empresa) sempre que o
-- registro atual aponta para o admin/operador em vez da empresa.
UPDATE public.call_history ch
   SET owner_id = a.owner_id
  FROM public.user_account_access a
 WHERE a.user_id = ch.owner_id
   AND a.owner_id <> ch.owner_id
   AND a.is_account_admin = true
   AND NOT EXISTS (
     SELECT 1 FROM public.client_companies cc
      WHERE cc.owner_id = ch.owner_id
   );