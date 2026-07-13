
-- Etapa 7 — Labels/Etiquetas e organização de chats (WAHA)

-- chat_tags: mapeamento com etiquetas nativas do WhatsApp/WAHA
ALTER TABLE public.chat_tags
  ADD COLUMN IF NOT EXISTS waha_label_id text,
  ADD COLUMN IF NOT EXISTS sub_company_id uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS chat_tags_owner_waha_label_uidx
  ON public.chat_tags(owner_id, waha_label_id)
  WHERE waha_label_id IS NOT NULL;

-- customers: organização de chats (arquivar, silenciar, etiquetas selecionadas)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_muted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS muted_until timestamptz,
  ADD COLUMN IF NOT EXISTS label_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];

CREATE INDEX IF NOT EXISTS customers_label_ids_gin ON public.customers USING GIN (label_ids);
CREATE INDEX IF NOT EXISTS customers_owner_archived_idx ON public.customers(owner_id, is_archived);

-- Realtime para chat_tags (etiquetas em tempo real entre atendentes)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_tags;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
