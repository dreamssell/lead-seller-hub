
-- Índices únicos parciais como rede de segurança (idempotentes).
-- Já existem UNIQUE CONSTRAINTS globais; estes garantem o comportamento
-- correto caso alguém remova as constraints no futuro e não penalizam
-- linhas com NULL (mensagens antigas sem correlação).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'chat_messages_client_msg_id_unique_notnull'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX chat_messages_client_msg_id_unique_notnull
             ON public.chat_messages (client_msg_id)
             WHERE client_msg_id IS NOT NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'chat_messages_uaz_msg_id_unique_notnull'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX chat_messages_uaz_msg_id_unique_notnull
             ON public.chat_messages (uaz_msg_id)
             WHERE uaz_msg_id IS NOT NULL';
  END IF;
END $$;

COMMENT ON INDEX public.chat_messages_client_msg_id_unique_notnull IS
  'Deduplicação persistente por client_msg_id — bloqueia envios duplicados entre instâncias concorrentes.';
COMMENT ON INDEX public.chat_messages_uaz_msg_id_unique_notnull IS
  'Deduplicação persistente por uaz_msg_id — bloqueia ecos duplicados do webhook do provedor.';
