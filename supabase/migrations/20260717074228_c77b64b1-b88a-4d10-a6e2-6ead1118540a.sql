
CREATE TABLE public.support_notification_test_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  sub_company_id UUID,
  template_id UUID REFERENCES public.support_notification_templates(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  audience TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  rendered_body TEXT NOT NULL,
  sample_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  recipients TEXT[] NOT NULL DEFAULT '{}',
  per_recipient JSONB NOT NULL DEFAULT '[]'::jsonb,
  ok_count INT NOT NULL DEFAULT 0,
  fail_count INT NOT NULL DEFAULT 0,
  triggered_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX support_notification_test_logs_template_idx
  ON public.support_notification_test_logs (template_id, created_at DESC);
CREATE INDEX support_notification_test_logs_owner_idx
  ON public.support_notification_test_logs (owner_id, created_at DESC);

GRANT SELECT, INSERT ON public.support_notification_test_logs TO authenticated;
GRANT ALL ON public.support_notification_test_logs TO service_role;

ALTER TABLE public.support_notification_test_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read their own test logs"
  ON public.support_notification_test_logs
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Owners insert their own test logs"
  ON public.support_notification_test_logs
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
