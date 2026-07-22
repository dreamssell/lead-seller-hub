
CREATE TABLE public.support_ticket_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  from_status support_ticket_status,
  to_status support_ticket_status NOT NULL,
  changed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX support_ticket_status_history_ticket_idx ON public.support_ticket_status_history(ticket_id, created_at DESC);

GRANT SELECT, INSERT ON public.support_ticket_status_history TO authenticated;
GRANT ALL ON public.support_ticket_status_history TO service_role;
ALTER TABLE public.support_ticket_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "master reads status history" ON public.support_ticket_status_history
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "master writes status history" ON public.support_ticket_status_history
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Trigger: record status changes and assignment changes automatically
CREATE OR REPLACE FUNCTION public.log_support_ticket_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.support_ticket_status_history(ticket_id, from_status, to_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, actor);
  END IF;
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.support_ticket_assignments(ticket_id, from_user, to_user, changed_by)
    VALUES (NEW.id, OLD.assigned_to, NEW.assigned_to, COALESCE(actor, NEW.assigned_to, OLD.assigned_to));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_support_ticket_changes ON public.support_tickets;
CREATE TRIGGER trg_log_support_ticket_changes
  AFTER UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.log_support_ticket_changes();

-- Enable realtime for both history tables and assignments
ALTER TABLE public.support_ticket_status_history REPLICA IDENTITY FULL;
ALTER TABLE public.support_ticket_assignments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_status_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_assignments;
