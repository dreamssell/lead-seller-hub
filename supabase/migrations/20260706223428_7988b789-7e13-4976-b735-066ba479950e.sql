CREATE OR REPLACE FUNCTION public.get_my_account_access()
RETURNS TABLE(
  owner_id uuid,
  sub_company_id uuid,
  sub_company_name text,
  allowed_pages text[],
  is_account_admin boolean,
  blocked_pages text[],
  status text,
  allow_custom_logic boolean,
  feature_landing_builder boolean
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH picked AS (
    SELECT a.owner_id,
           a.sub_company_id,
           s.name AS sub_name,
           a.allowed_pages,
           a.is_account_admin,
           s.blocked_pages AS sub_blocked,
           s.status AS sub_status,
           s.allow_custom_logic AS sub_allow_custom_logic,
           s.feature_landing_builder AS sub_feature_landing_builder,
           a.created_at
      FROM public.user_account_access a
      LEFT JOIN public.sub_companies s ON s.id = a.sub_company_id
     WHERE a.user_id = auth.uid()
     ORDER BY a.is_account_admin DESC, a.created_at ASC
     LIMIT 1
  ),
  parent_cc AS (
    -- Empresa-mãe: quando é sub, procura via sub_companies.owner_id;
    -- quando é login direto de empresa, procura por auth_user_id = auth.uid().
    SELECT cc.blocked_pages, cc.status
      FROM public.client_companies cc, picked p
     WHERE (p.sub_company_id IS NOT NULL AND cc.auth_user_id = (SELECT owner_id FROM public.sub_companies WHERE id = p.sub_company_id))
        OR (p.sub_company_id IS NULL AND cc.auth_user_id = auth.uid())
     LIMIT 1
  ),
  merged AS (
    SELECT
      -- União de páginas bloqueadas: sub-empresa herda todas as chaves da empresa-mãe.
      ARRAY(
        SELECT DISTINCT unnest(
          COALESCE((SELECT sub_blocked FROM picked), ARRAY[]::text[])
          || COALESCE((SELECT blocked_pages FROM parent_cc), ARRAY[]::text[])
        )
      ) AS blocked_pages_merged,
      -- Status: se a empresa-mãe estiver bloqueada, propaga; senão usa o status da sub/empresa.
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