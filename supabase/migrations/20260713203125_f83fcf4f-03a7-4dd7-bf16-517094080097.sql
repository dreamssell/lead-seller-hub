ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS profile_about text,
  ADD COLUMN IF NOT EXISTS profile_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_whatsapp boolean;
CREATE INDEX IF NOT EXISTS idx_customers_is_blocked ON public.customers(is_blocked) WHERE is_blocked = true;