
-- 1. Permission column on user_account_access
ALTER TABLE public.user_account_access
  ADD COLUMN IF NOT EXISTS can_move_leads boolean NOT NULL DEFAULT true;

-- 2. Helper function: can current user move leads for a given owner+sub_company scope
CREATE OR REPLACE FUNCTION public.can_user_move_leads(p_owner_id uuid, p_sub_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() = p_owner_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = p_owner_id
        AND (a.sub_company_id = p_sub_company_id OR a.sub_company_id IS NULL)
        AND (a.is_account_admin OR a.can_move_leads)
    );
$$;

-- 3. Lead events history table
CREATE TABLE IF NOT EXISTS public.lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  sub_company_id uuid,
  type text NOT NULL, -- 'created' | 'stage_changed' | 'assigned' | 'note' | 'status_changed'
  from_stage_id uuid,
  to_stage_id uuid,
  from_stage_name text,
  to_stage_name text,
  channel text,
  source text,
  actor_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_events_lead ON public.lead_events(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_events_owner ON public.lead_events(owner_id, created_at DESC);

GRANT SELECT, INSERT ON public.lead_events TO authenticated;
GRANT ALL ON public.lead_events TO service_role;

ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_events_select" ON public.lead_events FOR SELECT TO authenticated
USING (
  auth.uid() = owner_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.user_account_access a
    WHERE a.user_id = auth.uid() AND a.owner_id = lead_events.owner_id
      AND (a.sub_company_id = lead_events.sub_company_id OR a.sub_company_id IS NULL)
  )
);

CREATE POLICY "lead_events_insert" ON public.lead_events FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- 4. Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sub_company_id uuid,
  type text NOT NULL, -- 'lead_created' | 'lead_stage_changed'
  title text NOT NULL,
  body text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  channel text,
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id) WHERE read_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notifications_delete_own" ON public.notifications FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "notifications_insert_owner_or_admin" ON public.notifications FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- 5. Trigger: record lead events + fan-out notifications
CREATE OR REPLACE FUNCTION public.handle_lead_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_from_name text;
  v_to_name text;
  v_recipient uuid;
  v_title text;
  v_body text;
BEGIN
  v_owner := COALESCE(NEW.owner_id, NEW.created_by);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.lead_events(lead_id, owner_id, sub_company_id, type, to_stage_id, channel, source, actor_id, metadata)
    VALUES (NEW.id, v_owner, NEW.sub_company_id, 'created', NEW.stage_id, NEW.channel, NEW.source, NEW.created_by,
            jsonb_build_object('name', NEW.name, 'pipeline_id', NEW.pipeline_id));

    v_title := 'Novo lead: ' || NEW.name;
    v_body := COALESCE('Canal: ' || NEW.channel, 'Sem canal') ||
              COALESCE(' · Origem: ' || NEW.source, '');
    -- Notify owner + sub-company members
    FOR v_recipient IN
      SELECT DISTINCT u FROM (
        SELECT v_owner AS u
        UNION
        SELECT user_id FROM public.user_account_access
         WHERE owner_id = v_owner
           AND (sub_company_id = NEW.sub_company_id OR sub_company_id IS NULL)
      ) s WHERE u IS NOT NULL
    LOOP
      INSERT INTO public.notifications(user_id, owner_id, sub_company_id, type, title, body, lead_id, channel, source)
      VALUES (v_recipient, v_owner, NEW.sub_company_id, 'lead_created', v_title, v_body, NEW.id, NEW.channel, NEW.source);
    END LOOP;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(NEW.stage_id::text,'') <> COALESCE(OLD.stage_id::text,'') THEN
    SELECT name INTO v_from_name FROM public.pipeline_stages WHERE id = OLD.stage_id;
    SELECT name INTO v_to_name   FROM public.pipeline_stages WHERE id = NEW.stage_id;

    INSERT INTO public.lead_events(lead_id, owner_id, sub_company_id, type, from_stage_id, to_stage_id, from_stage_name, to_stage_name, channel, source, actor_id)
    VALUES (NEW.id, v_owner, NEW.sub_company_id, 'stage_changed', OLD.stage_id, NEW.stage_id, v_from_name, v_to_name, NEW.channel, NEW.source, auth.uid());

    v_title := NEW.name || ': ' || COALESCE(v_from_name,'—') || ' → ' || COALESCE(v_to_name,'—');
    v_body := COALESCE('Canal: ' || NEW.channel, '') || COALESCE(' · Origem: ' || NEW.source, '');
    FOR v_recipient IN
      SELECT DISTINCT u FROM (
        SELECT v_owner AS u
        UNION
        SELECT user_id FROM public.user_account_access
         WHERE owner_id = v_owner
           AND (sub_company_id = NEW.sub_company_id OR sub_company_id IS NULL)
      ) s WHERE u IS NOT NULL
    LOOP
      INSERT INTO public.notifications(user_id, owner_id, sub_company_id, type, title, body, lead_id, channel, source)
      VALUES (v_recipient, v_owner, NEW.sub_company_id, 'lead_stage_changed', v_title, NULLIF(v_body,''), NEW.id, NEW.channel, NEW.source);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_change ON public.leads;
CREATE TRIGGER trg_lead_change
AFTER INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.handle_lead_change();

-- 6. Extend leads_update policy to allow team members with can_move_leads
DROP POLICY IF EXISTS "leads_update" ON public.leads;
CREATE POLICY "leads_update" ON public.leads FOR UPDATE TO authenticated
USING (
  auth.uid() = created_by
  OR auth.uid() = owner_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.can_user_move_leads(COALESCE(owner_id, created_by), sub_company_id)
);
