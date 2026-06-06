-- Adicionar flag de bypass para o log de auditoria
ALTER TABLE public.video_audit_logs 
ADD COLUMN IF NOT EXISTS is_bypass BOOLEAN DEFAULT false;

-- Remover política antiga e criar nova para logs de erro
DROP POLICY IF EXISTS "Admins can view all error logs" ON public.video_error_logs;

CREATE POLICY "Admins can view all error logs" ON public.video_error_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM video_rooms
            WHERE video_rooms.host_id = auth.uid()
        ) OR 
        (auth.jwt() ->> 'role' = 'service_role') OR
        (EXISTS (SELECT 1 FROM video_participants WHERE user_id = auth.uid() AND role IN ('host', 'moderator')))
    );
