
DO $$ BEGIN
  CREATE TYPE public.queue_routing_strategy AS ENUM ('round_robin','skill','load_balance','manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.assignment_stage AS ENUM ('manual','auto','waiting','active','snoozed','closed','returned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.attendance_queues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  sub_company_id UUID NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  pipeline_id UUID NULL,
  routing_strategy public.queue_routing_strategy NOT NULL DEFAULT 'round_robin',
  sla_overflow_seconds INTEGER NOT NULL DEFAULT 180,
  fallback_queue_id UUID NULL REFERENCES public.attendance_queues(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_assigned_member_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attendance_queues_owner ON public.attendance_queues(owner_id);
CREATE INDEX IF NOT EXISTS idx_attendance_queues_sub ON public.attendance_queues(sub_company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_queues TO authenticated;
GRANT ALL ON public.attendance_queues TO service_role;
ALTER TABLE public.attendance_queues ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.queue_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  queue_id UUID NOT NULL REFERENCES public.attendance_queues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  skills TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  current_load INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (queue_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_queue_members_user ON public.queue_members(user_id);
CREATE INDEX IF NOT EXISTS idx_queue_members_owner ON public.queue_members(owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.queue_members TO authenticated;
GRANT ALL ON public.queue_members TO service_role;
ALTER TABLE public.queue_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.lead_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  sub_company_id UUID NULL,
  queue_id UUID NULL REFERENCES public.attendance_queues(id) ON DELETE SET NULL,
  assigned_to UUID NULL,
  stage public.assignment_stage NOT NULL DEFAULT 'waiting',
  priority TEXT NOT NULL DEFAULT 'medium',
  origin TEXT NULL,
  first_note TEXT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_response_at TIMESTAMPTZ NULL,
  snoozed_until TIMESTAMPTZ NULL,
  closed_at TIMESTAMPTZ NULL,
  close_value NUMERIC(14,2) NULL,
  close_status_tag TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_customer ON public.lead_assignments(customer_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_owner ON public.lead_assignments(owner_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_assigned_to ON public.lead_assignments(assigned_to);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_stage ON public.lead_assignments(stage);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_queue ON public.lead_assignments(queue_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_assignments TO authenticated;
GRANT ALL ON public.lead_assignments TO service_role;
ALTER TABLE public.lead_assignments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.assignment_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID NULL REFERENCES public.lead_assignments(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  actor_id UUID NULL,
  event_type TEXT NOT NULL,
  from_stage public.assignment_stage NULL,
  to_stage public.assignment_stage NULL,
  from_user UUID NULL,
  to_user UUID NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assignment_events_assignment ON public.assignment_events(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_events_customer ON public.assignment_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_assignment_events_owner ON public.assignment_events(owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_events TO authenticated;
GRANT ALL ON public.assignment_events TO service_role;
ALTER TABLE public.assignment_events ENABLE ROW LEVEL SECURITY;

-- Helpers
CREATE OR REPLACE FUNCTION public.is_manager_or_owner_of(_owner UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE has_sig BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  IF auth.uid() = _owner THEN RETURN TRUE; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN TRUE; END IF;
  SELECT EXISTS(
    SELECT 1 FROM public.user_signature_roles
    WHERE user_id = auth.uid() AND role IN ('diretor','coordenador','supervisor')
  ) INTO has_sig;
  RETURN COALESCE(has_sig, FALSE);
END $$;
REVOKE ALL ON FUNCTION public.is_manager_or_owner_of(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_manager_or_owner_of(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_queue_member(_queue_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.queue_members
    WHERE queue_id = _queue_id AND user_id = auth.uid() AND is_active = true
  );
$$;
REVOKE ALL ON FUNCTION public.is_queue_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_queue_member(UUID) TO authenticated, service_role;

-- Policies
CREATE POLICY "queues_manager_all" ON public.attendance_queues
  FOR ALL TO authenticated
  USING (public.is_manager_or_owner_of(owner_id))
  WITH CHECK (public.is_manager_or_owner_of(owner_id));

CREATE POLICY "queues_member_select" ON public.attendance_queues
  FOR SELECT TO authenticated
  USING (public.is_queue_member(id));

CREATE POLICY "queue_members_manager_all" ON public.queue_members
  FOR ALL TO authenticated
  USING (public.is_manager_or_owner_of(owner_id))
  WITH CHECK (public.is_manager_or_owner_of(owner_id));

CREATE POLICY "queue_members_self_select" ON public.queue_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "assignments_manager_all" ON public.lead_assignments
  FOR ALL TO authenticated
  USING (public.is_manager_or_owner_of(owner_id))
  WITH CHECK (public.is_manager_or_owner_of(owner_id));

CREATE POLICY "assignments_agent_select" ON public.lead_assignments
  FOR SELECT TO authenticated
  USING (assigned_to = auth.uid() OR (queue_id IS NOT NULL AND public.is_queue_member(queue_id)));

CREATE POLICY "assignments_agent_update_own" ON public.lead_assignments
  FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

CREATE POLICY "assignment_events_manager_all" ON public.assignment_events
  FOR ALL TO authenticated
  USING (public.is_manager_or_owner_of(owner_id))
  WITH CHECK (public.is_manager_or_owner_of(owner_id));

CREATE POLICY "assignment_events_agent_select" ON public.assignment_events
  FOR SELECT TO authenticated
  USING (actor_id = auth.uid() OR from_user = auth.uid() OR to_user = auth.uid());

CREATE POLICY "assignment_events_agent_insert" ON public.assignment_events
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() OR to_user = auth.uid() OR from_user = auth.uid());

-- Triggers
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_touch_attendance_queues ON public.attendance_queues;
CREATE TRIGGER trg_touch_attendance_queues BEFORE UPDATE ON public.attendance_queues
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_lead_assignments ON public.lead_assignments;
CREATE TRIGGER trg_touch_lead_assignments BEFORE UPDATE ON public.lead_assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.log_assignment_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.assignment_events(assignment_id, customer_id, owner_id, actor_id, event_type, to_stage, to_user, details)
    VALUES (NEW.id, NEW.customer_id, NEW.owner_id, auth.uid(), 'created', NEW.stage, NEW.assigned_to,
      jsonb_build_object('queue_id', NEW.queue_id, 'origin', NEW.origin));
    RETURN NEW;
  END IF;
  IF (NEW.stage IS DISTINCT FROM OLD.stage) OR (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN
    INSERT INTO public.assignment_events(assignment_id, customer_id, owner_id, actor_id, event_type,
      from_stage, to_stage, from_user, to_user, details)
    VALUES (NEW.id, NEW.customer_id, NEW.owner_id, auth.uid(),
      CASE
        WHEN NEW.stage = 'closed' THEN 'closed'
        WHEN NEW.stage = 'snoozed' THEN 'snoozed'
        WHEN NEW.stage = 'returned' THEN 'returned'
        WHEN NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN 'reassigned'
        ELSE 'stage_change'
      END,
      OLD.stage, NEW.stage, OLD.assigned_to, NEW.assigned_to,
      jsonb_build_object('close_value', NEW.close_value, 'close_status_tag', NEW.close_status_tag));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_assignment_change ON public.lead_assignments;
CREATE TRIGGER trg_log_assignment_change
  AFTER INSERT OR UPDATE ON public.lead_assignments
  FOR EACH ROW EXECUTE FUNCTION public.log_assignment_change();

CREATE OR REPLACE FUNCTION public.sync_queue_member_load()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL AND NEW.stage IN ('waiting','active','snoozed') THEN
    UPDATE public.queue_members SET current_load = current_load + 1
      WHERE user_id = NEW.assigned_to AND queue_id = NEW.queue_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.stage NOT IN ('closed','returned')) AND (NEW.stage IN ('closed','returned')) AND OLD.assigned_to IS NOT NULL THEN
      UPDATE public.queue_members SET current_load = GREATEST(0, current_load - 1)
        WHERE user_id = OLD.assigned_to AND queue_id = OLD.queue_id;
    ELSIF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      IF OLD.assigned_to IS NOT NULL THEN
        UPDATE public.queue_members SET current_load = GREATEST(0, current_load - 1)
          WHERE user_id = OLD.assigned_to AND queue_id = OLD.queue_id;
      END IF;
      IF NEW.assigned_to IS NOT NULL AND NEW.stage NOT IN ('closed','returned') THEN
        UPDATE public.queue_members SET current_load = current_load + 1
          WHERE user_id = NEW.assigned_to AND queue_id = NEW.queue_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_queue_member_load ON public.lead_assignments;
CREATE TRIGGER trg_sync_queue_member_load
  AFTER INSERT OR UPDATE ON public.lead_assignments
  FOR EACH ROW EXECUTE FUNCTION public.sync_queue_member_load();

-- Roteamento
CREATE OR REPLACE FUNCTION public.pick_next_queue_member(_queue_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_strategy public.queue_routing_strategy;
  v_last UUID; v_next UUID;
BEGIN
  SELECT routing_strategy, last_assigned_member_id INTO v_strategy, v_last
    FROM public.attendance_queues WHERE id = _queue_id;
  IF NOT FOUND OR v_strategy = 'manual' THEN RETURN NULL; END IF;
  IF v_strategy = 'load_balance' THEN
    SELECT user_id INTO v_next FROM public.queue_members
      WHERE queue_id = _queue_id AND is_active = true
      ORDER BY current_load ASC, random() LIMIT 1;
  ELSE
    SELECT user_id INTO v_next FROM public.queue_members
      WHERE queue_id = _queue_id AND is_active = true
        AND (v_last IS NULL OR user_id > v_last)
      ORDER BY user_id ASC LIMIT 1;
    IF v_next IS NULL THEN
      SELECT user_id INTO v_next FROM public.queue_members
        WHERE queue_id = _queue_id AND is_active = true
        ORDER BY user_id ASC LIMIT 1;
    END IF;
  END IF;
  IF v_next IS NOT NULL THEN
    UPDATE public.attendance_queues SET last_assigned_member_id = v_next WHERE id = _queue_id;
  END IF;
  RETURN v_next;
END $$;
REVOKE ALL ON FUNCTION public.pick_next_queue_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pick_next_queue_member(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sla_overflow_scan()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INTEGER := 0;
BEGIN
  WITH stale AS (
    SELECT la.id, la.queue_id, aq.fallback_queue_id, aq.sla_overflow_seconds
    FROM public.lead_assignments la
    JOIN public.attendance_queues aq ON aq.id = la.queue_id
    WHERE la.stage = 'waiting'
      AND la.first_response_at IS NULL
      AND aq.sla_overflow_seconds > 0
      AND la.assigned_at < now() - (aq.sla_overflow_seconds || ' seconds')::interval
  )
  UPDATE public.lead_assignments la
    SET assigned_to = NULL,
        queue_id = COALESCE((SELECT fallback_queue_id FROM stale WHERE id = la.id), la.queue_id),
        stage = 'returned'
  FROM stale WHERE la.id = stale.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.sla_overflow_scan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sla_overflow_scan() TO service_role;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.assignment_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_queues;
ALTER TABLE public.lead_assignments REPLICA IDENTITY FULL;
ALTER TABLE public.assignment_events REPLICA IDENTITY FULL;
