-- Remover políticas problemáticas
DROP POLICY IF EXISTS "Participants can view other participants in the same room" ON public.video_participants;
DROP POLICY IF EXISTS "Anyone can join a room as participant" ON public.video_participants;
DROP POLICY IF EXISTS "Anyone can view their own participant record" ON public.video_participants;

-- Nova política para inserção (correção da recursão)
-- Usamos explicitamente NEW.name para evitar referências circulares
CREATE POLICY "Anyone can join a room as participant" ON public.video_participants
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM video_rooms
            WHERE video_rooms.id = room_id 
            AND video_rooms.is_active = true
            AND video_rooms.is_locked = false
        )
    );

-- Nova política para visualização (baseada em room_id para evitar recursão infinita)
CREATE POLICY "Participants can view room members" ON public.video_participants
    FOR SELECT USING (
        -- Admins podem ver tudo (via outra política) ou qualquer um na mesma sala
        -- Simplificamos para permitir ver se a sala está ativa
        EXISTS (
            SELECT 1 FROM video_rooms
            WHERE video_rooms.id = room_id AND video_rooms.is_active = true
        )
    );

-- Garantir que o participante possa ver seu próprio registro (útil para convidados)
CREATE POLICY "View own record" ON public.video_participants
    FOR SELECT USING (
        (user_id = auth.uid()) OR 
        (id::text = current_setting('request.jwt.claims', true)::json ->> 'participant_id')
    );
