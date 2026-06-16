
CREATE TABLE IF NOT EXISTS public.wavoip_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  sub_company_id text,
  token text NOT NULL,
  label text NOT NULL DEFAULT 'WhatsApp',
  phone text,
  is_default boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  last_validated_at timestamptz,
  last_validation_status text,
  last_validation_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, sub_company_id, token)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wavoip_devices TO authenticated;
GRANT ALL ON public.wavoip_devices TO service_role;

ALTER TABLE public.wavoip_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their wavoip devices"
ON public.wavoip_devices FOR ALL
TO authenticated
USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_wavoip_devices_updated_at
BEFORE UPDATE ON public.wavoip_devices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_wavoip_devices_owner_sub ON public.wavoip_devices(owner_id, sub_company_id);
