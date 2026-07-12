REVOKE EXECUTE ON FUNCTION public.get_my_account_access() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_account_access() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_account_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_account_access() TO service_role;