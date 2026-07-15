
-- Extend routing_rules with flexible conditions/actions
ALTER TABLE public.routing_rules
  ADD COLUMN IF NOT EXISTS conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS actions jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Ensure pg_cron / pg_net are enabled for scheduled scans
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- SLA overflow: move stale waiting leads to fallback queue and log event
CREATE OR REPLACE FUNCTION public.sla_overflow_scan()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer := 0;
  r record;
  new_queue uuid;
BEGIN
  FOR r IN
    SELECT la.id, la.queue_id, la.assigned_to, la.owner_id, la.customer_id,
           q.fallback_queue_id, q.sla_overflow_seconds
    FROM public.lead_assignments la
    JOIN public.attendance_queues q ON q.id = la.queue_id
    WHERE la.stage IN ('waiting','auto')
      AND la.first_response_at IS NULL
      AND la.closed_at IS NULL
      AND la.assigned_at IS NOT NULL
      AND q.sla_overflow_seconds IS NOT NULL
      AND la.assigned_at + make_interval(secs => q.sla_overflow_seconds) < now()
  LOOP
    new_queue := COALESCE(r.fallback_queue_id, r.queue_id);

    UPDATE public.lead_assignments
    SET queue_id = new_queue,
        assigned_to = NULL,
        stage = 'waiting',
        assigned_at = now(),
        updated_at = now()
    WHERE id = r.id;

    INSERT INTO public.assignment_events (
      assignment_id, customer_id, owner_id, event_type, from_user, details
    ) VALUES (
      r.id, r.customer_id, r.owner_id, 'sla_overflow', r.assigned_to,
      jsonb_build_object(
        'previous_queue', r.queue_id,
        'previous_user', r.assigned_to,
        'fallback_queue', r.fallback_queue_id,
        'sla_seconds', r.sla_overflow_seconds
      )
    );

    affected := affected + 1;
  END LOOP;

  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sla_overflow_scan() TO service_role;

-- Route lead using owner-scoped rules (evaluated by priority)
CREATE OR REPLACE FUNCTION public.route_inbound_lead(
  _customer_id uuid,
  _channel text DEFAULT NULL,
  _origin text DEFAULT NULL,
  _keywords text[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cust record;
  rule record;
  chosen_queue uuid;
  chosen_user uuid;
  new_assignment_id uuid;
  cond jsonb;
  act jsonb;
  keywords_match boolean;
  kw text;
BEGIN
  SELECT id, owner_id, sub_company_id, channel INTO cust
  FROM public.customers WHERE id = _customer_id;
  IF cust IS NULL THEN
    RAISE EXCEPTION 'customer_not_found';
  END IF;

  FOR rule IN
    SELECT * FROM public.routing_rules
    WHERE owner_id = cust.owner_id AND active = true
    ORDER BY priority ASC, created_at ASC
  LOOP
    cond := COALESCE(rule.conditions, '{}'::jsonb);
    act  := COALESCE(rule.actions, '{}'::jsonb);

    -- channel match
    IF rule.channel IS NOT NULL AND rule.channel <> COALESCE(_channel, cust.channel, '') THEN
      CONTINUE;
    END IF;
    IF cond ? 'channel' AND (cond->>'channel') <> COALESCE(_channel, cust.channel, '') THEN
      CONTINUE;
    END IF;
    IF cond ? 'origin' AND (cond->>'origin') <> COALESCE(_origin, '') THEN
      CONTINUE;
    END IF;
    IF cond ? 'keywords' AND _keywords IS NOT NULL THEN
      keywords_match := false;
      FOR kw IN SELECT jsonb_array_elements_text(cond->'keywords') LOOP
        IF kw = ANY(_keywords) THEN keywords_match := true; EXIT; END IF;
      END LOOP;
      IF NOT keywords_match THEN CONTINUE; END IF;
    END IF;

    chosen_queue := COALESCE((act->>'queue_id')::uuid, rule.target_queue_id);
    chosen_user  := COALESCE((act->>'user_id')::uuid, rule.target_user_id);
    EXIT;
  END LOOP;

  IF chosen_user IS NULL AND chosen_queue IS NOT NULL THEN
    chosen_user := public.pick_next_queue_member(chosen_queue);
  END IF;

  INSERT INTO public.lead_assignments (
    customer_id, owner_id, sub_company_id, queue_id, assigned_to,
    stage, origin, assigned_at
  ) VALUES (
    _customer_id, cust.owner_id, cust.sub_company_id, chosen_queue, chosen_user,
    CASE WHEN chosen_user IS NOT NULL THEN 'waiting'::assignment_stage
         WHEN chosen_queue IS NOT NULL THEN 'auto'::assignment_stage
         ELSE 'manual'::assignment_stage END,
    _origin, now()
  ) RETURNING id INTO new_assignment_id;

  INSERT INTO public.assignment_events (
    assignment_id, customer_id, owner_id, event_type, to_user, to_stage, details
  ) VALUES (
    new_assignment_id, _customer_id, cust.owner_id, 'routed', chosen_user,
    CASE WHEN chosen_user IS NOT NULL THEN 'waiting'::assignment_stage
         WHEN chosen_queue IS NOT NULL THEN 'auto'::assignment_stage
         ELSE 'manual'::assignment_stage END,
    jsonb_build_object('queue_id', chosen_queue, 'channel', _channel, 'origin', _origin)
  );

  RETURN new_assignment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.route_inbound_lead(uuid, text, text, text[]) TO service_role, authenticated;
