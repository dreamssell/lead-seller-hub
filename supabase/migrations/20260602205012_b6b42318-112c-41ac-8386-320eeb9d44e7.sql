ALTER TABLE public.webhooks ADD COLUMN name TEXT;
-- Update existing webhooks with a default name if any
UPDATE public.webhooks SET name = 'Webhook ' || id WHERE name IS NULL;