ALTER TABLE public.webhooks ADD COLUMN type TEXT DEFAULT 'outbound';
-- Update existing webhooks to be 'outbound' by default
UPDATE public.webhooks SET type = 'outbound' WHERE type IS NULL;