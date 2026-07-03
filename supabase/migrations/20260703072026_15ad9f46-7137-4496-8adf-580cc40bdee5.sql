DO $$
DECLARE uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email='gestor@leadseller.com';
  IF uid IS NULL THEN RETURN; END IF;

  UPDATE public.contacts SET created_by=NULL WHERE created_by=uid;
  UPDATE public.wavoip_filter_presets SET created_by=NULL WHERE created_by=uid;
  UPDATE public.wavoip_audit_logs SET replay_user_id=NULL WHERE replay_user_id=uid;
  UPDATE public.video_audit_logs SET performed_by=NULL WHERE performed_by=uid;
  DELETE FROM public.video_participants WHERE user_id=uid;
  DELETE FROM public.video_rooms WHERE host_id=uid;
  DELETE FROM public.signature_documents WHERE created_by=uid;

  DELETE FROM auth.users WHERE id=uid;
END $$;