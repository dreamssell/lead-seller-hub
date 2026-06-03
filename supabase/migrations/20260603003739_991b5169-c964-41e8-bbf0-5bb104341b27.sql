-- Add degradation info to connections
ALTER TABLE public.whatsapp_connections 
ADD COLUMN IF NOT EXISTS degradation_status TEXT DEFAULT 'healthy',
ADD COLUMN IF NOT EXISTS last_degradation_at TIMESTAMP WITH TIME ZONE;

-- Global settings for UAZ integration
CREATE TABLE IF NOT EXISTS public.uaz_system_settings (
    id TEXT PRIMARY KEY DEFAULT 'global',
    alert_threshold_latency INTEGER DEFAULT 1000,
    alert_threshold_failure_rate FLOAT DEFAULT 0.2,
    backoff_base_delay INTEGER DEFAULT 500,
    backoff_max_retries INTEGER DEFAULT 3,
    request_timeout_ms INTEGER DEFAULT 30000,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Initial settings
INSERT INTO public.uaz_system_settings (id) 
VALUES ('global')
ON CONFLICT (id) DO NOTHING;

-- Grants
GRANT SELECT, UPDATE ON public.uaz_system_settings TO authenticated;
GRANT ALL ON public.uaz_system_settings TO service_role;

-- RLS
ALTER TABLE public.uaz_system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage UAZ settings" 
ON public.uaz_system_settings FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));
