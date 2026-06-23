
DROP FUNCTION IF EXISTS public.get_my_account_access();
CREATE FUNCTION public.get_my_account_access()
 RETURNS TABLE(owner_id uuid, sub_company_id uuid, sub_company_name text, allowed_pages text[], is_account_admin boolean, blocked_pages text[], status text, allow_custom_logic boolean, feature_landing_builder boolean)
 LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT a.owner_id, a.sub_company_id, s.name,
         a.allowed_pages, a.is_account_admin,
         COALESCE(s.blocked_pages, ARRAY[]::text[]),
         COALESCE(s.status, 'active'),
         COALESCE(s.allow_custom_logic, true),
         COALESCE(s.feature_landing_builder, false)
  FROM public.user_account_access a
  LEFT JOIN public.sub_companies s ON s.id = a.sub_company_id
  WHERE a.user_id = auth.uid()
  ORDER BY a.is_account_admin DESC, a.created_at ASC
  LIMIT 1;
$$;
