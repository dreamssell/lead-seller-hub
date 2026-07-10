
-- 1) Novas colunas de bloqueio manual
ALTER TABLE public.client_companies ADD COLUMN IF NOT EXISTS seat_additions_blocked boolean NOT NULL DEFAULT false;
ALTER TABLE public.sub_companies    ADD COLUMN IF NOT EXISTS seat_additions_blocked boolean NOT NULL DEFAULT false;

-- 2) Tabela de auditoria de limite de assentos
CREATE TABLE IF NOT EXISTS public.seat_limit_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid,
  sub_company_id uuid,
  plan_slug text,
  max_users integer,
  current_users integer,
  target_user_id uuid,
  attempted_by uuid,
  reason text NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.seat_limit_audit TO authenticated;
GRANT ALL    ON public.seat_limit_audit TO service_role;
ALTER TABLE public.seat_limit_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin or owner can view seat audit" ON public.seat_limit_audit;
CREATE POLICY "admin or owner can view seat audit"
  ON public.seat_limit_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR auth.uid() = owner_id);
CREATE INDEX IF NOT EXISTS idx_seat_limit_audit_owner ON public.seat_limit_audit(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seat_limit_audit_sub   ON public.seat_limit_audit(sub_company_id, created_at DESC);

-- 3) Validação de plan_slug contra o catálogo oficial
CREATE OR REPLACE FUNCTION public.validate_plan_slug()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.plan_slug IS NULL OR NEW.plan_slug = '' THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.plan_packages WHERE slug = NEW.plan_slug) THEN
    RAISE EXCEPTION 'plan_slug_invalid: o plano "%" não existe no catálogo oficial. Use start, elite, platinum ou enterprise.', NEW.plan_slug
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validate_plan_slug_cc ON public.client_companies;
CREATE TRIGGER trg_validate_plan_slug_cc BEFORE INSERT OR UPDATE OF plan_slug ON public.client_companies
  FOR EACH ROW EXECUTE FUNCTION public.validate_plan_slug();
DROP TRIGGER IF EXISTS trg_validate_plan_slug_sc ON public.sub_companies;
CREATE TRIGGER trg_validate_plan_slug_sc BEFORE INSERT OR UPDATE OF plan_slug ON public.sub_companies
  FOR EACH ROW EXECUTE FUNCTION public.validate_plan_slug();

-- 4) Corrige planos inexistentes ANTES de armar o trigger de validação em dados antigos
UPDATE public.client_companies SET plan_slug = 'platinum'
  WHERE plan_slug IS NOT NULL AND plan_slug NOT IN (SELECT slug FROM public.plan_packages);

-- 5) Atualiza enforce_member_seat_limit para: logar auditoria + respeitar bloqueio manual
CREATE OR REPLACE FUNCTION public.enforce_member_seat_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan text; v_plan_max int; v_override int; v_max int; v_count int;
  v_manual_block boolean := false;
  v_reason text;
  v_msg text;
BEGIN
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.sub_company_id IS NOT NULL THEN
    SELECT s.plan_slug, s.max_users_override, s.seat_additions_blocked INTO v_plan, v_override, v_manual_block
      FROM public.sub_companies s WHERE s.id = NEW.sub_company_id;
    SELECT count(*) INTO v_count FROM public.user_account_access
     WHERE sub_company_id = NEW.sub_company_id AND user_id <> NEW.user_id;
  ELSE
    SELECT c.plan_slug, c.max_users_override, c.seat_additions_blocked INTO v_plan, v_override, v_manual_block
      FROM public.client_companies c WHERE c.auth_user_id = NEW.owner_id LIMIT 1;
    SELECT count(*) INTO v_count FROM public.user_account_access
     WHERE owner_id = NEW.owner_id AND sub_company_id IS NULL AND user_id <> NEW.user_id;
  END IF;

  SELECT pp.max_users INTO v_plan_max FROM public.plan_packages pp WHERE pp.slug = v_plan;
  v_max := COALESCE(v_override, v_plan_max);

  -- Bloqueio manual (dono da plataforma pausou inclusões)
  IF COALESCE(v_manual_block, false) THEN
    v_reason := 'manual_block';
    v_msg := format('seat_additions_blocked: inclusões pausadas manualmente pelo administrador (plano %s, %s licenças em uso)',
                    COALESCE(v_plan,'sem_plano'), v_count);
    INSERT INTO public.seat_limit_audit(owner_id, sub_company_id, plan_slug, max_users, current_users,
                                        target_user_id, attempted_by, reason, message)
    VALUES (NEW.owner_id, NEW.sub_company_id, v_plan, v_max, v_count, NEW.user_id, auth.uid(), v_reason, v_msg);
    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'check_violation';
  END IF;

  IF v_max IS NOT NULL AND v_count >= v_max THEN
    v_reason := 'plan_limit';
    v_msg := format('plan_seat_limit_reached: o plano %s permite no máximo %s usuários (já em uso: %s)',
                    COALESCE(v_plan,'sem_plano'), v_max, v_count);
    INSERT INTO public.seat_limit_audit(owner_id, sub_company_id, plan_slug, max_users, current_users,
                                        target_user_id, attempted_by, reason, message)
    VALUES (NEW.owner_id, NEW.sub_company_id, v_plan, v_max, v_count, NEW.user_id, auth.uid(), v_reason, v_msg);
    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;
