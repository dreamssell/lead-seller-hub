DROP POLICY IF EXISTS "Public can read avatars" ON storage.objects;
REVOKE SELECT ON storage.objects FROM anon;