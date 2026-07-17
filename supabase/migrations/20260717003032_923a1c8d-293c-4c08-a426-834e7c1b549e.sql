
-- Estrutura de path: {ticket_id}/{uuid-file}
CREATE POLICY "support_att_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id::text = split_part(name, '/', 1)
      AND (
        public.has_role(auth.uid(),'admin')
        OR t.user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.user_account_access a
                    WHERE a.user_id = auth.uid()
                      AND a.owner_id = t.owner_id
                      AND (a.sub_company_id IS NULL OR a.sub_company_id = t.sub_company_id OR t.sub_company_id IS NULL))
      )
  )
);

CREATE POLICY "support_att_write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'support-attachments'
  AND owner = auth.uid()
);

CREATE POLICY "support_att_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin'))
);
