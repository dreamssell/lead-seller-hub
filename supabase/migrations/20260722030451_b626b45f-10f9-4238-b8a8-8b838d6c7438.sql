
-- Notificações do sino para tickets de suporte
CREATE OR REPLACE FUNCTION public.notify_ticket_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_label text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_label := CASE NEW.status
      WHEN 'novo' THEN 'aberto'
      WHEN 'em_analise' THEN 'em análise'
      WHEN 'aguardando_cliente' THEN 'aguardando você'
      WHEN 'resolvido' THEN 'resolvido'
      WHEN 'fechado' THEN 'fechado'
      WHEN 'cancelado' THEN 'cancelado'
      ELSE NEW.status::text
    END;
    INSERT INTO public.notifications (user_id, owner_id, sub_company_id, type, title, body, channel, source, metadata)
    VALUES (
      NEW.user_id, NEW.owner_id, NEW.sub_company_id,
      'ticket_status',
      'Ticket #' || lpad(NEW.number::text, 5, '0') || ' — ' || v_label,
      NEW.title,
      'Suporte', 'ticket',
      jsonb_build_object('ticket_id', NEW.id, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_ticket_status ON public.support_tickets;
CREATE TRIGGER trg_notify_ticket_status
AFTER UPDATE OF status ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_status_change();

CREATE OR REPLACE FUNCTION public.notify_ticket_new_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_ticket public.support_tickets%ROWTYPE;
  v_sender_name text;
BEGIN
  IF COALESCE(NEW.is_internal_note, false) THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF NOT FOUND OR v_ticket.user_id = NEW.sender_id THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(display_name, email, 'Suporte') INTO v_sender_name
    FROM public.profiles WHERE user_id = NEW.sender_id;
  INSERT INTO public.notifications (user_id, owner_id, sub_company_id, type, title, body, channel, source, metadata)
  VALUES (
    v_ticket.user_id, v_ticket.owner_id, v_ticket.sub_company_id,
    'ticket_reply',
    'Nova resposta no ticket #' || lpad(v_ticket.number::text, 5, '0'),
    COALESCE(v_sender_name, 'Suporte') || ': ' || left(COALESCE(NEW.content, ''), 140),
    'Suporte', 'ticket',
    jsonb_build_object('ticket_id', v_ticket.id, 'message_id', NEW.id)
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_ticket_message ON public.support_ticket_messages;
CREATE TRIGGER trg_notify_ticket_message
AFTER INSERT ON public.support_ticket_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_new_message();
