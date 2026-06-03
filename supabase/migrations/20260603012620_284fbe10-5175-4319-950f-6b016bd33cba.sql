-- Add persistence and policy columns to settings
ALTER TABLE public.uaz_system_settings 
ADD COLUMN IF NOT EXISTS alert_persistence_minutes INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS remediation_policy_per_tenant JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS remediation_policy_per_channel JSONB DEFAULT '{"whatsapp": "retry_queue", "voip": "restart_worker", "video": "alert_only"}'::jsonb;

-- Create alerts history table for audit
CREATE TABLE IF NOT EXISTS public.uaz_alerts_history (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES public.sub_companies(id),
    channel_type TEXT NOT NULL,
    alert_type TEXT NOT NULL, -- 'queue_threshold', 'latency', 'failure_rate'
    severity TEXT NOT NULL DEFAULT 'warning',
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    resolved_at TIMESTAMP WITH TIME ZONE,
    remediated_at TIMESTAMP WITH TIME ZONE,
    remediation_result TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Permissions
GRANT SELECT, INSERT, UPDATE ON public.uaz_alerts_history TO authenticated;
GRANT ALL ON public.uaz_alerts_history TO service_role;

-- RLS
ALTER TABLE public.uaz_alerts_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all alerts" ON public.uaz_alerts_history
    FOR SELECT USING (auth.role() = 'authenticated');

-- Comment for clarity
COMMENT ON TABLE public.uaz_alerts_history IS 'Histórico de alertas disparados pela integração UAZ para auditoria.';