
-- Audit table for internal comms
CREATE TABLE public.internal_comms_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  sub_company_id uuid,
  actor_id uuid NOT NULL,
  target_user_id uuid,
  message_id uuid,
  action text NOT NULL CHECK (action IN ('message_sent','message_read','message_deleted')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ica_owner_created ON public.internal_comms_audit(owner_id, created_at DESC);
CREATE INDEX idx_ica_actor ON public.internal_comms_audit(actor_id, created_at DESC);
CREATE INDEX idx_ica_action ON public.internal_comms_audit(action, created_at DESC);

GRANT SELECT, INSERT ON public.internal_comms_audit TO authenticated;
GRANT ALL ON public.internal_comms_audit TO service_role;

ALTER TABLE public.internal_comms_audit ENABLE ROW LEVEL SECURITY;

-- Read: platform admin (has_role admin) OR account admin of same owner scope OR actor themselves
CREATE POLICY ica_select ON public.internal_comms_audit
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR actor_id = auth.uid()
    OR target_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_account_access ua
      WHERE ua.user_id = auth.uid()
        AND ua.owner_id = internal_comms_audit.owner_id
        AND ua.sub_company_id IS NOT DISTINCT FROM internal_comms_audit.sub_company_id
        AND ua.is_account_admin = true
    )
  );

-- Insert only via triggers (definer). Block direct client insert unless actor is self.
CREATE POLICY ica_insert_self ON public.internal_comms_audit
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- Trigger: log message_sent on INSERT of internal_messages
CREATE OR REPLACE FUNCTION public.log_internal_message_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.internal_comms_audit(owner_id, sub_company_id, actor_id, target_user_id, message_id, action, metadata)
  VALUES (
    NEW.owner_id, NEW.sub_company_id, NEW.sender_id, NEW.recipient_id, NEW.id, 'message_sent',
    jsonb_build_object('length', length(NEW.content))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_internal_message_sent
AFTER INSERT ON public.internal_messages
FOR EACH ROW EXECUTE FUNCTION public.log_internal_message_sent();

-- Trigger: log message_read when read_at goes from NULL to non-null
CREATE OR REPLACE FUNCTION public.log_internal_message_read()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.read_at IS NULL AND NEW.read_at IS NOT NULL THEN
    INSERT INTO public.internal_comms_audit(owner_id, sub_company_id, actor_id, target_user_id, message_id, action, metadata)
    VALUES (
      NEW.owner_id, NEW.sub_company_id, NEW.recipient_id, NEW.sender_id, NEW.id, 'message_read',
      jsonb_build_object('read_at', NEW.read_at)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_internal_message_read
AFTER UPDATE OF read_at ON public.internal_messages
FOR EACH ROW EXECUTE FUNCTION public.log_internal_message_read();

-- RPC: unread counts per peer for current user
CREATE OR REPLACE FUNCTION public.internal_comms_unread_counts()
RETURNS TABLE(peer_id uuid, unread_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sender_id AS peer_id, count(*) AS unread_count
  FROM public.internal_messages
  WHERE recipient_id = auth.uid()
    AND read_at IS NULL
  GROUP BY sender_id;
$$;

REVOKE ALL ON FUNCTION public.internal_comms_unread_counts() FROM public;
GRANT EXECUTE ON FUNCTION public.internal_comms_unread_counts() TO authenticated;

-- Realtime for audit
ALTER TABLE public.internal_comms_audit REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_comms_audit;
