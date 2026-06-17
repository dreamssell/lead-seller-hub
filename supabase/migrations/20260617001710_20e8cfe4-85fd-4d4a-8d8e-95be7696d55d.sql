
-- =============================================================
-- WebAuthn credentials (persistent passkeys per user)
-- =============================================================
CREATE TABLE IF NOT EXISTS public.webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  device_type TEXT,
  backed_up BOOLEAN NOT NULL DEFAULT false,
  friendly_name TEXT NOT NULL DEFAULT 'Dispositivo biométrico',
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webauthn_credentials_user_idx
  ON public.webauthn_credentials(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.webauthn_credentials TO authenticated;
GRANT ALL ON public.webauthn_credentials TO service_role;

ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_own_webauthn_credentials"
  ON public.webauthn_credentials FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "users_insert_own_webauthn_credentials"
  ON public.webauthn_credentials FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_webauthn_credentials"
  ON public.webauthn_credentials FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_delete_own_webauthn_credentials"
  ON public.webauthn_credentials FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_webauthn_credentials_updated_at
  BEFORE UPDATE ON public.webauthn_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================
-- WebAuthn challenges (ephemeral, server-only)
-- =============================================================
CREATE TABLE IF NOT EXISTS public.webauthn_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  challenge TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('register','auth')),
  rp_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webauthn_challenges_challenge_idx
  ON public.webauthn_challenges(challenge);
CREATE INDEX IF NOT EXISTS webauthn_challenges_expires_idx
  ON public.webauthn_challenges(expires_at);

-- Challenges are server-only: edge function uses service role.
GRANT ALL ON public.webauthn_challenges TO service_role;

ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

-- No policies granted to authenticated → table is locked from the client.
-- (Admins can still read via service_role/Studio if needed.)
