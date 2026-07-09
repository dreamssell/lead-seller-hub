-- ============================================================
-- Onda 2.1 — RLS hardening
-- ============================================================

-- customer_notes: leitura restrita ao tenant do cliente
DROP POLICY IF EXISTS "Team can read notes" ON public.customer_notes;
CREATE POLICY "Team reads notes within tenant"
  ON public.customer_notes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_notes.customer_id
        AND (
          auth.uid() = c.created_by
          OR auth.uid() = c.owner_id
          OR public.has_role(auth.uid(), 'admin'::app_role)
          OR EXISTS (
            SELECT 1 FROM public.user_account_access a
            WHERE a.user_id = auth.uid()
              AND a.owner_id = COALESCE(c.owner_id, c.created_by)
              AND (a.sub_company_id IS NULL OR a.sub_company_id = c.sub_company_id)
          )
        )
    )
  );

-- Também restringe INSERT/UPDATE/DELETE ao tenant do cliente
DROP POLICY IF EXISTS "Authenticated can add notes" ON public.customer_notes;
CREATE POLICY "Tenant users can add notes"
  ON public.customer_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_notes.customer_id
        AND (
          auth.uid() = c.created_by
          OR auth.uid() = c.owner_id
          OR public.has_role(auth.uid(), 'admin'::app_role)
          OR EXISTS (
            SELECT 1 FROM public.user_account_access a
            WHERE a.user_id = auth.uid()
              AND a.owner_id = COALESCE(c.owner_id, c.created_by)
              AND (a.sub_company_id IS NULL OR a.sub_company_id = c.sub_company_id)
          )
        )
    )
  );

-- company_settings: SELECT só admin (remove leitura pública "true")
DROP POLICY IF EXISTS "Authenticated can view company settings" ON public.company_settings;
CREATE POLICY "Admins view company settings"
  ON public.company_settings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- video_error_logs: INSERT restringe user_id ao próprio auth.uid()
DROP POLICY IF EXISTS "Authenticated users can insert error logs" ON public.video_error_logs;
CREATE POLICY "Users insert own error logs"
  ON public.video_error_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND (user_id IS NULL OR user_id = auth.uid()));

