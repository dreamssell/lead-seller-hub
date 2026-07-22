
CREATE OR REPLACE FUNCTION public.move_conversation_to_stage(
  p_customer_id uuid,
  p_owner_id uuid,
  p_stage assignment_stage,
  p_assigned_to uuid DEFAULT NULL,
  p_assigned_to_provided boolean DEFAULT false,
  p_actor_id uuid DEFAULT NULL,
  p_origin text DEFAULT 'manual'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub uuid;
  v_existing_id uuid;
  v_existing_stage assignment_stage;
  v_new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT sub_company_id INTO v_sub FROM public.customers WHERE id = p_customer_id;

  IF NOT public.can_user_move_leads(p_owner_id, v_sub) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id, stage INTO v_existing_id, v_existing_stage
    FROM public.lead_assignments
   WHERE customer_id = p_customer_id
     AND owner_id = p_owner_id
     AND stage <> 'closed'
   ORDER BY assigned_at DESC
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.lead_assignments SET
      stage = p_stage,
      assigned_to = CASE WHEN p_assigned_to_provided THEN p_assigned_to ELSE assigned_to END,
      first_response_at = CASE
        WHEN p_stage = 'active' AND first_response_at IS NULL THEN now()
        ELSE first_response_at
      END,
      closed_at = CASE WHEN p_stage = 'closed' THEN now() ELSE closed_at END,
      updated_at = now()
    WHERE id = v_existing_id;
    v_new_id := v_existing_id;
  ELSE
    INSERT INTO public.lead_assignments(
      owner_id, sub_company_id, customer_id, stage, priority, origin,
      assigned_to, first_response_at, closed_at, assigned_at
    ) VALUES (
      p_owner_id, v_sub, p_customer_id, p_stage, 'medium', COALESCE(p_origin,'manual'),
      CASE WHEN p_assigned_to_provided THEN p_assigned_to ELSE p_actor_id END,
      CASE WHEN p_stage = 'active' THEN now() ELSE NULL END,
      CASE WHEN p_stage = 'closed' THEN now() ELSE NULL END,
      now()
    ) RETURNING id INTO v_new_id;
  END IF;

  IF p_assigned_to_provided THEN
    UPDATE public.customers SET assigned_to = p_assigned_to WHERE id = p_customer_id;
  END IF;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_conversation_to_stage(uuid, uuid, assignment_stage, uuid, boolean, uuid, text) TO authenticated;
