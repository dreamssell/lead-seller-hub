CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_account_access_root
  ON public.user_account_access(user_id, owner_id)
  WHERE sub_company_id IS NULL;

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
    COALESCE(s.status, 'active') AS status
  FROM public.user_account_access a
  LEFT JOIN public.sub_companies s ON s.id = a.sub_company_id
  WHERE a.user_id = auth.uid()
  ORDER BY a.is_account_admin DESC, a.created_at ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.upsert_user_account_access(
  p_user_id uuid,
  p_owner_id uuid,
  p_sub_company_id uuid DEFAULT NULL,
  p_allowed_pages text[] DEFAULT ARRAY[]::text[],
  p_is_account_admin boolean DEFAULT false
)
RETURNS public.user_account_access
LANGUAGE plpgsql
SECURITY INVOKER
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

  IF p_sub_company_id IS NULL THEN
    INSERT INTO public.user_account_access(user_id, owner_id, sub_company_id, allowed_pages, is_account_admin, created_by)
    VALUES (p_user_id, p_owner_id, NULL, COALESCE(p_allowed_pages, ARRAY[]::text[]), COALESCE(p_is_account_admin, false), auth.uid())
    ON CONFLICT (user_id, owner_id) WHERE sub_company_id IS NULL
    DO UPDATE SET
      allowed_pages = EXCLUDED.allowed_pages,
      is_account_admin = EXCLUDED.is_account_admin,
      updated_at = now()
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.user_account_access(user_id, owner_id, sub_company_id, allowed_pages, is_account_admin, created_by)
    VALUES (p_user_id, p_owner_id, p_sub_company_id, COALESCE(p_allowed_pages, ARRAY[]::text[]), COALESCE(p_is_account_admin, false), auth.uid())
    ON CONFLICT (user_id, owner_id, sub_company_id)
    DO UPDATE SET
      allowed_pages = EXCLUDED.allowed_pages,
      is_account_admin = EXCLUDED.is_account_admin,
      updated_at = now()
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_account_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_user_account_access(uuid, uuid, uuid, text[], boolean) TO authenticated;