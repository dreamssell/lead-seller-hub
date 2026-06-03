-- Extend audit logs for better debugging
ALTER TABLE public.uaz_audit_logs 
ADD COLUMN IF NOT EXISTS final_cause TEXT,
ADD COLUMN IF NOT EXISTS full_trace JSONB;

-- Create incidents table for exhausted retries
CREATE TABLE IF NOT EXISTS public.uaz_incidents (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    original_log_id UUID REFERENCES public.uaz_audit_logs(id),
    customer_id UUID REFERENCES public.customers(id),
    status TEXT NOT NULL DEFAULT 'open', -- 'open', 'resolved', 'ignored'
    severity TEXT NOT NULL DEFAULT 'high',
    cause TEXT,
    trace JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- Grants
GRANT SELECT, UPDATE ON public.uaz_incidents TO authenticated;
GRANT ALL ON public.uaz_incidents TO service_role;

-- RLS
ALTER TABLE public.uaz_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage UAZ incidents" 
ON public.uaz_incidents FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));
