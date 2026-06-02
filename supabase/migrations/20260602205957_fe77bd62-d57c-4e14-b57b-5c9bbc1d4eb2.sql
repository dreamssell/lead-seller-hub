CREATE TABLE public.webhook_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    webhook_id UUID REFERENCES public.webhooks(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    url TEXT NOT NULL,
    method TEXT NOT NULL,
    headers JSONB,
    payload JSONB,
    response_status INTEGER,
    response_body TEXT,
    latency_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.webhook_logs TO authenticated;
GRANT ALL ON public.webhook_logs TO service_role;

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view logs for their webhooks"
ON public.webhook_logs
FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.webhooks 
    WHERE public.webhooks.id = public.webhook_logs.webhook_id 
    AND (public.webhooks.created_by = auth.uid())
));
