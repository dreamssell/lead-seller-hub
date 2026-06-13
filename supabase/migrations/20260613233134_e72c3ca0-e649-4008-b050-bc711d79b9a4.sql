
DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
CREATE POLICY "Avatars listable by authenticated" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Company logos are publicly accessible" ON storage.objects;
CREATE POLICY "Company logos listable by authenticated" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'company-logos');

DROP POLICY IF EXISTS "agent avatars public read" ON storage.objects;
CREATE POLICY "agent avatars listable by authenticated" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'agent-avatars');
