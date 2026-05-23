CREATE TABLE IF NOT EXISTS public.user_account_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sub_company_id uuid REFERENCES public.sub_companies(id) ON DELETE CASCADE,
  allowed_pages text[] NOT NULL DEFAULT ARRAY[]::text[],
  is_account_admin boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, owner_id, sub_company_id)
);

ALTER TABLE public.user_account_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own account access" ON public.user_account_access;
CREATE POLICY "Users can view own account access"
  ON public.user_account_access
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owner admins can view account access" ON public.user_account_access;
CREATE POLICY "Owner admins can view account access"
  ON public.user_account_access
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Owner admins can manage account access" ON public.user_account_access;
CREATE POLICY "Owner admins can manage account access"
  ON public.user_account_access
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_user_account_access_user ON public.user_account_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_account_access_owner ON public.user_account_access(owner_id);
CREATE INDEX IF NOT EXISTS idx_user_account_access_sub ON public.user_account_access(sub_company_id);

DROP TRIGGER IF EXISTS trg_user_account_access_updated ON public.user_account_access;
CREATE TRIGGER trg_user_account_access_updated
  BEFORE UPDATE ON public.user_account_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_my_account_access()
RETURNS TABLE(
  owner_id uuid,
  sub_company_id uuid,
  sub_company_name text,
  allowed_pages text[],
  is_account_admin boolean,
  blocked_pages text[],
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.owner_id,
    a.sub_company_id,
    s.name AS sub_company_name,
    a.allowed_pages,
    a.is_account_admin,
    COALESCE(s.blocked_pages, ARRAY[]::text[]) AS blocked_pages,
    COALESCE(s.status, 'active') AS status
  FROM public.user_account_access a
  LEFT JOIN public.sub_companies s ON s.id = a.sub_company_id
  WHERE a.user_id = auth.uid()
  ORDER BY a.is_account_admin DESC, a.created_at ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_account_access() TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_user_account_access(
  p_user_id uuid,
  p_owner_id uuid,
  p_sub_company_id uuid DEFAULT NULL,
  p_allowed_pages text[] DEFAULT ARRAY[]::text[],
  p_is_account_admin boolean DEFAULT false
)
RETURNS public.user_account_access
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.user_account_access;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF auth.uid() <> p_owner_id AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  IF p_sub_company_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sub_companies
    WHERE id = p_sub_company_id AND owner_id = p_owner_id
  ) THEN
    RAISE EXCEPTION 'sub_company_not_found';
  END IF;

  INSERT INTO public.user_account_access(user_id, owner_id, sub_company_id, allowed_pages, is_account_admin, created_by)
  VALUES (p_user_id, p_owner_id, p_sub_company_id, COALESCE(p_allowed_pages, ARRAY[]::text[]), COALESCE(p_is_account_admin, false), auth.uid())
  ON CONFLICT (user_id, owner_id, sub_company_id)
  DO UPDATE SET
    allowed_pages = EXCLUDED.allowed_pages,
    is_account_admin = EXCLUDED.is_account_admin,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_user_account_access(uuid, uuid, uuid, text[], boolean) TO authenticated;

INSERT INTO public.user_account_access(user_id, owner_id, sub_company_id, allowed_pages, is_account_admin, created_by)
SELECT ur.user_id, ur.user_id, NULL::uuid, ARRAY[]::text[], true, ur.user_id
FROM public.user_roles ur
WHERE ur.role = 'admin'::app_role
ON CONFLICT (user_id, owner_id, sub_company_id) DO NOTHING;