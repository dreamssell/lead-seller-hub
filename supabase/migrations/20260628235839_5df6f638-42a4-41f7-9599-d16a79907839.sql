REVOKE EXECUTE ON FUNCTION public.search_chat_messages_global(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_chat_messages_global(text, int) TO authenticated, service_role;