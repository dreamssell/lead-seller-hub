CREATE TABLE public.wavoip_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  wavoip_call_id TEXT,
  phone_number TEXT,
  call_history_id UUID,
  http_status INT,
  error_message TEXT,
  payload JSONB,
  source_ip TEXT
);

CREATE INDEX idx_wavoip_webhook_events_received_at ON public.wavoip_webhook_events(received_at DESC);
CREATE INDEX idx_wavoip_webhook_events_call_id ON public.wavoip_webhook_events(wavoip_call_id);
CREATE INDEX idx_wavoip_webhook_events_status ON public.wavoip_webhook_events(status);

GRANT SELECT ON public.wavoip_webhook_events TO authenticated;
GRANT ALL ON public.wavoip_webhook_events TO service_role;

ALTER TABLE public.wavoip_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view wavoip webhook events"
  ON public.wavoip_webhook_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.wavoip_webhook_events;
ALTER TABLE public.wavoip_webhook_events REPLICA IDENTITY FULL;