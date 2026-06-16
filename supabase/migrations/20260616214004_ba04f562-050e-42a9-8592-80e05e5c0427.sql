-- Notification preferences per user, sub-company and channel
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sub_company_id uuid NULL,
  channel text NULL,
  notify_new_lead boolean NOT NULL DEFAULT true,
  notify_stage_change boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, owner_id, sub_company_id, channel)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own notification prefs"
  ON public.notification_preferences
  FOR ALL
  USING (auth.uid() = user_id OR auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = user_id OR auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: should user receive notification of given type for (sub, channel)?
CREATE OR REPLACE FUNCTION public.user_wants_notification(
  p_user_id uuid,
  p_owner_id uuid,
  p_sub_company_id uuid,
  p_channel text,
  p_type text  -- 'new_lead' or 'stage_change'
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH best AS (
    SELECT notify_new_lead, notify_stage_change,
           (CASE WHEN sub_company_id IS NOT DISTINCT FROM p_sub_company_id THEN 2 ELSE 0 END
          + CASE WHEN channel IS NOT DISTINCT FROM p_channel THEN 1 ELSE 0 END
          + CASE WHEN sub_company_id IS NULL THEN 0 ELSE 0 END) AS score
    FROM public.notification_preferences
    WHERE user_id = p_user_id
      AND owner_id = p_owner_id
      AND (sub_company_id IS NULL OR sub_company_id = p_sub_company_id)
      AND (channel IS NULL OR channel = p_channel)
    ORDER BY score DESC
    LIMIT 1
  )
  SELECT COALESCE(
    (SELECT CASE WHEN p_type = 'new_lead' THEN notify_new_lead ELSE notify_stage_change END FROM best),
    true
  );
$$;

-- Update lead-change trigger to honor preferences
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
    FOR v_recipient IN
      SELECT DISTINCT u FROM (
        SELECT v_owner AS u
        UNION
        SELECT user_id FROM public.user_account_access
         WHERE owner_id = v_owner
           AND (sub_company_id = NEW.sub_company_id OR sub_company_id IS NULL)
      ) s WHERE u IS NOT NULL
    LOOP
      IF public.user_wants_notification(v_recipient, v_owner, NEW.sub_company_id, NEW.channel, 'new_lead') THEN
        INSERT INTO public.notifications(user_id, owner_id, sub_company_id, type, title, body, lead_id, channel, source)
        VALUES (v_recipient, v_owner, NEW.sub_company_id, 'lead_created', v_title, v_body, NEW.id, NEW.channel, NEW.source);
      END IF;
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
      IF public.user_wants_notification(v_recipient, v_owner, NEW.sub_company_id, NEW.channel, 'stage_change') THEN
        INSERT INTO public.notifications(user_id, owner_id, sub_company_id, type, title, body, lead_id, channel, source)
        VALUES (v_recipient, v_owner, NEW.sub_company_id, 'lead_stage_changed', v_title, NULLIF(v_body,''), NEW.id, NEW.channel, NEW.source);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
