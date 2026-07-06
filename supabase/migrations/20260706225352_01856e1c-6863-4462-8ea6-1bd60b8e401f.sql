-- 1) Tabela de relatórios de erro
CREATE TABLE IF NOT EXISTS public.error_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_id UUID NULL,
  sub_company_id UUID NULL,
  path TEXT NULL,
  route TEXT NULL,
  message TEXT NOT NULL,
  stack TEXT NULL,
  component_stack TEXT NULL,
  severity TEXT NOT NULL DEFAULT 'error',
  source TEXT NOT NULL DEFAULT 'react',
  user_agent TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) GRANTs (Data API)
GRANT INSERT ON public.error_reports TO authenticated;
GRANT SELECT ON public.error_reports TO authenticated;
GRANT ALL ON public.error_reports TO service_role;

-- 3) RLS
ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário logado pode inserir (o próprio user_id, ou NULL se acontecer antes do login).
CREATE POLICY "any_authenticated_can_insert_error"
  ON public.error_reports FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Somente o admin da plataforma pode ler tudo.
CREATE POLICY "platform_admin_reads_all_errors"
  ON public.error_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4) Índices
CREATE INDEX IF NOT EXISTS error_reports_created_idx ON public.error_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS error_reports_owner_idx   ON public.error_reports (owner_id);

-- 5) Trigger: notifica todos os admins da plataforma
CREATE OR REPLACE FUNCTION public.notify_admins_on_error()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin RECORD;
  v_title TEXT;
  v_body  TEXT;
BEGIN
  v_title := '⚠️ Erro na plataforma: ' || left(NEW.message, 120);
  v_body  := 'Rota: ' || COALESCE(NEW.route, NEW.path, '—')
             || ' · Usuário: ' || COALESCE(NEW.user_id::text, 'anônimo')
             || CASE WHEN NEW.owner_id IS NOT NULL THEN ' · Conta: ' || NEW.owner_id::text ELSE '' END;

  FOR v_admin IN
    SELECT DISTINCT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'::app_role
  LOOP
    INSERT INTO public.notifications(user_id, owner_id, type, title, body, metadata)
    VALUES (
      v_admin.user_id,
      v_admin.user_id,
      'platform_error',
      v_title,
      v_body,
      jsonb_build_object(
        'error_report_id', NEW.id,
        'severity', NEW.severity,
        'source', NEW.source,
        'path', NEW.path,
        'route', NEW.route,
        'user_id', NEW.user_id,
        'owner_id', NEW.owner_id,
        'sub_company_id', NEW.sub_company_id,
        'user_agent', NEW.user_agent
      )
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_on_error ON public.error_reports;
CREATE TRIGGER trg_notify_admins_on_error
AFTER INSERT ON public.error_reports
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_error();