-- Tabela de alertas de vídeo
CREATE TABLE IF NOT EXISTS public.video_alerts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    room_id UUID REFERENCES public.video_rooms(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL, -- 'high_error_rate', 'media_denial_surge'
    severity TEXT DEFAULT 'warning',
    message TEXT,
    is_resolved BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Habilitar RLS
ALTER TABLE public.video_alerts ENABLE ROW LEVEL SECURITY;

-- Permissões
GRANT SELECT ON public.video_alerts TO authenticated;
GRANT ALL ON public.video_alerts TO service_role;

-- Política: Host pode ver alertas de suas salas
CREATE POLICY "Hosts can view alerts for their rooms" ON public.video_alerts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM video_rooms
            WHERE video_rooms.id = room_id AND video_rooms.host_id = auth.uid()
        )
    );

-- Função para monitorar erros e criar alertas
CREATE OR REPLACE FUNCTION public.check_video_health()
RETURNS TRIGGER AS $$
DECLARE
    error_count INTEGER;
    room_host_id UUID;
BEGIN
    -- Contar erros na última hora para esta sala
    SELECT COUNT(*) INTO error_count 
    FROM video_error_logs 
    WHERE room_id = NEW.room_id 
    AND created_at > (now() - interval '1 hour');

    -- Se houver mais de 5 erros em uma hora, gerar alerta
    IF error_count >= 5 THEN
        -- Evitar alertas duplicados (um a cada 15 min)
        IF NOT EXISTS (
            SELECT 1 FROM video_alerts 
            WHERE room_id = NEW.room_id 
            AND alert_type = 'high_error_rate' 
            AND created_at > (now() - interval '15 minutes')
        ) THEN
            INSERT INTO video_alerts (room_id, alert_type, message, severity)
            VALUES (NEW.room_id, 'high_error_rate', 'Detectado alto índice de falhas de conexão nesta sala.', 'critical');
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para disparar monitoramento ao inserir log de erro
DROP TRIGGER IF EXISTS trigger_check_video_health ON public.video_error_logs;
CREATE TRIGGER trigger_check_video_health
AFTER INSERT ON public.video_error_logs
FOR EACH ROW EXECUTE FUNCTION public.check_video_health();
