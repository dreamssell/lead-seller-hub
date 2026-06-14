
DROP POLICY IF EXISTS "Participants can view room members" ON public.video_participants;

CREATE POLICY "Authenticated room members can view participants"
ON public.video_participants
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.video_rooms r
    WHERE r.id = video_participants.room_id
      AND r.host_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.video_participants vp
    WHERE vp.room_id = video_participants.room_id
      AND vp.user_id = auth.uid()
      AND vp.status = 'approved'
  )
);
