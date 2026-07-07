-- Backfill user_account_access rows for client-company logins that were
-- provisioned before the fallback existed. Without this row, AuthContext
-- previously fell back to allow-all (fixed in the same release).
INSERT INTO public.user_account_access (
  user_id, owner_id, sub_company_id, allowed_pages, is_account_admin, created_by, updated_at
)
SELECT
  cc.auth_user_id,
  cc.owner_id,
  cc.sub_company_id,
  ARRAY['dashboard','chat','calls','tickets','team','cadastros','ai-agents',
        'reports','pipeline','ceo','settings','api-keys','status','profile']::text[],
  true,
  cc.owner_id,
  now()
FROM public.client_companies cc
WHERE cc.auth_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_account_access a
    WHERE a.user_id = cc.auth_user_id
      AND a.owner_id = cc.owner_id
      AND ((a.sub_company_id IS NULL AND cc.sub_company_id IS NULL)
           OR a.sub_company_id = cc.sub_company_id)
  );