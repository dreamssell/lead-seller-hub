-- Defesa em profundidade: expõe a lógica de blocked_pages/allowed_pages
-- como funções server-side reutilizáveis por edge functions e RPCs.

CREATE OR REPLACE FUNCTION public.current_user_blocked_pages()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(blocked_pages, ARRAY[]::text[])
    FROM public.get_my_account_access()
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_current_user_access(_page text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN RETURN true; END IF;

  SELECT * INTO r FROM public.get_my_account_access() LIMIT 1;
  IF NOT FOUND THEN RETURN true; END IF; -- sem restrição cadastrada

  IF r.status = 'blocked' THEN
    RETURN _page = 'profile';
  END IF;

  IF r.blocked_pages IS NOT NULL AND _page = ANY(r.blocked_pages) THEN
    RETURN false;
  END IF;

  IF r.is_account_admin OR COALESCE(array_length(r.allowed_pages, 1), 0) = 0 THEN
    RETURN true;
  END IF;

  RETURN _page = ANY(r.allowed_pages) OR _page = 'profile';
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_blocked_pages() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_current_user_access(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_blocked_pages() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_current_user_access(text) TO authenticated;