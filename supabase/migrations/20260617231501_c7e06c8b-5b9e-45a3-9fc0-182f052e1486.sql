
CREATE TABLE public.signature_role_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  sub_company_id uuid,
  action text NOT NULL,
  old_role text,
  new_role text,
  changed_by uuid,
  changed_by_email text,
  target_email text,
  sub_company_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sigrole_audit_owner ON public.signature_role_audit(owner_id, created_at DESC);

GRANT SELECT ON public.signature_role_audit TO authenticated;
GRANT ALL ON public.signature_role_audit TO service_role;

ALTER TABLE public.signature_role_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner and admin read audit" ON public.signature_role_audit
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.log_signature_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_old text;
  v_new text;
  v_target uuid;
  v_owner uuid;
  v_sub uuid;
  v_changed_by uuid := auth.uid();
  v_changed_by_email text;
  v_target_email text;
  v_sub_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create'; v_new := NEW.role::text;
    v_target := NEW.user_id; v_owner := NEW.owner_id; v_sub := NEW.sub_company_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update'; v_old := OLD.role::text; v_new := NEW.role::text;
    v_target := NEW.user_id; v_owner := NEW.owner_id; v_sub := NEW.sub_company_id;
    IF v_old = v_new AND OLD.sub_company_id IS NOT DISTINCT FROM NEW.sub_company_id THEN
      RETURN NEW;
    END IF;
  ELSE
    v_action := 'delete'; v_old := OLD.role::text;
    v_target := OLD.user_id; v_owner := OLD.owner_id; v_sub := OLD.sub_company_id;
  END IF;

  SELECT email INTO v_target_email FROM public.profiles WHERE user_id = v_target;
  SELECT email INTO v_changed_by_email FROM public.profiles WHERE user_id = v_changed_by;
  IF v_sub IS NOT NULL THEN
    SELECT name INTO v_sub_name FROM public.sub_companies WHERE id = v_sub;
  END IF;

  INSERT INTO public.signature_role_audit(
    owner_id, target_user_id, sub_company_id, action, old_role, new_role,
    changed_by, changed_by_email, target_email, sub_company_name
  ) VALUES (
    v_owner, v_target, v_sub, v_action, v_old, v_new,
    v_changed_by, v_changed_by_email, v_target_email, v_sub_name
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sigrole_audit ON public.user_signature_roles;
CREATE TRIGGER trg_sigrole_audit
AFTER INSERT OR UPDATE OR DELETE ON public.user_signature_roles
FOR EACH ROW EXECUTE FUNCTION public.log_signature_role_change();

ALTER TABLE public.signature_documents REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.signature_documents;
