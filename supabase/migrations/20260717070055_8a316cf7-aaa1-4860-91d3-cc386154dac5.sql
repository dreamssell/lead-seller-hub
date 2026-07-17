
-- ============ TEMPLATES ============
CREATE TABLE IF NOT EXISTS public.support_notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  sub_company_id UUID NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created','assigned','status_changed','resolved','daily_reminder_customer','daily_reminder_owner')),
  audience TEXT NOT NULL CHECK (audience IN ('customer','owner','assignee')),
  channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp')),
  body_template TEXT NOT NULL,
  extra_recipients TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, sub_company_id, event_type, audience)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_notification_templates TO authenticated;
GRANT ALL ON public.support_notification_templates TO service_role;

ALTER TABLE public.support_notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage templates"
ON public.support_notification_templates FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ LOGS ============
CREATE TABLE IF NOT EXISTS public.support_notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  audience TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  recipient TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','failed','skipped')),
  provider_msg_id TEXT NULL,
  error TEXT NULL,
  template_id UUID NULL REFERENCES public.support_notification_templates(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_notif_logs_ticket ON public.support_notification_logs(ticket_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_notification_logs TO authenticated;
GRANT ALL ON public.support_notification_logs TO service_role;

ALTER TABLE public.support_notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins view all notification logs"
ON public.support_notification_logs FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ticket participants view own logs"
ON public.support_notification_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = support_notification_logs.ticket_id
      AND (t.user_id = auth.uid() OR t.assigned_to = auth.uid())
  )
);

CREATE POLICY "service inserts logs"
ON public.support_notification_logs FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_touch_snt ON public.support_notification_templates;
CREATE TRIGGER trg_touch_snt BEFORE UPDATE ON public.support_notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_snl ON public.support_notification_logs;
CREATE TRIGGER trg_touch_snl BEFORE UPDATE ON public.support_notification_logs
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
