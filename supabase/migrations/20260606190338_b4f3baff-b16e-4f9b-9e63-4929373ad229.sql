-- Adicionar coluna de role aos participantes
ALTER TABLE public.video_participants ADD COLUMN role TEXT NOT NULL DEFAULT 'participant'; -- host, moderator, participant

-- Criar tabela de logs de auditoria
CREATE TABLE public.video_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  room_id UUID NOT NULL REFERENCES public.video_rooms(id) ON DELETE CASCADE,
  target_name TEXT NOT NULL,
  target_user_id UUID,
  action TEXT NOT NULL, -- approved, rejected, kicked, muted
  performed_by UUID REFERENCES auth.users(id),
  reason TEXT
);

GRANT SELECT, INSERT ON public.video_audit_logs TO authenticated;
GRANT ALL ON public.video_audit_logs TO service_role;

ALTER TABLE public.video_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs for their rooms" ON public.video_audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.video_rooms 
      WHERE video_rooms.id = video_audit_logs.room_id 
      AND video_rooms.host_id = auth.uid()
    )
  );

-- Função para registrar auditoria automaticamente
CREATE OR REPLACE FUNCTION public.log_video_action(
  p_room_id UUID,
  p_target_name TEXT,
  p_target_user_id UUID,
  p_action TEXT,
  p_performed_by UUID
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.video_audit_logs (room_id, target_name, target_user_id, action, performed_by)
  VALUES (p_room_id, p_target_name, p_target_user_id, p_action, p_performed_by);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;