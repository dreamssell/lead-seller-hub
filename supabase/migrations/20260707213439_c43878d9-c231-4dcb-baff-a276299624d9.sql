ALTER TABLE public.channel_routing DROP CONSTRAINT IF EXISTS channel_routing_chat_provider_check;
ALTER TABLE public.channel_routing ADD CONSTRAINT channel_routing_chat_provider_check
  CHECK (chat_provider = ANY (ARRAY['uaz','evolution','wavoip','meta','waha','instagram','telegram','facebook','linkedin','tiktok','youtube','widget','none']));