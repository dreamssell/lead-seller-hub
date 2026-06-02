DROP FUNCTION IF EXISTS public.get_my_account_access();

CREATE OR REPLACE FUNCTION public.get_my_account_access()
RETURNS TABLE(
  owner_id uuid,
  sub_company_id uuid,
  sub_company_name text,
  allowed_pages text[],
  is_account_admin boolean,
  blocked_pages text[],
  status text,
  allow_custom_logic boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    a.owner_id,
    a.sub_company_id,
    s.name AS sub_company_name,
    a.allowed_pages,
    a.is_account_admin,
    COALESCE(s.blocked_pages, ARRAY[]::text[]) AS blocked_pages,
    COALESCE(s.status, 'active') AS status,
    COALESCE(s.allow_custom_logic, true) AS allow_custom_logic
  FROM public.user_account_access a
  LEFT JOIN public.sub_companies s ON s.id = a.sub_company_id
  WHERE a.user_id = auth.uid()
  ORDER BY a.is_account_admin DESC, a.created_at ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_account_access() TO authenticated;
