
CREATE TABLE public.internal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  sub_company_id uuid,
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  content text NOT NULL CHECK (length(content) > 0 AND length(content) <= 8000),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_im_thread ON public.internal_messages(owner_id, sender_id, recipient_id, created_at DESC);
CREATE INDEX idx_im_recipient_unread ON public.internal_messages(recipient_id) WHERE read_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_messages TO authenticated;
GRANT ALL ON public.internal_messages TO service_role;

ALTER TABLE public.internal_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.internal_comms_share_scope(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_account_access ua
    JOIN public.user_account_access ub
      ON ua.owner_id = ub.owner_id
     AND ua.sub_company_id IS NOT DISTINCT FROM ub.sub_company_id
    WHERE ua.user_id = _a
      AND ub.user_id = _b
  );
$$;

CREATE POLICY im_select ON public.internal_messages
  FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY im_insert ON public.internal_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND sender_id <> recipient_id
    AND public.internal_comms_share_scope(sender_id, recipient_id)
  );

CREATE POLICY im_update_recipient ON public.internal_messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

ALTER TABLE public.internal_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_messages;
