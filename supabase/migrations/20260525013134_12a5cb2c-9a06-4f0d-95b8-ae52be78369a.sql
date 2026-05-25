
-- Audit log table
CREATE TABLE public.auth_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  event text NOT NULL,
  success boolean NOT NULL DEFAULT false,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  user_id uuid,
  sub_company_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_auth_audit_logs_email ON public.auth_audit_logs(email);
CREATE INDEX idx_auth_audit_logs_event ON public.auth_audit_logs(event);
CREATE INDEX idx_auth_audit_logs_created_at ON public.auth_audit_logs(created_at DESC);

ALTER TABLE public.auth_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view auth audit logs"
ON public.auth_audit_logs
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Provision locks: idempotency for concurrent provisioning attempts
CREATE TABLE public.provision_locks (
  email text PRIMARY KEY,
  locked_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.provision_locks ENABLE ROW LEVEL SECURITY;
-- No client policies → only service role can touch it.

-- Acquire a lock: returns true if acquired, false if held by another (and not expired).
CREATE OR REPLACE FUNCTION public.try_acquire_provision_lock(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized text := lower(trim(p_email));
  v_inserted int;
BEGIN
  -- Clean stale locks (>30s old)
  DELETE FROM public.provision_locks WHERE locked_at < now() - interval '30 seconds';

  INSERT INTO public.provision_locks(email) VALUES (v_normalized)
  ON CONFLICT (email) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_provision_lock(p_email text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.provision_locks WHERE email = lower(trim(p_email));
$$;

-- Realtime for sub_companies (so UI reacts to blocked_pages changes)
ALTER TABLE public.sub_companies REPLICA IDENTITY FULL;
ALTER TABLE public.user_account_access REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'sub_companies'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sub_companies';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_account_access'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.user_account_access';
  END IF;
END $$;
