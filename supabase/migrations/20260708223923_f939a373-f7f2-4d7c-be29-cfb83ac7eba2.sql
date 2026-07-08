REVOKE EXECUTE ON FUNCTION public.get_my_account_access() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_account_access() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_account_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_account_access() TO service_role;

REVOKE EXECUTE ON FUNCTION public.can_current_user_access(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_current_user_access(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_current_user_access(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_current_user_access(text) TO service_role;