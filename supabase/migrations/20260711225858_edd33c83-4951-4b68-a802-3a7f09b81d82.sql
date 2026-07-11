ALTER TABLE public.wavoip_webhook_events
  ADD COLUMN IF NOT EXISTS call_id TEXT;

CREATE INDEX IF NOT EXISTS idx_wavoip_webhook_events_raw_call_id
  ON public.wavoip_webhook_events(call_id);

CREATE INDEX IF NOT EXISTS idx_wavoip_webhook_events_audit_pair
  ON public.wavoip_webhook_events(owner_id, sub_company_id, wavoip_call_id, call_id, received_at DESC);