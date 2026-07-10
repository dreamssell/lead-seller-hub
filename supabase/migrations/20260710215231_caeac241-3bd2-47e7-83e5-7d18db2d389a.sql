
CREATE OR REPLACE FUNCTION public.list_internal_comms_members()
RETURNS TABLE(
  user_id uuid,
  display_name text,
  email text,
  avatar_url text,
  is_account_admin boolean,
  is_owner boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_owner uuid;
  v_sub uuid;
BEGIN
  IF v_me IS NULL THEN RETURN; END IF;

  SELECT a.owner_id, a.sub_company_id
    INTO v_owner, v_sub
    FROM public.get_my_account_access() a
   LIMIT 1;

  IF v_owner IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH scope_members AS (
    -- Colleagues in the same scope (same owner_id + same sub_company_id, treating NULL as "empresa matriz")
    SELECT DISTINCT ON (uaa.user_id)
           uaa.user_id,
           COALESCE(uaa.is_account_admin, false) AS is_account_admin,
           COALESCE(uaa.is_owner, false) AS is_owner
      FROM public.user_account_access uaa
     WHERE uaa.owner_id = v_owner
       AND (
         (v_sub IS NULL AND uaa.sub_company_id IS NULL)
         OR (v_sub IS NOT NULL AND uaa.sub_company_id = v_sub)
       )
    UNION
    -- Always include the platform account owner (holder of client_companies) when we're in the "matriz" scope,
    -- even if they don't have a user_account_access row of their own.
    SELECT cc.auth_user_id AS user_id, true AS is_account_admin, true AS is_owner
      FROM public.client_companies cc
     WHERE v_sub IS NULL
       AND cc.auth_user_id = v_owner
  )
  SELECT sm.user_id,
         COALESCE(p.display_name, p.email, 'Usuário') AS display_name,
         p.email,
         p.avatar_url,
         bool_or(sm.is_account_admin) AS is_account_admin,
         bool_or(sm.is_owner) AS is_owner
    FROM scope_members sm
    LEFT JOIN public.profiles p ON p.user_id = sm.user_id
   WHERE sm.user_id <> v_me
   GROUP BY sm.user_id, p.display_name, p.email, p.avatar_url
   ORDER BY display_name;
END;
$$;

REVOKE ALL ON FUNCTION public.list_internal_comms_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_internal_comms_members() TO authenticated;
