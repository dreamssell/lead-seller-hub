CREATE OR REPLACE FUNCTION public.log_message_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_sub uuid;
  v_stage text;
  v_old_status text;
  v_new_status text;
BEGIN
  SELECT owner_id, sub_company_id INTO v_owner, v_sub
    FROM public.customers WHERE id = NEW.customer_id;

  v_new_status := COALESCE(
    NULLIF(NEW.metadata->>'delivery_status', ''),
    NULLIF(NEW.metadata->>'status', ''),
    CASE WHEN NEW.sender_type = 'client' THEN 'read' ELSE 'sent' END
  );

  IF TG_OP = 'INSERT' THEN
    v_stage := CASE
      WHEN v_new_status = 'sending' THEN 'composed'
      WHEN v_new_status IN ('sent','delivered') THEN 'provider_sent'
      WHEN v_new_status IN ('failed','error') THEN 'failed'
      WHEN NEW.sender_type = 'client' THEN 'read'
      ELSE 'composed'
    END;

    INSERT INTO public.message_events(message_id, correlation_id, customer_id, owner_id, sub_company_id, stage, status, detail)
    VALUES (NEW.id, NEW.correlation_id, NEW.customer_id, v_owner, v_sub, v_stage, v_new_status,
            jsonb_build_object('sender_type', NEW.sender_type, 'channel', NEW.channel));
    RETURN NEW;
  END IF;

  v_old_status := COALESCE(
    NULLIF(OLD.metadata->>'delivery_status', ''),
    NULLIF(OLD.metadata->>'status', ''),
    CASE WHEN OLD.sender_type = 'client' THEN 'read' ELSE 'sent' END
  );

  IF TG_OP = 'UPDATE' AND COALESCE(v_old_status,'') <> COALESCE(v_new_status,'') THEN
    v_stage := CASE v_new_status
      WHEN 'sent' THEN 'provider_ack'
      WHEN 'delivered' THEN 'delivered'
      WHEN 'read' THEN 'read'
      WHEN 'failed' THEN 'failed'
      WHEN 'error' THEN 'failed'
      ELSE 'queued'
    END;

    INSERT INTO public.message_events(message_id, correlation_id, customer_id, owner_id, sub_company_id, stage, status, detail)
    VALUES (NEW.id, NEW.correlation_id, NEW.customer_id, v_owner, v_sub, v_stage, v_new_status,
            jsonb_build_object('from', v_old_status, 'to', v_new_status));
  END IF;

  RETURN NEW;
END;
$function$;