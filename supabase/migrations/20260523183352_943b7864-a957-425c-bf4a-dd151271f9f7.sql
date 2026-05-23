CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.generate_sub_login_token(p_sub_company_id uuid, p_hours integer DEFAULT 24, p_label text DEFAULT NULL::text)
 RETURNS sub_company_login_tokens
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_owner uuid;
  v_token text;
  v_row public.sub_company_login_tokens;
BEGIN
  SELECT owner_id INTO v_owner FROM public.sub_companies WHERE id = p_sub_company_id;
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  INSERT INTO public.sub_company_login_tokens(sub_company_id, owner_id, token, expires_at, label)
  VALUES (p_sub_company_id, v_owner, v_token, now() + (GREATEST(1, p_hours) || ' hours')::interval, p_label)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;