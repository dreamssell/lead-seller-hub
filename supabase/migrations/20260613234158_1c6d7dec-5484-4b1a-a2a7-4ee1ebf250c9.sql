
-- 1) Remove permissive SELECT policies (admin-only policies already exist)
DROP POLICY IF EXISTS "Users can view their connection events" ON public.connection_events;
DROP POLICY IF EXISTS "Users can view logs of their servers" ON public.mcp_server_logs;
DROP POLICY IF EXISTS "Users can view their own logs" ON public.telemetry_logs;

-- Recreate mcp_server_logs SELECT scoped to owners of the server
CREATE POLICY "Users can view logs of their servers"
ON public.mcp_server_logs
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.mcp_servers ms
    LEFT JOIN public.user_account_access uaa
      ON uaa.user_id = auth.uid() AND uaa.sub_company_id = ms.sub_company_id
    WHERE ms.id = mcp_server_logs.mcp_server_id
      AND (
        (ms.sub_company_id IS NULL AND public.has_role(auth.uid(), 'admin'::app_role))
        OR uaa.id IS NOT NULL
      )
  )
);

-- 2) video_rooms: restrict SELECT to host, participants, or admin
DROP POLICY IF EXISTS "Authenticated users can view active rooms" ON public.video_rooms;
CREATE POLICY "Hosts participants admins can view rooms"
ON public.video_rooms
FOR SELECT TO authenticated
USING (
  auth.uid() = host_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.video_participants vp
    WHERE vp.room_id = video_rooms.id AND vp.user_id = auth.uid()
  )
);

-- 3) Storage: scope agent-files and agent-avatars by first-folder ownership
-- agent-files: first folder = user id OR admin
DROP POLICY IF EXISTS "agent files authenticated read" ON storage.objects;
DROP POLICY IF EXISTS "agent files authenticated write" ON storage.objects;
DROP POLICY IF EXISTS "agent files authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "agent files authenticated delete" ON storage.objects;

CREATE POLICY "agent-files owner read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'agent-files'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);
CREATE POLICY "agent-files owner write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'agent-files'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);
CREATE POLICY "agent-files owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'agent-files'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);
CREATE POLICY "agent-files owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'agent-files'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- agent-avatars: keep public read via bucket public flag; restrict writes by owner path
DROP POLICY IF EXISTS "agent avatars authenticated write" ON storage.objects;
DROP POLICY IF EXISTS "agent avatars authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "agent avatars authenticated delete" ON storage.objects;

CREATE POLICY "agent-avatars owner write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'agent-avatars'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);
CREATE POLICY "agent-avatars owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'agent-avatars'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);
CREATE POLICY "agent-avatars owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'agent-avatars'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);
