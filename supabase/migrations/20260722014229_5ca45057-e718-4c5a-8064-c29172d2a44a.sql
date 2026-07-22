
CREATE OR REPLACE FUNCTION public.log_conversation_transfer(
  p_customer_id uuid,
  p_notice_type text,
  p_target_label text,
  p_reason text DEFAULT NULL,
  p_target_user_id uuid DEFAULT NULL,
  p_target_stage text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_count integer := 0;
  v_type text;
  v_lead record;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_notice_type = 'transfer_flow' THEN
    v_type := 'transferred_to_stage';
  ELSE
    v_type := 'transferred_to_user';
  END IF;

  FOR v_lead IN
    SELECT id, owner_id, sub_company_id
    FROM public.leads
    WHERE customer_id = p_customer_id
  LOOP
    INSERT INTO public.lead_events (
      lead_id, owner_id, sub_company_id, type, actor_id, channel, source, metadata
    ) VALUES (
      v_lead.id,
      v_lead.owner_id,
      v_lead.sub_company_id,
      v_type,
      v_actor,
      'whatsapp',
      'chat_transfer',
      jsonb_build_object(
        'notice_type', p_notice_type,
        'target_label', p_target_label,
        'target_user_id', p_target_user_id,
        'target_stage', p_target_stage,
        'reason', p_reason
      )
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_conversation_transfer(uuid, text, text, text, uuid, text) TO authenticated;
