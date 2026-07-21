
-- Deduplicate chat_messages left over from the WAHA/UAZ id format mismatch.
-- Some outbound rows were saved with the "true_<jid>_<HEX>" form while the
-- inbound webhook stored the bare "<HEX>" form of the SAME WhatsApp message,
-- producing two bubbles for the same message ("conversas duplicadas").
-- We now canonicalise on write; this migration cleans up historical rows.

WITH pairs AS (
  SELECT
    a.id AS prefixed_id,
    b.id AS canonical_id,
    a.customer_id
  FROM public.chat_messages a
  JOIN public.chat_messages b
    ON b.customer_id = a.customer_id
   AND b.uaz_msg_id = upper(split_part(a.uaz_msg_id, '_', array_length(string_to_array(a.uaz_msg_id, '_'), 1)))
   AND b.id <> a.id
  WHERE a.uaz_msg_id ~ '^true_[^_]+_[A-Fa-f0-9]{16,}$'
    AND b.uaz_msg_id ~ '^[A-Fa-f0-9]{16,}$'
)
DELETE FROM public.chat_messages
WHERE id IN (SELECT prefixed_id FROM pairs);

-- Canonicalise remaining prefixed ids so future inbound echoes dedupe cleanly.
UPDATE public.chat_messages
SET uaz_msg_id = upper(split_part(uaz_msg_id, '_', array_length(string_to_array(uaz_msg_id, '_'), 1)))
WHERE uaz_msg_id ~ '^true_[^_]+_[A-Fa-f0-9]{16,}$';
