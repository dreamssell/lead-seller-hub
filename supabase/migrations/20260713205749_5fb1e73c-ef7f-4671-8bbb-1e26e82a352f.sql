
UPDATE public.user_signature_roles usr
SET owner_id = cc.owner_id
FROM public.client_companies cc
WHERE cc.auth_user_id = usr.owner_id
  AND cc.owner_id <> usr.owner_id;

CREATE OR REPLACE FUNCTION public.get_member_seat_usage(p_owner_id uuid, p_sub_company_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(plan_slug text, max_users integer, current_users integer, remaining integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_plan text; v_override int; v_plan_max int; v_max int; v_count int;
BEGIN
  IF p_sub_company_id IS NOT NULL THEN
    SELECT s.plan_slug, s.max_users_override INTO v_plan, v_override
      FROM public.sub_companies s WHERE s.id = p_sub_company_id;
    SELECT count(*) INTO v_count
      FROM public.user_account_access
     WHERE sub_company_id = p_sub_company_id
       AND is_owner = false;
  ELSE
    SELECT c.plan_slug, c.max_users_override INTO v_plan, v_override
      FROM public.client_companies c
     WHERE c.owner_id = p_owner_id OR c.auth_user_id = p_owner_id
     ORDER BY (c.owner_id = p_owner_id) DESC
     LIMIT 1;
    SELECT count(*) INTO v_count
      FROM public.user_account_access
     WHERE owner_id = p_owner_id
       AND sub_company_id IS NULL
       AND is_owner = false;
  END IF;
  SELECT pp.max_users INTO v_plan_max FROM public.plan_packages pp WHERE pp.slug = v_plan;
  v_max := COALESCE(v_override, v_plan_max);
  plan_slug := v_plan; max_users := v_max; current_users := COALESCE(v_count,0);
  remaining := CASE WHEN v_max IS NULL THEN NULL ELSE GREATEST(v_max - COALESCE(v_count,0),0) END;
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_account_manager(_user_id uuid, _owner_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    _user_id = _owner_id
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
       WHERE a.user_id = _user_id AND a.owner_id = _owner_id
         AND (a.is_account_admin = true OR a.is_owner = true)
    )
    OR EXISTS (
      SELECT 1 FROM public.user_signature_roles s
       WHERE s.user_id = _user_id AND s.owner_id = _owner_id
         AND s.role::text IN ('supervisor','coordenador','diretor')
    );
$$;

DROP POLICY IF EXISTS "Managers can view team profiles" ON public.profiles;
CREATE POLICY "Managers can view team profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.user_account_access target
        JOIN public.user_account_access caller
          ON caller.owner_id = target.owner_id
       WHERE target.user_id = public.profiles.user_id
         AND caller.user_id = auth.uid()
         AND public.is_account_manager(auth.uid(), caller.owner_id)
    )
  );
