
-- Fase 2: Colaboração Interna + SLA

-- 1. Novas colunas em customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS assigned_to uuid,
  ADD COLUMN IF NOT EXISTS queue_id uuid,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS ticket_status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS sla_first_response_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_next_response_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_resolution_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_handoff jsonb NOT NULL DEFAULT '{"mode":"human"}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_customers_assigned_to ON public.customers(assigned_to);
CREATE INDEX IF NOT EXISTS idx_customers_queue_id ON public.customers(queue_id);
CREATE INDEX IF NOT EXISTS idx_customers_priority ON public.customers(priority);
CREATE INDEX IF NOT EXISTS idx_customers_ticket_status ON public.customers(ticket_status);

-- 2. sla_policies
CREATE TABLE IF NOT EXISTS public.sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  first_response_minutes int NOT NULL DEFAULT 15,
  next_response_minutes int NOT NULL DEFAULT 30,
  resolution_minutes int NOT NULL DEFAULT 1440,
  business_hours_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sla_policies TO authenticated;
GRANT ALL ON public.sla_policies TO service_role;
ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages sla policies" ON public.sla_policies
  FOR ALL USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));

-- 3. chat_queues
CREATE TABLE IF NOT EXISTS public.chat_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3B82F6',
  sla_policy_id uuid REFERENCES public.sla_policies(id) ON DELETE SET NULL,
  business_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_queues TO authenticated;
GRANT ALL ON public.chat_queues TO service_role;
ALTER TABLE public.chat_queues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages queues" ON public.chat_queues
  FOR ALL USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "team reads queues" ON public.chat_queues
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.user_account_access a
    WHERE a.user_id = auth.uid() AND a.owner_id = chat_queues.owner_id
  ));

-- 4. chat_tags
CREATE TABLE IF NOT EXISTS public.chat_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#64748B',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_tags TO authenticated;
GRANT ALL ON public.chat_tags TO service_role;
ALTER TABLE public.chat_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages tags" ON public.chat_tags
  FOR ALL USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "team reads tags" ON public.chat_tags
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.user_account_access a
    WHERE a.user_id = auth.uid() AND a.owner_id = chat_tags.owner_id
  ));

-- 5. conversation_assignments
CREATE TABLE IF NOT EXISTS public.conversation_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  from_user_id uuid,
  to_user_id uuid,
  from_queue_id uuid,
  to_queue_id uuid,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conv_assign_customer ON public.conversation_assignments(customer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_assignments TO authenticated;
GRANT ALL ON public.conversation_assignments TO service_role;
ALTER TABLE public.conversation_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team reads assignments" ON public.conversation_assignments
  FOR SELECT USING (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(),'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_account_access a WHERE a.user_id = auth.uid() AND a.owner_id = conversation_assignments.owner_id)
  );
CREATE POLICY "team writes assignments" ON public.conversation_assignments
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(),'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_account_access a WHERE a.user_id = auth.uid() AND a.owner_id = conversation_assignments.owner_id)
  );

