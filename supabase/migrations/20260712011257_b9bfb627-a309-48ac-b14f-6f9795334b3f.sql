CREATE OR REPLACE FUNCTION public.get_latest_chat_messages_for_customers(_customer_ids uuid[])
RETURNS TABLE (
  customer_id uuid,
  content text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT ON (cm.customer_id)
    cm.customer_id,
    cm.content,
    cm.created_at
  FROM public.chat_messages cm
  WHERE cm.customer_id = ANY(_customer_ids)
  ORDER BY cm.customer_id, cm.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_latest_chat_messages_for_customers(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_chat_messages_for_customers(uuid[]) TO service_role;