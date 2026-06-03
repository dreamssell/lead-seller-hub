ALTER TABLE public.uaz_system_settings 
ADD COLUMN IF NOT EXISTS queue_threshold_global INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS queue_threshold_per_tenant JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS queue_threshold_per_channel JSONB DEFAULT '{"whatsapp": 50, "voip": 20, "video": 10}'::jsonb;

COMMENT ON COLUMN public.uaz_system_settings.queue_threshold_global IS 'Limite global de mensagens na fila antes de disparar alerta.';
COMMENT ON COLUMN public.uaz_system_settings.queue_threshold_per_tenant IS 'Limites customizados por ID de tenant.';
COMMENT ON COLUMN public.uaz_system_settings.queue_threshold_per_channel IS 'Limites customizados por tipo de canal.';