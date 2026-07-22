
ALTER TABLE public.landing_pages
  ADD COLUMN IF NOT EXISTS page_type text NOT NULL DEFAULT 'page',
  ADD COLUMN IF NOT EXISTS redirect_url text;

ALTER TABLE public.landing_pages
  DROP CONSTRAINT IF EXISTS landing_pages_page_type_check;
ALTER TABLE public.landing_pages
  ADD CONSTRAINT landing_pages_page_type_check CHECK (page_type IN ('page','link'));

CREATE INDEX IF NOT EXISTS landing_pages_page_type_idx ON public.landing_pages(page_type);

ALTER TABLE public.landing_events
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;
