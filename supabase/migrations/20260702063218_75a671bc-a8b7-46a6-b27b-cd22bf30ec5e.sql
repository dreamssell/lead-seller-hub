
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS correlation_id text;

CREATE INDEX IF NOT EXISTS chat_messages_correlation_id_idx
  ON public.chat_messages (correlation_id);

CREATE TABLE IF NOT EXISTS public.chat_message_deadletter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id text,
  customer_id uuid,
  owner_id uuid,
  connection_id uuid,
  channel text,
  content text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  last_error_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_message_deadletter TO authenticated;
GRANT ALL ON public.chat_message_deadletter TO service_role;

ALTER TABLE public.chat_message_deadletter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dl_owner_or_admin_select"
  ON public.chat_message_deadletter
  FOR SELECT TO authenticated
  USING (
    auth.uid() = owner_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid() AND a.owner_id = public.chat_message_deadletter.owner_id
    )
  );

CREATE POLICY "dl_owner_or_admin_write"
  ON public.chat_message_deadletter
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = owner_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "dl_owner_or_admin_update"
  ON public.chat_message_deadletter
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = owner_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE INDEX IF NOT EXISTS chat_message_deadletter_owner_idx
  ON public.chat_message_deadletter (owner_id, created_at DESC);
