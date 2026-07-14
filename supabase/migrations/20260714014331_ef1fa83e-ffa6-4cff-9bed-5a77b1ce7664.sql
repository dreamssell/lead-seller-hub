
-- Etapa 8: Pin e Favoritos de mensagens no chat

CREATE TABLE IF NOT EXISTS public.chat_pinned_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  sub_company_id UUID,
  pinned_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_pinned_messages_message_unique UNIQUE (message_id)
);

CREATE INDEX IF NOT EXISTS chat_pinned_messages_conv_idx
  ON public.chat_pinned_messages (owner_id, customer_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_pinned_messages TO authenticated;
GRANT ALL ON public.chat_pinned_messages TO service_role;

ALTER TABLE public.chat_pinned_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view pinned messages in their scope"
  ON public.chat_pinned_messages FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_account_access uaa
      WHERE uaa.user_id = auth.uid()
        AND uaa.owner_id = chat_pinned_messages.owner_id
    )
  );

CREATE POLICY "Team can pin messages in their scope"
  ON public.chat_pinned_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    pinned_by = auth.uid()
    AND (
      owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_account_access uaa
        WHERE uaa.user_id = auth.uid()
          AND uaa.owner_id = chat_pinned_messages.owner_id
      )
    )
  );

CREATE POLICY "Team can unpin messages in their scope"
  ON public.chat_pinned_messages FOR DELETE
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_account_access uaa
      WHERE uaa.user_id = auth.uid()
        AND uaa.owner_id = chat_pinned_messages.owner_id
    )
  );


CREATE TABLE IF NOT EXISTS public.chat_starred_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_starred_messages_user_msg_unique UNIQUE (user_id, message_id)
);

CREATE INDEX IF NOT EXISTS chat_starred_messages_user_idx
  ON public.chat_starred_messages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_starred_messages_conv_idx
  ON public.chat_starred_messages (user_id, customer_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_starred_messages TO authenticated;
GRANT ALL ON public.chat_starred_messages TO service_role;

ALTER TABLE public.chat_starred_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own starred messages"
  ON public.chat_starred_messages FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can star their own messages"
  ON public.chat_starred_messages FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can unstar their own messages"
  ON public.chat_starred_messages FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_pinned_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_starred_messages;
