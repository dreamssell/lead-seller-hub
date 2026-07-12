CREATE TABLE IF NOT EXISTS public.wavoip_line_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  sub_company_id uuid NULL,
  user_id uuid NOT NULL,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'in_call',
  since timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  call_history_id uuid NULL,
  wavoip_call_id text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wavoip_line_state TO authenticated;
GRANT ALL ON public.wavoip_line_state TO service_role;

ALTER TABLE public.wavoip_line_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wavoip_line_state_select_scoped"
ON public.wavoip_line_state
FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.user_account_access a
    WHERE a.user_id = auth.uid()
      AND a.owner_id = wavoip_line_state.owner_id
      AND (a.sub_company_id IS NULL OR a.sub_company_id = wavoip_line_state.sub_company_id)
  )
);

CREATE POLICY "wavoip_line_state_write_own_scoped"
ON public.wavoip_line_state
FOR ALL TO authenticated
USING (
  user_id = auth.uid()
  AND (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = wavoip_line_state.owner_id
        AND (a.sub_company_id IS NULL OR a.sub_company_id = wavoip_line_state.sub_company_id)
    )
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = wavoip_line_state.owner_id
        AND (a.sub_company_id IS NULL OR a.sub_company_id = wavoip_line_state.sub_company_id)
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_wavoip_line_state_owner ON public.wavoip_line_state(owner_id, status, last_heartbeat_at DESC);
CREATE INDEX IF NOT EXISTS idx_wavoip_line_state_user ON public.wavoip_line_state(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_wavoip_line_state_active_user ON public.wavoip_line_state(user_id) WHERE status = 'in_call';

DROP TRIGGER IF EXISTS trg_wavoip_line_state_updated_at ON public.wavoip_line_state;
CREATE TRIGGER trg_wavoip_line_state_updated_at
BEFORE UPDATE ON public.wavoip_line_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.omnichannel_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  sub_company_id uuid NULL,
  user_id uuid NULL,
  provider text NOT NULL,
  action text NOT NULL,
  status text NOT NULL,
  connection_id uuid NULL,
  customer_id uuid NULL,
  call_history_id uuid NULL,
  waha_session_id text NULL,
  message_id text NULL,
  call_id text NULL,
  wavoip_call_id text NULL,
  phone text NULL,
  error_message text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.omnichannel_audit_logs TO authenticated;
GRANT ALL ON public.omnichannel_audit_logs TO service_role;

ALTER TABLE public.omnichannel_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "omnichannel_audit_select_scoped"
ON public.omnichannel_audit_logs
FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.user_account_access a
    WHERE a.user_id = auth.uid()
      AND a.owner_id = omnichannel_audit_logs.owner_id
      AND (a.sub_company_id IS NULL OR a.sub_company_id = omnichannel_audit_logs.sub_company_id)
  )
);

