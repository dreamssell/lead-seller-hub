
-- 1. Tokens por tenant
CREATE TABLE IF NOT EXISTS public.wavoip_webhook_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sub_company_id uuid REFERENCES public.sub_companies(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wavoip_tokens_owner ON public.wavoip_webhook_tokens(owner_id);
CREATE INDEX IF NOT EXISTS idx_wavoip_tokens_sub ON public.wavoip_webhook_tokens(sub_company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wavoip_webhook_tokens TO authenticated;
GRANT ALL ON public.wavoip_webhook_tokens TO service_role;

ALTER TABLE public.wavoip_webhook_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wavoip_tokens_select_scoped"
  ON public.wavoip_webhook_tokens FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
       WHERE a.user_id = auth.uid()
         AND a.owner_id = wavoip_webhook_tokens.owner_id
         AND (a.sub_company_id IS NULL OR a.sub_company_id = wavoip_webhook_tokens.sub_company_id)
         AND a.is_account_admin
    )
  );

CREATE POLICY "wavoip_tokens_write_scoped"
  ON public.wavoip_webhook_tokens FOR ALL TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER trg_wavoip_tokens_updated_at
  BEFORE UPDATE ON public.wavoip_webhook_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Escopo nos eventos
ALTER TABLE public.wavoip_webhook_events
  ADD COLUMN IF NOT EXISTS owner_id uuid,
  ADD COLUMN IF NOT EXISTS sub_company_id uuid,
  ADD COLUMN IF NOT EXISTS token_id uuid REFERENCES public.wavoip_webhook_tokens(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wavoip_events_owner ON public.wavoip_webhook_events(owner_id);
CREATE INDEX IF NOT EXISTS idx_wavoip_events_sub ON public.wavoip_webhook_events(sub_company_id);

DROP POLICY IF EXISTS "Admins can view wavoip webhook events" ON public.wavoip_webhook_events;

CREATE POLICY "wavoip_events_select_scoped"
  ON public.wavoip_webhook_events FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
       WHERE a.user_id = auth.uid()
         AND a.owner_id = wavoip_webhook_events.owner_id
         AND (a.sub_company_id IS NULL OR a.sub_company_id = wavoip_webhook_events.sub_company_id)
         AND a.is_account_admin
    )
  );

-- 3. Funções para gerar e revogar tokens (respeitando o escopo do chamador)
CREATE OR REPLACE FUNCTION public.generate_wavoip_webhook_token(
  p_owner_id uuid,
  p_sub_company_id uuid DEFAULT NULL,
  p_label text DEFAULT NULL
) RETURNS public.wavoip_webhook_tokens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row public.wavoip_webhook_tokens;
  v_token text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_owner_id <> auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND NOT EXISTS (
       SELECT 1 FROM public.user_account_access a
        WHERE a.user_id = auth.uid()
          AND a.owner_id = p_owner_id
          AND (a.sub_company_id IS NULL OR a.sub_company_id = p_sub_company_id)
          AND a.is_account_admin
     ) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_sub_company_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sub_companies
     WHERE id = p_sub_company_id AND owner_id = p_owner_id
  ) THEN
    RAISE EXCEPTION 'sub_company_not_found';
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.wavoip_webhook_tokens(owner_id, sub_company_id, token, label, created_by)
  VALUES (p_owner_id, p_sub_company_id, v_token, p_label, auth.uid())
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_wavoip_webhook_token(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_wavoip_webhook_token(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_wavoip_webhook_token(p_token_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT owner_id INTO v_owner FROM public.wavoip_webhook_tokens WHERE id = p_token_id;
  IF v_owner IS NULL THEN RETURN false; END IF;

  IF v_owner <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.wavoip_webhook_tokens
     SET is_active = false, revoked_at = now(), updated_at = now()
   WHERE id = p_token_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_wavoip_webhook_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_wavoip_webhook_token(uuid) TO authenticated;
