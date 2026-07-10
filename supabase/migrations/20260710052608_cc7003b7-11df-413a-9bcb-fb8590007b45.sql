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
    SELECT count(*) INTO v_count FROM public.user_account_access WHERE sub_company_id = p_sub_company_id;
  ELSE
    SELECT c.plan_slug, c.max_users_override INTO v_plan, v_override
      FROM public.client_companies c WHERE c.auth_user_id = p_owner_id LIMIT 1;
    SELECT count(*) INTO v_count FROM public.user_account_access
     WHERE owner_id = p_owner_id AND sub_company_id IS NULL;
  END IF;
  SELECT pp.max_users INTO v_plan_max FROM public.plan_packages pp WHERE pp.slug = v_plan;
  v_max := COALESCE(v_override, v_plan_max);
  plan_slug := v_plan; max_users := v_max; current_users := COALESCE(v_count,0);
  remaining := CASE WHEN v_max IS NULL THEN NULL ELSE GREATEST(v_max - COALESCE(v_count,0),0) END;
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_member_seat_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan text; v_plan_max int; v_override int; v_max int; v_count int;
BEGIN
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.sub_company_id IS NOT NULL THEN
    SELECT s.plan_slug, s.max_users_override INTO v_plan, v_override
      FROM public.sub_companies s WHERE s.id = NEW.sub_company_id;
    SELECT count(*) INTO v_count FROM public.user_account_access
     WHERE sub_company_id = NEW.sub_company_id AND user_id <> NEW.user_id;
  ELSE
    SELECT c.plan_slug, c.max_users_override INTO v_plan, v_override
      FROM public.client_companies c WHERE c.auth_user_id = NEW.owner_id LIMIT 1;
    SELECT count(*) INTO v_count FROM public.user_account_access
     WHERE owner_id = NEW.owner_id AND sub_company_id IS NULL AND user_id <> NEW.user_id;
  END IF;
  SELECT pp.max_users INTO v_plan_max FROM public.plan_packages pp WHERE pp.slug = v_plan;
  v_max := COALESCE(v_override, v_plan_max);
  IF v_max IS NOT NULL AND v_count >= v_max THEN
    RAISE EXCEPTION 'plan_seat_limit_reached: o plano % permite no máximo % usuários (já em uso: %)',
      COALESCE(v_plan,'sem_plano'), v_max, v_count
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;