-- Primeiro, removemos políticas que podem estar causando conflito
DROP POLICY IF EXISTS "Anyone can join a room as participant" ON public.video_participants;
DROP POLICY IF EXISTS "Anyone can request to join a room" ON public.video_participants;

-- Criamos uma política única e abrangente para inserção
CREATE POLICY "Enable insert for pending participants" ON public.video_participants
FOR INSERT
TO anon, authenticated
WITH CHECK (
    status = 'pending' AND 
    EXISTS (
        SELECT 1 FROM video_rooms 
        WHERE id = room_id AND is_active = true
    )
);

-- Garantir que anon tenha permissão de INSERT
GRANT INSERT ON public.video_participants TO anon;
GRANT INSERT ON public.video_participants TO authenticated;
GRANT SELECT ON public.video_rooms TO anon;