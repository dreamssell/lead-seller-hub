
CREATE TABLE public.password_change_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT NOT NULL CHECK (status IN ('success','failure')),
  failure_reason TEXT,
  signed_out_others BOOLEAN NOT NULL DEFAULT false,
  session_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.password_change_audit TO authenticated;
GRANT ALL ON public.password_change_audit TO service_role;

ALTER TABLE public.password_change_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own password audit"
  ON public.password_change_audit FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Platform owner can read all password audit"
  ON public.password_change_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_password_change_audit_created_at ON public.password_change_audit(created_at DESC);
CREATE INDEX idx_password_change_audit_user_id ON public.password_change_audit(user_id);
