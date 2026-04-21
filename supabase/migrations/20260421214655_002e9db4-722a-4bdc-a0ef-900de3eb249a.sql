-- Provider enum
CREATE TYPE public.whatsapp_provider AS ENUM ('uaz', 'meta');
CREATE TYPE public.whatsapp_status AS ENUM ('disconnected', 'connecting', 'connected', 'error');

CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider public.whatsapp_provider NOT NULL UNIQUE,
  display_name text NOT NULL,
  phone_number text,
  status public.whatsapp_status NOT NULL DEFAULT 'disconnected',
  last_checked_at timestamptz,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage whatsapp connections"
ON public.whatsapp_connections FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_whatsapp_connections_updated_at
BEFORE UPDATE ON public.whatsapp_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default rows
INSERT INTO public.whatsapp_connections (provider, display_name) VALUES
  ('uaz', 'UAZ API'),
  ('meta', 'Meta Cloud API (Oficial)');