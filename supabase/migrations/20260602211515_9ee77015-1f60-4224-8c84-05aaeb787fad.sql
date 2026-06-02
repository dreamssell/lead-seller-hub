-- Add direction column to webhook_logs
ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound';

-- Update existing logs to be outbound (most likely)
UPDATE public.webhook_logs SET direction = 'outbound' WHERE direction IS NULL;

-- Ensure RLS is updated if needed (usually public access is fine for service_role)
-- No changes needed to RLS for just adding a column if policies are broad.
