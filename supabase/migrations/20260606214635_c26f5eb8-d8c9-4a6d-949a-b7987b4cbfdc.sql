-- Adicionar coluna de cooldown para participantes
ALTER TABLE public.video_participants 
ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMP WITH TIME ZONE;

-- Trigger para registrar tentativas recusadas no log de auditoria
CREATE OR REPLACE FUNCTION public.log_denied_attempt()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.status = 'rejected') THEN
        INSERT INTO public.video_audit_logs (room_id, target_name, action, message)
        VALUES (NEW.room_id, NEW.name, 'attempt_denied', 'Tentativa de entrada bloqueada (banido ou em cooldown)');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_log_denied_attempt ON public.video_participants;
CREATE TRIGGER trigger_log_denied_attempt
AFTER UPDATE ON public.video_participants
FOR EACH ROW
WHEN (OLD.status != NEW.status AND NEW.status = 'rejected')
EXECUTE FUNCTION public.log_denied_attempt();
