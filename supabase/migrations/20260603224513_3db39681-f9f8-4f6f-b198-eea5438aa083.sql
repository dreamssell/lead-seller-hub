CREATE TABLE IF NOT EXISTS public.wavoip_filter_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sub_company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    filters JSONB NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Prepare a real table for audit logs to support advanced features like replay tracking
CREATE TABLE IF NOT EXISTS public.wavoip_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sub_company_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT now(),
    status TEXT NOT NULL,
    type TEXT NOT NULL,
    message TEXT,
    version TEXT,
    request_id TEXT,
    payload_hash TEXT,
    is_replay BOOLEAN DEFAULT false,
    replay_source_id TEXT,
    replay_user_id UUID REFERENCES auth.users(id),
    replay_timestamp TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wavoip_filter_presets TO authenticated;
GRANT ALL ON public.wavoip_filter_presets TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wavoip_audit_logs TO authenticated;
GRANT ALL ON public.wavoip_audit_logs TO service_role;

ALTER TABLE public.wavoip_filter_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wavoip_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their company presets" ON public.wavoip_filter_presets
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Users can manage their company audit logs" ON public.wavoip_audit_logs
    FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_wavoip_filter_presets_updated_at BEFORE UPDATE ON public.wavoip_filter_presets
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();