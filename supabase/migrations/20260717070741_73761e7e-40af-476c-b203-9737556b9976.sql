
-- 1) Versioning for templates
ALTER TABLE public.support_notification_templates
  ADD COLUMN IF NOT EXISTS current_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_tested_at timestamptz;

CREATE TABLE IF NOT EXISTS public.support_notification_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.support_notification_templates(id) ON DELETE CASCADE,
  version integer NOT NULL,
  body_template text NOT NULL,
  extra_recipients text[] NOT NULL DEFAULT '{}',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_id, version)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_notification_template_versions TO authenticated;
GRANT ALL ON public.support_notification_template_versions TO service_role;

ALTER TABLE public.support_notification_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage own template versions"
  ON public.support_notification_template_versions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.support_notification_templates t
    WHERE t.id = template_id AND t.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.support_notification_templates t
    WHERE t.id = template_id AND t.owner_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_snt_versions_template ON public.support_notification_template_versions(template_id, version DESC);

-- 2) Cancel future notifications for a ticket
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS notifications_cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS notifications_cancelled_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS notifications_cancelled_reason text;

-- 3) Retry queue with backoff on the logs table
ALTER TABLE public.support_notification_logs
  ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz;

-- Extend status vocabulary (retrying, cancelled) — column is text so no enum change needed.
CREATE INDEX IF NOT EXISTS idx_snl_retry_queue
  ON public.support_notification_logs(next_retry_at)
  WHERE status = 'retrying';

CREATE INDEX IF NOT EXISTS idx_snl_ticket ON public.support_notification_logs(ticket_id, created_at DESC);
