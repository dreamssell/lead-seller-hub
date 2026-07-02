
-- Fix Evolution/WhatsApp integration multi-tenancy:
-- Drop the single-provider unique constraint so each sub-empresa can hold its
-- own Evolution/UAZ/Meta instance, replacing it with a composite uniqueness
-- key that scopes by owner and sub-empresa.
ALTER TABLE public.whatsapp_connections
  DROP CONSTRAINT IF EXISTS whatsapp_connections_provider_key;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_connections_provider_scope_uidx
  ON public.whatsapp_connections (
    provider,
    COALESCE(owner_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(sub_company_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS whatsapp_connections_owner_idx
  ON public.whatsapp_connections (owner_id);
CREATE INDEX IF NOT EXISTS whatsapp_connections_sub_company_idx
  ON public.whatsapp_connections (sub_company_id);
