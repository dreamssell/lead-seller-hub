CREATE TABLE IF NOT EXISTS public.wavoip_sync_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sub_company_id TEXT NOT NULL UNIQUE,
    dedup_window INTEGER NOT NULL DEFAULT 5,
    recent_event_keys TEXT[] DEFAULT '{}',
    last_ws_status TEXT DEFAULT 'connected',
    last_ws_update TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wavoip_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sub_company_id TEXT NOT NULL UNIQUE,
    alert_channels JSONB DEFAULT '{"visual": true, "email": false, "webhook": false}'::jsonb,
    ws_backoff JSONB DEFAULT '{"min": 1000, "max": 30000, "maxAttempts": 10}'::jsonb,
    alert_threshold_seconds INTEGER DEFAULT 60,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wavoip_sync_state TO authenticated;
GRANT ALL ON public.wavoip_sync_state TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wavoip_settings TO authenticated;
GRANT ALL ON public.wavoip_settings TO service_role;

ALTER TABLE public.wavoip_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wavoip_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their company sync state" ON public.wavoip_sync_state
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Users can manage their company settings" ON public.wavoip_settings
    FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_wavoip_sync_state_updated_at BEFORE UPDATE ON public.wavoip_sync_state
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wavoip_settings_updated_at BEFORE UPDATE ON public.wavoip_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();