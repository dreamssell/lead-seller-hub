
CREATE TABLE IF NOT EXISTS public.wavoip_validation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  sub_company_id text,
  device_id uuid,
  device_label text,
  device_token text,
  status text NOT NULL CHECK (status IN ('ok','fail','sdk_error')),
  message text,
  raw jsonb,
  validated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.wavoip_validation_logs TO authenticated;
GRANT ALL ON public.wavoip_validation_logs TO service_role;

ALTER TABLE public.wavoip_validation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their wavoip validation logs"
ON public.wavoip_validation_logs FOR ALL
TO authenticated
USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_wv_logs_owner_sub_time
  ON public.wavoip_validation_logs(owner_id, sub_company_id, validated_at DESC);
