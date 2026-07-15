
DROP INDEX IF EXISTS public.idx_quick_replies_shortcut;
CREATE INDEX IF NOT EXISTS idx_quick_replies_shortcut ON public.quick_replies(created_by, shortcut) WHERE shortcut IS NOT NULL;
