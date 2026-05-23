CREATE OR REPLACE FUNCTION public.validate_sub_login_token(p_token text)
RETURNS TABLE(sub_company_id uuid, sub_company_name text, admin_email text, admin_name text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tok public.sub_company_login_tokens;
  v_sub public.sub_companies;
BEGIN
  SELECT * INTO v_tok FROM public.sub_company_login_tokens WHERE token = p_token;
  IF v_tok.id IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF v_tok.revoked THEN RAISE EXCEPTION 'revoked_token'; END IF;
  IF v_tok.expires_at < now() THEN RAISE EXCEPTION 'expired_token'; END IF;

  SELECT * INTO v_sub FROM public.sub_companies WHERE id = v_tok.sub_company_id;
  IF v_sub.id IS NULL THEN RAISE EXCEPTION 'sub_company_missing'; END IF;
  IF v_sub.status = 'blocked' THEN RAISE EXCEPTION 'sub_company_blocked'; END IF;

  UPDATE public.sub_company_login_tokens SET last_used_at = now() WHERE id = v_tok.id;

  RETURN QUERY SELECT v_sub.id, v_sub.name, v_sub.admin_email, v_sub.admin_name, v_tok.expires_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_sub_login_token(text) TO anon, authenticated;