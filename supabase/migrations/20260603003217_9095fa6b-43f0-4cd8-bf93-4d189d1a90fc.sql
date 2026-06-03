-- Add idempotency columns to chat_messages
ALTER TABLE public.chat_messages 
ADD COLUMN uaz_msg_id TEXT UNIQUE,
ADD COLUMN client_msg_id TEXT UNIQUE;

-- Create index for faster lookups
CREATE INDEX idx_chat_messages_uaz_id ON public.chat_messages(uaz_msg_id);
CREATE INDEX idx_chat_messages_client_id ON public.chat_messages(client_msg_id);

-- Ensure we can store idempotency keys in uaz_audit_logs if not already there
-- (Already exists in the prior migration schema, but let's be sure about the columns used for search)
CREATE INDEX IF NOT EXISTS idx_uaz_logs_payload_client_id ON public.uaz_audit_logs ((payload->>'client_msg_id'));
