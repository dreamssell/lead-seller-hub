
CREATE OR REPLACE FUNCTION public.list_mentionable_users(_owner_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
  avatar_url text,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.email, p.display_name, p.avatar_url, p.is_active
  FROM public.profiles p
  WHERE (
    -- caller must belong to this tenant (as owner, admin member, or via role)
    EXISTS (
      SELECT 1 FROM public.user_account_access caller
      WHERE caller.owner_id = _owner_id
        AND caller.user_id = auth.uid()
    )
    OR auth.uid() = _owner_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  AND (
    -- returned profile must also belong to this tenant
    p.user_id = _owner_id
    OR EXISTS (
      SELECT 1 FROM public.user_account_access target
      WHERE target.owner_id = _owner_id
        AND target.user_id = p.user_id
    )
  )
  AND COALESCE(p.is_active, true) = true
  ORDER BY p.display_name NULLS LAST, p.email;
$$;

GRANT EXECUTE ON FUNCTION public.list_mentionable_users(uuid) TO authenticated;
