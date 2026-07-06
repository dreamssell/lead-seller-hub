
-- 1) Flag de titularidade nos acessos
ALTER TABLE public.user_account_access
  ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

-- Backfill: titular da conta principal = usuário == owner_id (sem sub_company)
UPDATE public.user_account_access
   SET is_owner = true
 WHERE sub_company_id IS NULL
   AND user_id = owner_id;

-- Backfill: titular da sub-empresa = primeiro admin criado nela
WITH firsts AS (
  SELECT DISTINCT ON (sub_company_id) id
    FROM public.user_account_access
   WHERE sub_company_id IS NOT NULL
     AND is_account_admin = true
   ORDER BY sub_company_id, created_at ASC
)
UPDATE public.user_account_access u
   SET is_owner = true
  FROM firsts f
 WHERE u.id = f.id;

-- 2) Limite de assentos conforme o plano
CREATE OR REPLACE FUNCTION public.enforce_member_seat_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_max  int;
  v_count int;
BEGIN
  -- Bypass para dono da plataforma
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.sub_company_id IS NOT NULL THEN
    SELECT plan_slug INTO v_plan
      FROM public.sub_companies
     WHERE id = NEW.sub_company_id;
    SELECT count(*) INTO v_count
      FROM public.user_account_access
     WHERE sub_company_id = NEW.sub_company_id
       AND user_id <> NEW.user_id;
  ELSE
    SELECT plan_slug INTO v_plan
      FROM public.client_companies
     WHERE auth_user_id = NEW.owner_id
     LIMIT 1;
    SELECT count(*) INTO v_count
      FROM public.user_account_access
     WHERE owner_id = NEW.owner_id
       AND sub_company_id IS NULL
       AND user_id <> NEW.user_id;
  END IF;

  IF v_plan IS NOT NULL THEN
    SELECT max_users INTO v_max FROM public.plan_packages WHERE slug = v_plan;
    IF v_max IS NOT NULL AND v_count >= v_max THEN
      RAISE EXCEPTION 'plan_seat_limit_reached: o plano % permite no máximo % usuários (já em uso: %)', v_plan, v_max, v_count
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_member_seat_limit_ins ON public.user_account_access;
CREATE TRIGGER enforce_member_seat_limit_ins
BEFORE INSERT ON public.user_account_access
FOR EACH ROW EXECUTE FUNCTION public.enforce_member_seat_limit();

-- 3) Proteção do titular contra deleção/rebaixamento
CREATE OR REPLACE FUNCTION public.protect_account_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_owner AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'owner_protected: somente o dono da plataforma pode remover o titular da conta'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_owner AND NEW.is_owner = false
       AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'owner_protected: somente o dono da plataforma pode rebaixar o titular'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF OLD.is_owner AND NEW.is_account_admin = false
       AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'owner_protected: o titular precisa manter privilégios de administrador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_account_owner_del ON public.user_account_access;
CREATE TRIGGER protect_account_owner_del
BEFORE DELETE ON public.user_account_access
FOR EACH ROW EXECUTE FUNCTION public.protect_account_owner();

DROP TRIGGER IF EXISTS protect_account_owner_upd ON public.user_account_access;
CREATE TRIGGER protect_account_owner_upd
BEFORE UPDATE ON public.user_account_access
FOR EACH ROW EXECUTE FUNCTION public.protect_account_owner();

-- 4) Proteção da marca Lead Seller (owner_id pertence a um platform admin)
CREATE OR REPLACE FUNCTION public.protect_platform_branding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_owner uuid;
BEGIN
  v_target_owner := COALESCE(NEW.owner_id, OLD.owner_id);
  IF v_target_owner IS NOT NULL
     AND public.has_role(v_target_owner, 'admin'::app_role)
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'branding_locked: a marca Lead Seller não pode ser alterada'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS protect_platform_branding_iu ON public.white_label_settings;
CREATE TRIGGER protect_platform_branding_iu
BEFORE INSERT OR UPDATE OR DELETE ON public.white_label_settings
FOR EACH ROW EXECUTE FUNCTION public.protect_platform_branding();

-- 5) Helper para o frontend consultar o limite atual
CREATE OR REPLACE FUNCTION public.get_member_seat_usage(p_owner_id uuid, p_sub_company_id uuid DEFAULT NULL)
RETURNS TABLE(plan_slug text, max_users integer, current_users integer, remaining integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_max int;
  v_count int;
BEGIN
  IF p_sub_company_id IS NOT NULL THEN
    SELECT s.plan_slug INTO v_plan FROM public.sub_companies s WHERE s.id = p_sub_company_id;
    SELECT count(*) INTO v_count FROM public.user_account_access WHERE sub_company_id = p_sub_company_id;
  ELSE
    SELECT c.plan_slug INTO v_plan FROM public.client_companies c WHERE c.auth_user_id = p_owner_id LIMIT 1;
    SELECT count(*) INTO v_count FROM public.user_account_access WHERE owner_id = p_owner_id AND sub_company_id IS NULL;
  END IF;
  SELECT p.max_users INTO v_max FROM public.plan_packages p WHERE p.slug = v_plan;
  plan_slug := v_plan;
  max_users := v_max;
  current_users := COALESCE(v_count, 0);
  remaining := CASE WHEN v_max IS NULL THEN NULL ELSE GREATEST(v_max - COALESCE(v_count,0), 0) END;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_seat_usage(uuid, uuid) TO authenticated;
