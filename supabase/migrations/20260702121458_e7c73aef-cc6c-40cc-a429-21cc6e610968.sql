
ALTER TABLE public.client_companies
  ADD COLUMN IF NOT EXISTS login_email text,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid,
  ADD COLUMN IF NOT EXISTS display_name text;

CREATE UNIQUE INDEX IF NOT EXISTS client_companies_login_email_uidx
  ON public.client_companies (lower(login_email))
  WHERE login_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS client_companies_auth_user_idx
  ON public.client_companies (auth_user_id);
