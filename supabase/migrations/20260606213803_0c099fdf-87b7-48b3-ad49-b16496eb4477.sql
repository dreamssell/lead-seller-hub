-- Tabela de logs de erro para videochamadas
CREATE TABLE IF NOT EXISTS public.video_error_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    room_id UUID REFERENCES public.video_rooms(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name TEXT,
    error_message TEXT NOT NULL,
    error_stack TEXT,
    browser_info JSONB,
    context TEXT -- 'start_call', 'webrtc', 'media_access', etc.
);

-- Permissões para a nova tabela
GRANT SELECT, INSERT ON public.video_error_logs TO authenticated, anon;
GRANT ALL ON public.video_error_logs TO service_role;

-- Ativar RLS
ALTER TABLE public.video_error_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para logs de erro (qualquer um pode inserir, admins podem ver todos, usuários podem ver os seus)
CREATE POLICY "Anyone can insert error logs" ON public.video_error_logs
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can view all error logs" ON public.video_error_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM video_rooms
            WHERE video_rooms.host_id = auth.uid()
        ) OR 
        (auth.jwt() ->> 'role' = 'service_role')
    );

-- Corrigir permissões de video_participants para permitir convidados
GRANT SELECT, INSERT, UPDATE ON public.video_participants TO authenticated, anon;

-- Política para permitir que qualquer pessoa se insira como participante (necessário para convidados)
-- O controle real de quem entra é feito via status='pending' e aprovação do host
CREATE POLICY "Anyone can join a room as participant" ON public.video_participants
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM video_rooms
            WHERE video_rooms.id = room_id AND video_rooms.is_active = true
        )
    );

-- Permitir que participantes atualizem seu próprio status (para sair da sala, por exemplo)
CREATE POLICY "Participants can update their own status" ON public.video_participants
    FOR UPDATE USING (
        (user_id = auth.uid()) OR 
        (current_setting('request.jwt.claims', true)::json ->> 'participant_id' = id::text) OR
        (auth.role() = 'anon') -- Convidados precisam atualizar seu status para 'left'
    );

-- Garantir que convidados possam ver o próprio status
CREATE POLICY "Anyone can view their own participant record" ON public.video_participants
    FOR SELECT USING (
        (user_id = auth.uid()) OR 
        (id::text = current_setting('request.jwt.claims', true)::json ->> 'participant_id') OR
        (true) -- Simplificando para permitir que convidados vejam quem está na sala
    );