-- ============================================================
-- Onda 2.2 — Índices compostos para performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant_created
  ON public.chat_messages (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_created
  ON public.customers (owner_id, sub_company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_created
  ON public.leads (owner_id, sub_company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_history_tenant_created
  ON public.call_history (owner_id, sub_company_id, created_at DESC);

-- ============================================================
-- Onda 2.3 — correlation_id + message_events
-- ============================================================
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS correlation_id text;
CREATE INDEX IF NOT EXISTS idx_chat_messages_correlation
  ON public.chat_messages (correlation_id) WHERE correlation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.message_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  correlation_id text,
  customer_id uuid,
  owner_id uuid,
  sub_company_id uuid,
  stage text NOT NULL CHECK (stage IN ('composed','queued','provider_sent','provider_ack','delivered','read','failed')),
  status text,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.message_events TO authenticated;
GRANT ALL ON public.message_events TO service_role;

ALTER TABLE public.message_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users read message events"
  ON public.message_events FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid() = owner_id
    OR EXISTS (
      SELECT 1 FROM public.user_account_access a
      WHERE a.user_id = auth.uid()
        AND a.owner_id = message_events.owner_id
        AND (a.sub_company_id IS NULL OR a.sub_company_id = message_events.sub_company_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = message_events.customer_id
        AND (c.owner_id = auth.uid() OR c.created_by = auth.uid())
    )
  );

CREATE POLICY "Tenant users insert message events"
  ON public.message_events FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_message_events_message ON public.message_events (message_id, created_at);
CREATE INDEX IF NOT EXISTS idx_message_events_correlation ON public.message_events (correlation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_message_events_tenant ON public.message_events (owner_id, sub_company_id, created_at DESC);

-- Trigger para popular message_events automaticamente a partir de chat_messages
CREATE OR REPLACE FUNCTION public.log_message_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_sub uuid;
  v_stage text;
BEGIN
  SELECT owner_id, sub_company_id INTO v_owner, v_sub
    FROM public.customers WHERE id = NEW.customer_id;

  IF TG_OP = 'INSERT' THEN
    v_stage := CASE
      WHEN NEW.delivery_status = 'sending' THEN 'composed'
      WHEN NEW.delivery_status IN ('sent','delivered') THEN 'provider_sent'
      WHEN NEW.delivery_status = 'failed' THEN 'failed'
      ELSE 'composed'
    END;
    INSERT INTO public.message_events(message_id, correlation_id, customer_id, owner_id, sub_company_id, stage, status, detail)
    VALUES (NEW.id, NEW.correlation_id, NEW.customer_id, v_owner, v_sub, v_stage, NEW.delivery_status,
            jsonb_build_object('sender_type', NEW.sender_type, 'channel', NEW.channel));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.delivery_status,'') <> COALESCE(NEW.delivery_status,'') THEN
    v_stage := CASE NEW.delivery_status
      WHEN 'sent' THEN 'provider_ack'
      WHEN 'delivered' THEN 'delivered'
      WHEN 'read' THEN 'read'
      WHEN 'failed' THEN 'failed'
      ELSE 'queued'
    END;
    INSERT INTO public.message_events(message_id, correlation_id, customer_id, owner_id, sub_company_id, stage, status, detail)
    VALUES (NEW.id, NEW.correlation_id, NEW.customer_id, v_owner, v_sub, v_stage, NEW.delivery_status,
            jsonb_build_object('from', OLD.delivery_status, 'to', NEW.delivery_status));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_message_event ON public.chat_messages;
CREATE TRIGGER trg_log_message_event
  AFTER INSERT OR UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.log_message_event();

-- ============================================================
-- Onda 2.4 — Access health view
-- ============================================================
CREATE OR REPLACE VIEW public.v_account_access_health
WITH (security_invoker = on) AS
WITH orphan_owner_access AS (
  SELECT 'orphan_user_access'::text AS category,
         a.id::text AS ref_id,
         a.user_id,
         a.owner_id,
         a.sub_company_id,
         'Vínculo user_account_access aponta para owner_id inexistente em client_companies'::text AS message
    FROM public.user_account_access a
    LEFT JOIN public.client_companies cc ON cc.auth_user_id = a.owner_id
   WHERE cc.id IS NULL
),
missing_owner_access AS (
  SELECT 'company_without_admin'::text,
         cc.id::text,
         cc.auth_user_id,
         cc.auth_user_id,
         NULL::uuid,
         'Empresa titular sem linha em user_account_access nem role admin'::text
    FROM public.client_companies cc
    LEFT JOIN public.user_account_access a
           ON a.owner_id = cc.auth_user_id AND a.user_id = cc.auth_user_id
    LEFT JOIN public.user_roles r
           ON r.user_id = cc.auth_user_id AND r.role = 'admin'::app_role
   WHERE cc.auth_user_id IS NOT NULL
     AND a.id IS NULL
     AND r.role IS NULL
),
sub_without_admin AS (
  SELECT 'sub_company_without_admin'::text,
         s.id::text,
         NULL::uuid,
         s.owner_id,
         s.id,
         ('Sub-empresa "' || s.name || '" não possui nenhum admin ativo em user_account_access')::text
    FROM public.sub_companies s
   WHERE NOT EXISTS (
     SELECT 1 FROM public.user_account_access a
      WHERE a.sub_company_id = s.id AND a.is_account_admin = true
   )
),
titular_sem_ceo AS (
  SELECT 'titular_without_ceo_label'::text,
         cc.id::text,
         cc.auth_user_id,
         cc.auth_user_id,
         NULL::uuid,
         'Titular da empresa está sem o cargo CEO no perfil'::text
    FROM public.client_companies cc
    JOIN public.profiles p ON p.user_id = cc.auth_user_id
   WHERE cc.auth_user_id IS NOT NULL
     AND (p.role_label IS NULL OR p.role_label <> 'CEO')
)
SELECT * FROM orphan_owner_access
UNION ALL SELECT * FROM missing_owner_access
UNION ALL SELECT * FROM sub_without_admin
UNION ALL SELECT * FROM titular_sem_ceo;

GRANT SELECT ON public.v_account_access_health TO authenticated;

-- Função para o dono da plataforma consultar
CREATE OR REPLACE FUNCTION public.get_access_health()
RETURNS TABLE(category text, ref_id text, user_id uuid, owner_id uuid, sub_company_id uuid, message text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT v.category, v.ref_id, v.user_id, v.owner_id, v.sub_company_id, v.message
                 FROM public.v_account_access_health v;
END;
$$;