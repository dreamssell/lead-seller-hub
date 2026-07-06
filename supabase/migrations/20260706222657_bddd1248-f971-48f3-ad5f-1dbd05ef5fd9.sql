
-- Blocked pages for direct client_companies (empresas cadastradas em Cadastros > Empresas)
ALTER TABLE public.client_companies
  ADD COLUMN IF NOT EXISTS blocked_pages text[] NOT NULL DEFAULT ARRAY[]::text[];

-- get_my_account_access: incorpora blocked_pages / status vindos de client_companies
-- quando o login pertence a uma empresa (auth_user_id).
CREATE OR REPLACE FUNCTION public.get_my_account_access()
RETURNS TABLE(
  owner_id uuid,
  sub_company_id uuid,
  sub_company_name text,
  allowed_pages text[],
  is_account_admin boolean,
  blocked_pages text[],
  status text,
  allow_custom_logic boolean,
  feature_landing_builder boolean
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT a.owner_id,
         a.sub_company_id,
         s.name,
         a.allowed_pages,
         a.is_account_admin,
         COALESCE(s.blocked_pages, cc.blocked_pages, ARRAY[]::text[]) AS blocked_pages,
         COALESCE(s.status, cc.status, 'active') AS status,
         COALESCE(s.allow_custom_logic, true) AS allow_custom_logic,
         COALESCE(s.feature_landing_builder, false) AS feature_landing_builder
    FROM public.user_account_access a
    LEFT JOIN public.sub_companies s ON s.id = a.sub_company_id
    LEFT JOIN public.client_companies cc
      ON cc.auth_user_id = auth.uid()
     AND a.sub_company_id IS NULL
   WHERE a.user_id = auth.uid()
   ORDER BY a.is_account_admin DESC, a.created_at ASC
   LIMIT 1;
$function$;

-- Backfill: garante user_account_access (is_owner + is_account_admin) para toda
-- empresa que já tem login provisionado, para que blocked_pages entre em vigor.
INSERT INTO public.user_account_access (user_id, owner_id, sub_company_id, allowed_pages, is_account_admin, is_owner, created_by)
SELECT cc.auth_user_id, cc.auth_user_id, NULL, ARRAY[]::text[], true, true, cc.owner_id
  FROM public.client_companies cc
 WHERE cc.auth_user_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = cc.auth_user_id
        AND a.owner_id = cc.auth_user_id
        AND a.sub_company_id IS NULL
   );

-- Garante que os existentes fiquem marcados como owner/admin.
UPDATE public.user_account_access a
   SET is_owner = true,
       is_account_admin = true
  FROM public.client_companies cc
 WHERE a.user_id = cc.auth_user_id
   AND a.owner_id = cc.auth_user_id
   AND a.sub_company_id IS NULL
   AND (a.is_owner = false OR a.is_account_admin = false);
