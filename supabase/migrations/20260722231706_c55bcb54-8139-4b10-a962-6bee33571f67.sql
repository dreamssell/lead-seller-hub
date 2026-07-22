-- Corrige duplicidade de mensagens do WhatsApp (WAHA):
-- as linhas do frontend gravaram uaz_msg_id = 'true_<jid>_<HEX>' enquanto o webhook
-- canonicaliza para o <HEX> puro, produzindo duas bolhas para o remetente.
-- 1) Remove a linha-eco do webhook quando existe a linha do frontend equivalente.
WITH pairs AS (
  SELECT a.id AS front_id, b.id AS echo_id
  FROM public.chat_messages a
  JOIN public.chat_messages b
    ON b.customer_id = a.customer_id
   AND b.sender_type = 'agent'
   AND b.uaz_msg_id = upper(split_part(a.uaz_msg_id, '_', array_length(string_to_array(a.uaz_msg_id,'_'),1)))
   AND b.id <> a.id
  WHERE a.sender_type = 'agent'
    AND a.uaz_msg_id ~* '^true_.+_[A-F0-9]{16,}$'
)
DELETE FROM public.chat_messages WHERE id IN (SELECT echo_id FROM pairs);

-- 2) Canonicaliza o id gravado para bater com o formato que o webhook usa,
--    de modo que futuros ecos batem no unique index e são ignorados.
UPDATE public.chat_messages
SET uaz_msg_id = upper(split_part(uaz_msg_id, '_', array_length(string_to_array(uaz_msg_id,'_'),1)))
WHERE sender_type = 'agent'
  AND uaz_msg_id ~* '^true_.+_[A-F0-9]{16,}$';