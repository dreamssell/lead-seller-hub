
-- Remove client read access to invite_token; only host/admin can fetch it via accessor
REVOKE SELECT (invite_token) ON public.video_rooms FROM authenticated, anon;
GRANT SELECT (invite_token) ON public.video_rooms TO service_role;

CREATE OR REPLACE FUNCTION public.get_room_invite_token(p_room_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_host uuid;
  v_token text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT host_id, invite_token INTO v_host, v_token
  FROM public.video_rooms
  WHERE id = p_room_id;

  IF v_host IS NULL THEN
    RAISE EXCEPTION 'room_not_found';
  END IF;

  IF v_host <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  RETURN v_token;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_room_invite_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_invite_token(uuid) TO authenticated;
