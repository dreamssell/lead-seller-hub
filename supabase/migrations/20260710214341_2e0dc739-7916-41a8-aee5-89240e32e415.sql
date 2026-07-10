REVOKE EXECUTE ON FUNCTION public.internal_comms_unread_counts() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.internal_comms_unread_counts() TO authenticated;