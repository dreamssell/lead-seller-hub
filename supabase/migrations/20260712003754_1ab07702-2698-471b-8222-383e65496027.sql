DROP POLICY IF EXISTS "Owners manage their wavoip devices" ON public.wavoip_devices;
DROP POLICY IF EXISTS "wavoip_devices_select_scoped" ON public.wavoip_devices;
DROP POLICY IF EXISTS "wavoip_devices_manage_scoped" ON public.wavoip_devices;

CREATE POLICY "wavoip_devices_select_scoped"
ON public.wavoip_devices
FOR SELECT
TO authenticated
USING (
  auth.uid() = owner_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.user_account_access a
    WHERE a.user_id = auth.uid()
      AND a.owner_id = wavoip_devices.owner_id
      AND (
        a.sub_company_id IS NULL
        OR wavoip_devices.sub_company_id IS NULL
        OR a.sub_company_id::text = wavoip_devices.sub_company_id
      )
  )
);

CREATE POLICY "wavoip_devices_manage_scoped"
ON public.wavoip_devices
FOR ALL
TO authenticated
USING (
  auth.uid() = owner_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.user_account_access a
    WHERE a.user_id = auth.uid()
      AND a.owner_id = wavoip_devices.owner_id
      AND (
        a.sub_company_id IS NULL
        OR wavoip_devices.sub_company_id IS NULL
        OR a.sub_company_id::text = wavoip_devices.sub_company_id
      )
      AND a.is_account_admin
  )
)
WITH CHECK (
  auth.uid() = owner_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.user_account_access a
    WHERE a.user_id = auth.uid()
      AND a.owner_id = wavoip_devices.owner_id
      AND (
        a.sub_company_id IS NULL
        OR wavoip_devices.sub_company_id IS NULL
        OR a.sub_company_id::text = wavoip_devices.sub_company_id
      )
      AND a.is_account_admin
  )
);