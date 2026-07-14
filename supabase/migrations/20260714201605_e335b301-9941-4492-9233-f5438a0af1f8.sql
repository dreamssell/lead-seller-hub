
-- 1) Merge duplicate customers per (owner_id, phone). Canonical = oldest row.
DO $$
DECLARE
  r RECORD;
  canonical_id UUID;
  dup_ids UUID[];
BEGIN
  FOR r IN
    SELECT owner_id, phone
    FROM public.customers
    WHERE phone IS NOT NULL AND phone <> '' AND owner_id IS NOT NULL
    GROUP BY owner_id, phone
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO canonical_id
    FROM public.customers
    WHERE owner_id = r.owner_id AND phone = r.phone
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    SELECT ARRAY_AGG(id) INTO dup_ids
    FROM public.customers
    WHERE owner_id = r.owner_id AND phone = r.phone AND id <> canonical_id;

    -- Repoint every referencing table to the canonical customer.
    UPDATE public.chat_messages                SET customer_id = canonical_id WHERE customer_id = ANY(dup_ids);
    UPDATE public.call_history                 SET customer_id = canonical_id WHERE customer_id = ANY(dup_ids);
    UPDATE public.chat_drafts                  SET customer_id = canonical_id WHERE customer_id = ANY(dup_ids);
    UPDATE public.chat_pinned_messages         SET customer_id = canonical_id WHERE customer_id = ANY(dup_ids);
    UPDATE public.chat_starred_messages        SET customer_id = canonical_id WHERE customer_id = ANY(dup_ids);
    UPDATE public.conversation_assignments     SET customer_id = canonical_id WHERE customer_id = ANY(dup_ids);
    UPDATE public.conversation_markers         SET customer_id = canonical_id WHERE customer_id = ANY(dup_ids);
    UPDATE public.customer_assignments_history SET customer_id = canonical_id WHERE customer_id = ANY(dup_ids);
    UPDATE public.leads                        SET customer_id = canonical_id WHERE customer_id = ANY(dup_ids);
    UPDATE public.message_ai_analysis          SET customer_id = canonical_id WHERE customer_id = ANY(dup_ids);
    UPDATE public.pinned_conversations         SET customer_id = canonical_id WHERE customer_id = ANY(dup_ids);
    UPDATE public.supervisor_whispers          SET customer_id = canonical_id WHERE customer_id = ANY(dup_ids);
    UPDATE public.uaz_incidents                SET customer_id = canonical_id WHERE customer_id = ANY(dup_ids);
    UPDATE public.auto_followups               SET customer_id = canonical_id WHERE customer_id = ANY(dup_ids);
    UPDATE public.customer_notes               SET customer_id = canonical_id WHERE customer_id = ANY(dup_ids);

    -- Delete now-empty duplicates.
    DELETE FROM public.customers WHERE id = ANY(dup_ids);
  END LOOP;
END $$;

-- 2) Prevent future duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS customers_owner_phone_uniq
  ON public.customers (owner_id, phone)
  WHERE phone IS NOT NULL AND phone <> '';

-- 3) Idempotency observability: track parallel hits on the same key.
ALTER TABLE public.webhook_idempotency_keys
  ADD COLUMN IF NOT EXISTS hit_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_hit_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.webhook_idempotency_hits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  source TEXT,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.webhook_idempotency_hits TO authenticated;
GRANT ALL    ON public.webhook_idempotency_hits TO service_role;

ALTER TABLE public.webhook_idempotency_hits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view idempotency hits" ON public.webhook_idempotency_hits;
CREATE POLICY "Admins view idempotency hits"
  ON public.webhook_idempotency_hits FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_hits_lookup
  ON public.webhook_idempotency_hits (webhook_id, idempotency_key, created_at DESC);
