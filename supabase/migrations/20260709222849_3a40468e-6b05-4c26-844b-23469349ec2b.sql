ALTER TABLE public.sub_companies ADD COLUMN IF NOT EXISTS recording_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.client_companies ADD COLUMN IF NOT EXISTS recording_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_recording_enabled(p_owner_id uuid, p_sub_company_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (CASE WHEN p_sub_company_id IS NOT NULL
          THEN (SELECT recording_enabled FROM public.sub_companies WHERE id = p_sub_company_id)
     END),
    (SELECT recording_enabled FROM public.client_companies WHERE auth_user_id = p_owner_id LIMIT 1),
    false
  );
$$;