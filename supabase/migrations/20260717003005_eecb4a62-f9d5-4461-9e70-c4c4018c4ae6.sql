
-- ============= Central de Ajuda (Suporte) =============
CREATE TYPE public.support_ticket_department AS ENUM ('administrativo','financeiro','ti');
CREATE TYPE public.support_ticket_priority AS ENUM ('baixa','media','alta','critica');
CREATE TYPE public.support_ticket_status AS ENUM ('novo','em_analise','aguardando_cliente','resolvido','fechado');

-- Sequência amigável para número do ticket (#1042)
CREATE SEQUENCE public.support_tickets_number_seq START 1001;

CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number BIGINT NOT NULL UNIQUE DEFAULT nextval('public.support_tickets_number_seq'),
  owner_id UUID NOT NULL,               -- Empresa proprietária (client_companies.auth_user_id)
  sub_company_id UUID REFERENCES public.sub_companies(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,                -- Quem abriu
  department public.support_ticket_department NOT NULL,
  priority public.support_ticket_priority NOT NULL DEFAULT 'media',
  status public.support_ticket_status NOT NULL DEFAULT 'novo',
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 3 AND 20000),
  assigned_to UUID,                     -- Membro da equipe master responsável
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  csat_rating INT CHECK (csat_rating BETWEEN 1 AND 5),
  csat_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX support_tickets_owner_idx ON public.support_tickets(owner_id, status);
CREATE INDEX support_tickets_status_idx ON public.support_tickets(status, priority, created_at DESC);
CREATE INDEX support_tickets_user_idx ON public.support_tickets(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
GRANT USAGE ON SEQUENCE public.support_tickets_number_seq TO authenticated, service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Ver: dono do ticket, colegas da mesma conta (owner/sub), ou admin plataforma
CREATE POLICY "ticket_select_scope" ON public.support_tickets FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.user_account_access a
     WHERE a.user_id = auth.uid()
       AND a.owner_id = support_tickets.owner_id
       AND (a.sub_company_id IS NULL OR a.sub_company_id = support_tickets.sub_company_id OR support_tickets.sub_company_id IS NULL)
  )
);

-- Insert: usuário autenticado abrindo em nome de si mesmo, no escopo real
CREATE POLICY "ticket_insert_self" ON public.support_tickets FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Update: admin plataforma (assigned_to, status, notas etc); dono/colega só pode atualizar próprio ticket (CSAT/fechar)
CREATE POLICY "ticket_update_admin" ON public.support_tickets FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "ticket_update_owner" ON public.support_tickets FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============= Mensagens =============
CREATE TABLE public.support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  is_internal_note BOOLEAN NOT NULL DEFAULT false,
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 20000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX support_ticket_messages_ticket_idx ON public.support_ticket_messages(ticket_id, created_at);

GRANT SELECT, INSERT ON public.support_ticket_messages TO authenticated;
GRANT ALL ON public.support_ticket_messages TO service_role;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- Ver mensagens: quem enxerga o ticket. Notas internas só para admin da plataforma
CREATE POLICY "ticket_msg_select" ON public.support_ticket_messages FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.support_tickets t
           WHERE t.id = ticket_id
             AND (
               public.has_role(auth.uid(),'admin')
               OR t.user_id = auth.uid()
               OR EXISTS (
                 SELECT 1 FROM public.user_account_access a
                  WHERE a.user_id = auth.uid()
                    AND a.owner_id = t.owner_id
                    AND (a.sub_company_id IS NULL OR a.sub_company_id = t.sub_company_id OR t.sub_company_id IS NULL)
               )
             )
         )
  AND (is_internal_note = false OR public.has_role(auth.uid(),'admin'))
);

