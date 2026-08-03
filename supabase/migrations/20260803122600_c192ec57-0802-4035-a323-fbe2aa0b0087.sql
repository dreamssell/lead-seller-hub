UPDATE public.channel_routing SET chat_provider = 'waha' WHERE chat_provider = 'uaz';
DELETE FROM public.whatsapp_connections WHERE provider::text = 'uaz';

DROP TABLE IF EXISTS public.uaz_audit_logs CASCADE;
DROP TABLE IF EXISTS public.uaz_incidents CASCADE;
DROP TABLE IF EXISTS public.uaz_alerts_history CASCADE;
DROP TABLE IF EXISTS public.uaz_system_settings CASCADE;