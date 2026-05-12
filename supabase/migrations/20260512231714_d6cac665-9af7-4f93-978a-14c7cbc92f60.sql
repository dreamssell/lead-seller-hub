
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL,
  record_label text,
  changes jsonb,
  changed_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_table ON public.audit_logs(table_name, created_at DESC);
CREATE INDEX idx_audit_logs_user ON public.audit_logs(changed_by, created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_select_own_or_admin" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (auth.uid() = changed_by OR has_role(auth.uid(),'admin'));

CREATE POLICY "audit_insert_self" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = changed_by);