CREATE POLICY "omnichannel_audit_insert_scoped"
ON public.omnichannel_audit_logs
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = omnichannel_audit_logs.owner_id
        AND (a.sub_company_id IS NULL OR a.sub_company_id = omnichannel_audit_logs.sub_company_id)
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_omni_audit_owner_created ON public.omnichannel_audit_logs(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_omni_audit_waha_message ON public.omnichannel_audit_logs(waha_session_id, message_id);
CREATE INDEX IF NOT EXISTS idx_omni_audit_wavoip_call ON public.omnichannel_audit_logs(wavoip_call_id, call_id);
CREATE INDEX IF NOT EXISTS idx_omni_audit_call_history ON public.omnichannel_audit_logs(call_history_id);

CREATE OR REPLACE FUNCTION public.reconcile_wavoip_call_history(p_wavoip_call_id text DEFAULT NULL, p_call_id text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row record;
  v_events jsonb;
  v_answered timestamptz;
  v_ended timestamptz;
  v_status text;
  v_duration integer;
  v_updated integer := 0;
BEGIN
  FOR v_row IN
    SELECT ch.id,
           ch.metadata,
           ch.answered_at,
           ch.ended_at,
           COALESCE(ch.metadata->>'wavoip_call_id', p_wavoip_call_id) AS wavoip_id,
           COALESCE(ch.metadata->>'call_id', p_call_id) AS call_id
    FROM public.call_history ch
    WHERE ch.channel = 'wavoip'
      AND (
        (p_wavoip_call_id IS NOT NULL AND ch.metadata->>'wavoip_call_id' = p_wavoip_call_id)
        OR (p_call_id IS NOT NULL AND ch.metadata->>'call_id' = p_call_id)
      )
  LOOP
    SELECT jsonb_agg(jsonb_build_object(
             'event', e.event,
             'status', e.status,
             'received_at', e.received_at,
             'payload', e.payload
           ) ORDER BY e.received_at ASC),
           min(CASE WHEN lower(coalesce(e.event,'')) IN ('answered','answer','in-call','in_call','active','accept','accepted')
                    THEN e.received_at END),
           max(CASE WHEN lower(coalesce(e.event,'')) IN ('ended','end','hangup','terminated','completed','finished','missed','no-answer','noanswer','failed','error','canceled','cancelled','busy','rejected')
                    THEN e.received_at END),
           (array_agg(lower(coalesce(e.event,'')) ORDER BY e.received_at DESC))[1]
      INTO v_events, v_answered, v_ended, v_status
    FROM public.wavoip_webhook_events e
    WHERE (v_row.wavoip_id IS NOT NULL AND e.wavoip_call_id = v_row.wavoip_id)
       OR (v_row.call_id IS NOT NULL AND e.call_id = v_row.call_id);

    IF v_answered IS NULL THEN
      v_answered := v_row.answered_at;
    END IF;
    IF v_ended IS NULL THEN
      v_ended := v_row.ended_at;
    END IF;

    v_duration := CASE
      WHEN v_answered IS NOT NULL AND v_ended IS NOT NULL AND v_ended >= v_answered
      THEN GREATEST(0, round(extract(epoch FROM (v_ended - v_answered)))::integer)
      ELSE NULL
    END;

    UPDATE public.call_history
       SET answered_at = COALESCE(call_history.answered_at, v_answered),
           ended_at = COALESCE(call_history.ended_at, v_ended),
           duration_seconds = COALESCE(v_duration, call_history.duration_seconds),
           status = CASE
             WHEN v_ended IS NOT NULL AND v_answered IS NOT NULL THEN 'ended'
             WHEN v_ended IS NOT NULL AND call_history.status IN ('initiated','ringing','answered') THEN 'missed'
             WHEN v_answered IS NOT NULL AND call_history.status NOT IN ('ended','missed','failed','rejected') THEN 'answered'
             ELSE call_history.status
           END,
           metadata = COALESCE(call_history.metadata, '{}'::jsonb)
             || jsonb_build_object(
                  'reconciled_at', now(),
                  'reconciled_duration_seconds', v_duration,
                  'reconciled_event_timeline', COALESCE(v_events, '[]'::jsonb),
                  'duration_source', CASE WHEN v_duration IS NOT NULL THEN 'reconciled_answered_to_ended' ELSE COALESCE(call_history.metadata->>'duration_source', NULL) END
                )
     WHERE id = v_row.id;
    v_updated := v_updated + 1;
  END LOOP;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_wavoip_call_history(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_wavoip_call_history(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_wavoip_call_history(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_reconcile_wavoip_webhook_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.reconcile_wavoip_call_history(NEW.wavoip_call_id, NEW.call_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reconcile_wavoip_webhook_event ON public.wavoip_webhook_events;
CREATE TRIGGER trg_reconcile_wavoip_webhook_event
AFTER INSERT ON public.wavoip_webhook_events
FOR EACH ROW
WHEN (NEW.wavoip_call_id IS NOT NULL OR NEW.call_id IS NOT NULL)
EXECUTE FUNCTION public.tg_reconcile_wavoip_webhook_event();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='wavoip_line_state'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.wavoip_line_state';
  END IF;
END $$;

ALTER TABLE public.wavoip_line_state REPLICA IDENTITY FULL;