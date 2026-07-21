
ALTER TABLE public.internal_messages
  ADD COLUMN IF NOT EXISTS attachment_original_url text,
  ADD COLUMN IF NOT EXISTS attachment_original_size bigint;
