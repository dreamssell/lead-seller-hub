-- =========================================================
-- 1) Full-text search on chat_messages
-- =========================================================
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('portuguese', coalesce(content, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS chat_messages_search_tsv_idx
  ON public.chat_messages USING gin (search_tsv);

CREATE INDEX IF NOT EXISTS chat_messages_customer_created_idx
  ON public.chat_messages (customer_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.search_chat_messages_global(
  p_query text,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  customer_id uuid,
  customer_name text,
  channel text,
  sender_type text,
  content text,
  created_at timestamptz,
  rank real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.customer_id, c.name AS customer_name, m.channel, m.sender_type,
         m.content, m.created_at,
         ts_rank(m.search_tsv, plainto_tsquery('portuguese', p_query)) AS rank
  FROM public.chat_messages m
  JOIN public.customers c ON c.id = m.customer_id
  WHERE m.search_tsv @@ plainto_tsquery('portuguese', p_query)
    AND (
      c.owner_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.user_account_access a
        WHERE a.user_id = auth.uid()
          AND a.owner_id = c.owner_id
      )
    )
  ORDER BY rank DESC, m.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200));
$$;

-- =========================================================
-- 2) Saved filters
-- =========================================================
CREATE TABLE IF NOT EXISTS public.saved_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id uuid,
  name text NOT NULL,
  icon text,
  color text,
  is_pinned boolean NOT NULL DEFAULT false,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_filters TO authenticated;
GRANT ALL ON public.saved_filters TO service_role;

ALTER TABLE public.saved_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_filters_owner_all"
  ON public.saved_filters FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER saved_filters_updated_at
  BEFORE UPDATE ON public.saved_filters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 3) Pinned conversations (per user)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.pinned_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, customer_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinned_conversations TO authenticated;
GRANT ALL ON public.pinned_conversations TO service_role;

ALTER TABLE public.pinned_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pinned_conversations_owner_all"
  ON public.pinned_conversations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =========================================================
-- 4) Custom conversation markers (per user, per message)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.conversation_markers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  label text NOT NULL,
  color text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_markers TO authenticated;
GRANT ALL ON public.conversation_markers TO service_role;

ALTER TABLE public.conversation_markers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversation_markers_owner_all"
  ON public.conversation_markers FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS conversation_markers_customer_idx
  ON public.conversation_markers (customer_id);

-- =========================================================
-- 5) Bot flows (visual triagem builder)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.bot_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sub_company_id uuid,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT false,
  trigger_channel text,
  trigger_keywords text[] NOT NULL DEFAULT ARRAY[]::text[],
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  edges jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_flows TO authenticated;
GRANT ALL ON public.bot_flows TO service_role;

ALTER TABLE public.bot_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bot_flows_owner_all"
  ON public.bot_flows FOR ALL
  USING (
    auth.uid() = owner_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = bot_flows.owner_id
        AND (a.sub_company_id = bot_flows.sub_company_id OR a.sub_company_id IS NULL)
    )
  )
  WITH CHECK (
    auth.uid() = owner_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER bot_flows_updated_at
  BEFORE UPDATE ON public.bot_flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 6) Message AI analysis (sentiment, tags, intent)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.message_ai_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  owner_id uuid,
  sentiment text,
  sentiment_score numeric,
  intent text,
  language text,
  suggested_tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  summary text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_ai_analysis TO authenticated;
GRANT ALL ON public.message_ai_analysis TO service_role;

ALTER TABLE public.message_ai_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "message_ai_analysis_owner_read"
  ON public.message_ai_analysis FOR SELECT
  USING (
    auth.uid() = owner_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = message_ai_analysis.owner_id
    )
  );

CREATE POLICY "message_ai_analysis_service_write"
  ON public.message_ai_analysis FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS message_ai_analysis_customer_idx
  ON public.message_ai_analysis (customer_id);

-- =========================================================
-- 7) Auto follow-ups
-- =========================================================
CREATE TABLE IF NOT EXISTS public.auto_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  scheduled_for timestamptz NOT NULL,
  message_template text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled', -- scheduled | sent | cancelled | failed
  sent_at timestamptz,
  cancelled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_followups TO authenticated;
GRANT ALL ON public.auto_followups TO service_role;

ALTER TABLE public.auto_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auto_followups_owner_all"
  ON public.auto_followups FOR ALL
  USING (
    auth.uid() = owner_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = auto_followups.owner_id
    )
  )
  WITH CHECK (
    auth.uid() = owner_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER auto_followups_updated_at
  BEFORE UPDATE ON public.auto_followups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS auto_followups_scheduled_idx
  ON public.auto_followups (status, scheduled_for);