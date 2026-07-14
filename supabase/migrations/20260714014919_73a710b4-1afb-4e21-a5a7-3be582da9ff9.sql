
-- Rascunhos persistidos por (customer, usuário)
CREATE TABLE public.chat_drafts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_drafts TO authenticated;
GRANT ALL ON public.chat_drafts TO service_role;

ALTER TABLE public.chat_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_drafts_all" ON public.chat_drafts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER chat_drafts_updated_at
BEFORE UPDATE ON public.chat_drafts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Assinatura de atendente
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signature text,
  ADD COLUMN IF NOT EXISTS signature_enabled boolean NOT NULL DEFAULT false;
