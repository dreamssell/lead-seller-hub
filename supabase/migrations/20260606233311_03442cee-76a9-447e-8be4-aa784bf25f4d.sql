CREATE POLICY "Anyone can request to join a room" ON public.video_participants
FOR INSERT
TO anon, authenticated
WITH CHECK (status = 'pending');

GRANT INSERT ON public.video_participants TO anon;
GRANT INSERT ON public.video_participants TO authenticated;