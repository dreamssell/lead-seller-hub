
CREATE TABLE public.customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  author_id uuid NOT NULL,
  author_name text,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_notes TO authenticated;
GRANT ALL ON public.customer_notes TO service_role;
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team can read notes" ON public.customer_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can add notes" ON public.customer_notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors can update own notes" ON public.customer_notes FOR UPDATE TO authenticated USING (auth.uid() = author_id);
CREATE POLICY "Authors can delete own notes" ON public.customer_notes FOR DELETE TO authenticated USING (auth.uid() = author_id);
CREATE INDEX idx_customer_notes_customer ON public.customer_notes(customer_id, created_at DESC);

CREATE TABLE public.quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortcut text NOT NULL,
  content text NOT NULL,
  category text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quick_replies TO authenticated;
GRANT ALL ON public.quick_replies TO service_role;
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team can read quick replies" ON public.quick_replies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Team can insert quick replies" ON public.quick_replies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Team can update quick replies" ON public.quick_replies FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Team can delete quick replies" ON public.quick_replies FOR DELETE TO authenticated USING (true);
CREATE TRIGGER trg_quick_replies_updated_at BEFORE UPDATE ON public.quick_replies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
