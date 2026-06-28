ALTER TABLE public.landing_pages
  ADD COLUMN IF NOT EXISTS published_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_published_at timestamptz;