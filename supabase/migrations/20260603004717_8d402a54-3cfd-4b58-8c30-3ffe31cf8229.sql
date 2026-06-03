-- Add remediation tracking to audit logs
ALTER TABLE public.uaz_audit_logs 
ADD COLUMN IF NOT EXISTS is_remediation BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS remediation_target_id UUID;

-- Update settings with remediation threshold
ALTER TABLE public.uaz_system_settings 
ADD COLUMN IF NOT EXISTS remediation_interval_minutes INTEGER DEFAULT 15;
