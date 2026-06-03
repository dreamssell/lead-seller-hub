-- Add fine-grained control columns to system settings
ALTER TABLE public.uaz_system_settings 
ADD COLUMN IF NOT EXISTS backoff_multiplier FLOAT DEFAULT 2.0,
ADD COLUMN IF NOT EXISTS idempotency_window_minutes INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS incident_threshold_retries INTEGER DEFAULT 5;
