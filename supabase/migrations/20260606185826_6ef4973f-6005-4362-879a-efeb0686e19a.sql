CREATE TABLE public.video_rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  host_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  is_group BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  invite_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  settings JSONB NOT NULL DEFAULT '{"guest_approval_required": true, "allow_chat": true}'::jsonb
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_rooms TO authenticated;
GRANT ALL ON public.video_rooms TO service_role;

ALTER TABLE public.video_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own rooms" ON public.video_rooms
  FOR ALL USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Anyone with token can view active room" ON public.video_rooms
  FOR SELECT USING (is_active = true);

CREATE TABLE public.video_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.video_rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  is_guest BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected, left
  joined_at TIMESTAMP WITH TIME ZONE,
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  media_status JSONB DEFAULT '{"audio": false, "video": false}'::jsonb
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_participants TO anon;
GRANT ALL ON public.video_participants TO service_role;

ALTER TABLE public.video_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage participants in their rooms" ON public.video_participants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.video_rooms 
      WHERE video_rooms.id = video_participants.room_id 
      AND video_rooms.host_id = auth.uid()
    )
  );

CREATE POLICY "Participants can view other participants in the same room" ON public.video_participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.video_participants AS me
      WHERE me.room_id = video_participants.room_id
      AND (me.user_id = auth.uid() OR me.id::text = current_setting('request.jwt.claims', true)::json->>'participant_id')
    )
  );

-- Function to update last_seen
CREATE OR REPLACE FUNCTION public.update_video_participant_presence() 
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_seen_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_participant_last_seen
  BEFORE UPDATE ON public.video_participants
  FOR EACH ROW EXECUTE FUNCTION public.update_video_participant_presence();