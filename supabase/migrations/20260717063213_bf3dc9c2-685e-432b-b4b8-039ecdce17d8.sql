
-- 1) Campo de anotações internas (visível apenas ao master)
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS first_response_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz;

-- 2) Preenchimento de SLA por prioridade (horas)
CREATE OR REPLACE FUNCTION public.support_set_sla()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE fr int; res int;
BEGIN
  fr := CASE NEW.priority
    WHEN 'critica' THEN 1 WHEN 'alta' THEN 4 WHEN 'media' THEN 12 ELSE 24 END;
  res := CASE NEW.priority
    WHEN 'critica' THEN 4 WHEN 'alta' THEN 24 WHEN 'media' THEN 72 ELSE 168 END;
  IF NEW.first_response_due_at IS NULL THEN
    NEW.first_response_due_at := NEW.created_at + make_interval(hours => fr);
  END IF;
  IF NEW.resolution_due_at IS NULL THEN
    NEW.resolution_due_at := NEW.created_at + make_interval(hours => res);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_support_set_sla ON public.support_tickets;
CREATE TRIGGER trg_support_set_sla
BEFORE INSERT ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.support_set_sla();

-- Backfill de tickets existentes
UPDATE public.support_tickets SET
  first_response_due_at = COALESCE(first_response_due_at, created_at + interval '12 hours'),
  resolution_due_at = COALESCE(resolution_due_at, created_at + interval '72 hours')
WHERE first_response_due_at IS NULL OR resolution_due_at IS NULL;

-- 3) Histórico de atribuições
CREATE TABLE IF NOT EXISTS public.support_ticket_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  from_user uuid,
  to_user uuid,
  changed_by uuid NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.support_ticket_assignments TO authenticated;
GRANT ALL ON public.support_ticket_assignments TO service_role;
ALTER TABLE public.support_ticket_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "master reads assignments" ON public.support_ticket_assignments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "master writes assignments" ON public.support_ticket_assignments
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND changed_by = auth.uid());

-- 4) Trigger para gravar histórico e disparar notificação de "assigned"/"resolved"
CREATE OR REPLACE FUNCTION public.support_track_ticket_changes()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.support_ticket_assignments (ticket_id, from_user, to_user, changed_by)
    VALUES (NEW.id, OLD.assigned_to, NEW.assigned_to, COALESCE(auth.uid(), NEW.assigned_to));
    PERFORM net.http_post(
      url := 'https://gcjaeoxjhcfeispehmga.supabase.co/functions/v1/support-notify',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := jsonb_build_object('ticket_id', NEW.id, 'event', 'assigned')
    );
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'resolvido' THEN
    PERFORM net.http_post(
      url := 'https://gcjaeoxjhcfeispehmga.supabase.co/functions/v1/support-notify',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := jsonb_build_object('ticket_id', NEW.id, 'event', 'resolved')
    );
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_support_track_changes ON public.support_tickets;
CREATE TRIGGER trg_support_track_changes
AFTER UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.support_track_ticket_changes();

-- 5) Cron diário para lembretes (10h UTC ≈ 07h BRT)
SELECT cron.unschedule('support-daily-reminders') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='support-daily-reminders');
SELECT cron.schedule(
  'support-daily-reminders',
  '0 10 * * *',
  $$ SELECT net.http_post(
       url := 'https://gcjaeoxjhcfeispehmga.supabase.co/functions/v1/support-notify',
       headers := jsonb_build_object('Content-Type','application/json'),
       body := jsonb_build_object('event','daily_reminders')
     ); $$
);
