
CREATE OR REPLACE FUNCTION public.update_sla_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.sender_type IN ('agent','user','bot') THEN
    UPDATE public.customers
       SET first_response_at = COALESCE(first_response_at, NEW.created_at),
           sla_next_response_due_at = NULL
     WHERE id = NEW.customer_id;
  ELSIF NEW.sender_type = 'customer' THEN
    UPDATE public.customers c
       SET sla_next_response_due_at = COALESCE(
             NEW.created_at + (COALESCE(p.next_response_minutes, 30) || ' minutes')::interval,
             NEW.created_at + interval '30 minutes')
      FROM public.chat_queues q
      LEFT JOIN public.sla_policies p ON p.id = q.sla_policy_id
     WHERE c.id = NEW.customer_id AND q.id = c.queue_id;
  END IF;
  RETURN NEW;
END $$;
