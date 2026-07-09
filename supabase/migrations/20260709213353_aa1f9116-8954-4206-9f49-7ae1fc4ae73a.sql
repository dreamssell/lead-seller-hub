
CREATE POLICY "Members can read call recordings"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'call-recordings'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.call_history ch
        WHERE ch.recording_path = storage.objects.name
          AND (
            ch.owner_id = auth.uid()
            OR ch.user_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.user_account_access a
              WHERE a.user_id = auth.uid()
                AND a.owner_id = ch.owner_id
                AND (a.sub_company_id = ch.sub_company_id OR a.sub_company_id IS NULL)
            )
          )
      )
    )
  );

CREATE POLICY "Authenticated can upload call recordings"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'call-recordings');

CREATE POLICY "Owners can delete call recordings"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'call-recordings'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.call_history ch
        WHERE ch.recording_path = storage.objects.name
          AND ch.owner_id = auth.uid()
      )
    )
  );
