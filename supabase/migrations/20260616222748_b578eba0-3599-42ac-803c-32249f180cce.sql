CREATE TABLE IF NOT EXISTS public.user_ui_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  scope text NOT NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, owner_id, scope)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ui_state TO authenticated;
GRANT ALL ON public.user_ui_state TO service_role;

ALTER TABLE public.user_ui_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own ui state"
ON public.user_ui_state FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_user_ui_state_updated_at
BEFORE UPDATE ON public.user_ui_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_user_ui_state_lookup ON public.user_ui_state(user_id, owner_id, scope);