-- Create UAZ audit logs table
CREATE TABLE public.uaz_audit_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type TEXT NOT NULL, -- 'auth', 'webhook', 'send_message', 'status_check'
    status TEXT NOT NULL, -- 'success', 'error', 'warning'
    message TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    response JSONB DEFAULT '{}'::jsonb,
    latency_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indices for filtering
CREATE INDEX idx_uaz_logs_event_type ON public.uaz_audit_logs(event_type);
CREATE INDEX idx_uaz_logs_status ON public.uaz_audit_logs(status);
CREATE INDEX idx_uaz_logs_created_at ON public.uaz_audit_logs(created_at);

-- Grants
GRANT SELECT ON public.uaz_audit_logs TO authenticated;
GRANT ALL ON public.uaz_audit_logs TO service_role;

-- RLS
ALTER TABLE public.uaz_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view audit logs
CREATE POLICY "Admins can view UAZ audit logs"
ON public.uaz_audit_logs FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));
