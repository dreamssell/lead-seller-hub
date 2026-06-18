
CREATE TABLE public.signature_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_id uuid,
  sub_company_id uuid,
  context text NOT NULL,
  route text,
  message text NOT NULL,
  details jsonb,
  original_filename text,
  user_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.signature_error_logs TO authenticated;
GRANT ALL ON public.signature_error_logs TO service_role;

ALTER TABLE public.signature_error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can insert own error logs"
ON public.signature_error_logs FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Leaders and admins can view error logs"
ON public.signature_error_logs FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_signature_leader(sub_company_id)
  OR auth.uid() = user_id
);

CREATE INDEX idx_sig_err_created_at ON public.signature_error_logs (created_at DESC);
CREATE INDEX idx_sig_err_context ON public.signature_error_logs (context);
