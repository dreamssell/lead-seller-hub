
-- ============ sub_companies new columns ============
ALTER TABLE public.sub_companies
  ADD COLUMN IF NOT EXISTS credit_alert_threshold integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS auto_action text NOT NULL DEFAULT 'alert',
  ADD COLUMN IF NOT EXISTS last_alert_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_alert_pct integer;

-- ============ white_label_settings new columns ============
ALTER TABLE public.white_label_settings
  ADD COLUMN IF NOT EXISTS domain_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS domain_verification_token text,
  ADD COLUMN IF NOT EXISTS domain_last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS domain_check_message text;

-- ============ sub_company_login_tokens ============
CREATE TABLE IF NOT EXISTS public.sub_company_login_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_company_id uuid NOT NULL REFERENCES public.sub_companies(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  last_used_at timestamptz,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sub_company_login_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manage login tokens" ON public.sub_company_login_tokens
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX IF NOT EXISTS idx_sub_login_tokens_sub ON public.sub_company_login_tokens(sub_company_id);

-- ============ sub_company_api_keys ============
CREATE TABLE IF NOT EXISTS public.sub_company_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_company_id uuid NOT NULL REFERENCES public.sub_companies(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  name text NOT NULL,
  key text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['auth:verify','auth:login'],
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sub_company_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manage sub api keys" ON public.sub_company_api_keys
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX IF NOT EXISTS idx_sub_api_keys_sub ON public.sub_company_api_keys(sub_company_id);

-- ============ sub_company_alerts ============
CREATE TABLE IF NOT EXISTS public.sub_company_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_company_id uuid NOT NULL REFERENCES public.sub_companies(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  type text NOT NULL,
  message text NOT NULL,
  percent integer,
  action_taken text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sub_company_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manage alerts" ON public.sub_company_alerts
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX IF NOT EXISTS idx_sub_alerts_sub ON public.sub_company_alerts(sub_company_id);

-- ============ token generator ============
CREATE OR REPLACE FUNCTION public.generate_sub_login_token(
  p_sub_company_id uuid, p_hours integer DEFAULT 24, p_label text DEFAULT NULL
) RETURNS public.sub_company_login_tokens
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_token text;
  v_row public.sub_company_login_tokens;
BEGIN
  SELECT owner_id INTO v_owner FROM public.sub_companies WHERE id = p_sub_company_id;
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  v_token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO public.sub_company_login_tokens(sub_company_id, owner_id, token, expires_at, label)
  VALUES (p_sub_company_id, v_owner, v_token, now() + (GREATEST(1, p_hours) || ' hours')::interval, p_label)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ============ credit alert trigger ============
CREATE OR REPLACE FUNCTION public.handle_sub_company_credit_alert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pct integer;
  v_msg text;
  v_threshold integer := COALESCE(NEW.credit_alert_threshold, 80);
BEGIN
  IF NEW.credit_limit IS NULL OR NEW.credit_limit <= 0 THEN RETURN NEW; END IF;
  v_pct := FLOOR( ((NEW.credit_limit - NEW.credit_balance)::numeric / NEW.credit_limit) * 100 );
  IF v_pct >= v_threshold AND (NEW.last_alert_pct IS NULL OR NEW.last_alert_pct < v_threshold) THEN
    v_msg := 'A sub-empresa "' || NEW.name || '" atingiu ' || v_pct || '% do consumo de créditos.';
    INSERT INTO public.sub_company_alerts(sub_company_id, owner_id, type, message, percent, action_taken)
    VALUES (NEW.id, NEW.owner_id, 'credit_threshold', v_msg, v_pct, NEW.auto_action);
    NEW.last_alert_at := now();
    NEW.last_alert_pct := v_pct;
    IF NEW.auto_action = 'block' AND NEW.credit_balance <= 0 THEN
      NEW.status := 'blocked';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sub_credit_alert ON public.sub_companies;
CREATE TRIGGER trg_sub_credit_alert
BEFORE UPDATE OF credit_balance, credit_limit, credit_alert_threshold ON public.sub_companies
FOR EACH ROW EXECUTE FUNCTION public.handle_sub_company_credit_alert();

-- ============ realtime ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.sub_company_login_tokens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sub_company_api_keys;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sub_company_alerts;
