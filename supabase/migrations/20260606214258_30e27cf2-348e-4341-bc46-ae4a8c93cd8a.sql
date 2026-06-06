-- Adicionar configurações de permissão e bloqueio à sala
ALTER TABLE public.video_rooms 
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS permissions_config JSONB DEFAULT '{
  "host": ["approve", "kick", "mute", "promote", "screen_share"],
  "moderator": ["approve", "kick", "mute", "screen_share"],
  "participant": ["screen_share"]
}'::jsonb;

-- Adicionar lista negra à sala
ALTER TABLE public.video_rooms 
ADD COLUMN IF NOT EXISTS blacklist TEXT[] DEFAULT '{}';

-- Adicionar flag de banimento ao participante
ALTER TABLE public.video_participants
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false;

-- Atualizar política de inserção para respeitar o bloqueio da sala e a lista negra
DROP POLICY IF EXISTS "Anyone can join a room as participant" ON public.video_participants;
CREATE POLICY "Anyone can join a room as participant" ON public.video_participants
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM video_rooms
            WHERE video_rooms.id = room_id 
            AND video_rooms.is_active = true
            AND video_rooms.is_locked = false
            AND NOT (name = ANY(video_rooms.blacklist))
        )
    );