-- 6. note_mentions
CREATE TABLE IF NOT EXISTS public.note_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.customer_notes(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  mentioned_user_id uuid NOT NULL,
  created_by uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_note_mentions_user ON public.note_mentions(mentioned_user_id, read_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.note_mentions TO authenticated;
GRANT ALL ON public.note_mentions TO service_role;
ALTER TABLE public.note_mentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user reads own mentions" ON public.note_mentions
  FOR SELECT USING (mentioned_user_id = auth.uid() OR owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "user updates own mentions" ON public.note_mentions
  FOR UPDATE USING (mentioned_user_id = auth.uid());
CREATE POLICY "team inserts mentions" ON public.note_mentions
  FOR INSERT WITH CHECK (true);

-- 7. supervisor_whispers
CREATE TABLE IF NOT EXISTS public.supervisor_whispers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  from_supervisor_id uuid NOT NULL,
  to_agent_id uuid NOT NULL,
  content text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_whispers_customer ON public.supervisor_whispers(customer_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supervisor_whispers TO authenticated;
GRANT ALL ON public.supervisor_whispers TO service_role;
ALTER TABLE public.supervisor_whispers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent/supervisor read whispers" ON public.supervisor_whispers
  FOR SELECT USING (
    from_supervisor_id = auth.uid()
    OR to_agent_id = auth.uid()
    OR owner_id = auth.uid()
    OR public.has_role(auth.uid(),'admin'::app_role)
  );
CREATE POLICY "supervisor writes whispers" ON public.supervisor_whispers
  FOR INSERT WITH CHECK (from_supervisor_id = auth.uid());
CREATE POLICY "agent marks whispers read" ON public.supervisor_whispers
  FOR UPDATE USING (to_agent_id = auth.uid());

-- 8. routing_rules
CREATE TABLE IF NOT EXISTS public.routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  priority int NOT NULL DEFAULT 100,
  channel text,
  skill text,
  schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_load int,
  target_queue_id uuid,
  target_user_id uuid,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routing_rules TO authenticated;
GRANT ALL ON public.routing_rules TO service_role;
ALTER TABLE public.routing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages routing rules" ON public.routing_rules
  FOR ALL USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));

-- 9. Triggers
CREATE OR REPLACE FUNCTION public.log_customer_assignment_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
       COALESCE(OLD.assigned_to::text,'') <> COALESCE(NEW.assigned_to::text,'')
    OR COALESCE(OLD.queue_id::text,'')   <> COALESCE(NEW.queue_id::text,'')
  ) THEN
    INSERT INTO public.conversation_assignments(
      customer_id, owner_id, from_user_id, to_user_id, from_queue_id, to_queue_id, created_by
    ) VALUES (
      NEW.id, NEW.owner_id, OLD.assigned_to, NEW.assigned_to, OLD.queue_id, NEW.queue_id, auth.uid()
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_customers_assignment ON public.customers;
CREATE TRIGGER trg_customers_assignment
AFTER UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.log_customer_assignment_change();

-- 10. SLA on first response
CREATE OR REPLACE FUNCTION public.update_sla_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.direction = 'out' THEN
    UPDATE public.customers
       SET first_response_at = COALESCE(first_response_at, NEW.created_at),
           sla_first_response_due_at = CASE WHEN first_response_at IS NULL THEN NULL ELSE sla_first_response_due_at END,
           sla_next_response_due_at = NULL
     WHERE id = NEW.customer_id;
  ELSIF NEW.direction = 'in' THEN
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

DROP TRIGGER IF EXISTS trg_chat_messages_sla ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_sla
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.update_sla_on_message();

-- 11. Mentions parsing
CREATE OR REPLACE FUNCTION public.parse_note_mentions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid;
  v_handle text;
  v_user uuid;
BEGIN
  SELECT owner_id INTO v_owner FROM public.customers WHERE id = NEW.customer_id;
  IF v_owner IS NULL THEN RETURN NEW; END IF;

  FOR v_handle IN
    SELECT DISTINCT (regexp_matches(NEW.content, '@([A-Za-z0-9_.\-]+)', 'g'))[1]
  LOOP
    SELECT p.user_id INTO v_user
      FROM public.profiles p
     WHERE lower(p.email) = lower(v_handle)
        OR lower(p.display_name) = lower(v_handle)
        OR lower(split_part(p.email,'@',1)) = lower(v_handle)
     LIMIT 1;
    IF v_user IS NOT NULL THEN
      INSERT INTO public.note_mentions(note_id, customer_id, owner_id, mentioned_user_id, created_by)
      VALUES (NEW.id, NEW.customer_id, v_owner, v_user, NEW.author_id);

      INSERT INTO public.notifications(user_id, owner_id, type, title, body)
      VALUES (v_user, v_owner, 'note_mention',
              'Você foi mencionado em uma nota interna',
              left(NEW.content, 240));
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_customer_notes_mentions ON public.customer_notes;
CREATE TRIGGER trg_customer_notes_mentions
AFTER INSERT ON public.customer_notes
FOR EACH ROW EXECUTE FUNCTION public.parse_note_mentions();

-- 12. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.supervisor_whispers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.note_mentions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_assignments;