-- Insert: sender_id = auth.uid; is_internal_note só admin plataforma; precisa ver o ticket
CREATE POLICY "ticket_msg_insert" ON public.support_ticket_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND (is_internal_note = false OR public.has_role(auth.uid(),'admin'))
  AND EXISTS (SELECT 1 FROM public.support_tickets t
               WHERE t.id = ticket_id
                 AND (
                   public.has_role(auth.uid(),'admin')
                   OR t.user_id = auth.uid()
                   OR EXISTS (
                     SELECT 1 FROM public.user_account_access a
                      WHERE a.user_id = auth.uid()
                        AND a.owner_id = t.owner_id
                        AND (a.sub_company_id IS NULL OR a.sub_company_id = t.sub_company_id OR t.sub_company_id IS NULL)
                   )
                 ))
);

-- ============= Anexos =============
CREATE TABLE public.support_ticket_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.support_ticket_messages(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0 AND file_size <= 209715200), -- 200MB
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX support_ticket_attachments_ticket_idx ON public.support_ticket_attachments(ticket_id);

GRANT SELECT, INSERT, DELETE ON public.support_ticket_attachments TO authenticated;
GRANT ALL ON public.support_ticket_attachments TO service_role;
ALTER TABLE public.support_ticket_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_att_select" ON public.support_ticket_attachments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.support_tickets t
                WHERE t.id = ticket_id
                  AND (public.has_role(auth.uid(),'admin')
                       OR t.user_id = auth.uid()
                       OR EXISTS (SELECT 1 FROM public.user_account_access a
                                   WHERE a.user_id = auth.uid()
                                     AND a.owner_id = t.owner_id
                                     AND (a.sub_company_id IS NULL OR a.sub_company_id = t.sub_company_id OR t.sub_company_id IS NULL)))));

CREATE POLICY "ticket_att_insert" ON public.support_ticket_attachments FOR INSERT TO authenticated
WITH CHECK (uploaded_by = auth.uid());

-- ============= Triggers =============
CREATE TRIGGER support_tickets_touch BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Atualiza last_activity_at quando entra mensagem
CREATE OR REPLACE FUNCTION public.support_ticket_bump_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
BEGIN
  UPDATE public.support_tickets SET last_activity_at = now(), updated_at = now() WHERE id = NEW.ticket_id;
  RETURN NEW;
END;$$;
CREATE TRIGGER support_ticket_bump AFTER INSERT ON public.support_ticket_messages
FOR EACH ROW EXECUTE FUNCTION public.support_ticket_bump_activity();

-- Notifica admins da plataforma quando ticket novo (in-app bell)
CREATE OR REPLACE FUNCTION public.notify_admins_new_ticket()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_admin RECORD; v_title TEXT; v_body TEXT;
BEGIN
  v_title := '🎧 Novo ticket #' || NEW.number || ' · ' || upper(NEW.priority::text);
  v_body := left(NEW.title, 160) || ' · Depto: ' || NEW.department::text;
  FOR v_admin IN SELECT DISTINCT user_id FROM public.user_roles WHERE role='admin'::app_role LOOP
    INSERT INTO public.notifications(user_id, owner_id, type, title, body, metadata)
    VALUES (v_admin.user_id, v_admin.user_id, 'support_ticket',
            v_title, v_body,
            jsonb_build_object('ticket_id', NEW.id, 'number', NEW.number,
                               'priority', NEW.priority, 'department', NEW.department,
                               'owner_id', NEW.owner_id, 'sub_company_id', NEW.sub_company_id,
                               'user_id', NEW.user_id));
  END LOOP;
  RETURN NEW;
END;$$;
CREATE TRIGGER support_ticket_notify_admins AFTER INSERT ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_new_ticket();

-- Notifica autor do ticket quando muda status ou recebe resposta pública do master
CREATE OR REPLACE FUNCTION public.notify_ticket_owner_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications(user_id, owner_id, type, title, body, metadata)
    VALUES (NEW.user_id, NEW.owner_id, 'support_ticket',
            'Ticket #' || NEW.number || ' agora está ' || NEW.status::text,
            left(NEW.title, 160),
            jsonb_build_object('ticket_id', NEW.id, 'number', NEW.number, 'status', NEW.status));
  END IF;
  RETURN NEW;
END;$$;
CREATE TRIGGER support_ticket_notify_owner AFTER UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_owner_status();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_messages;
