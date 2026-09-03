-- Short leases for visible chat rooms; no global presence broadcast or publication.
BEGIN;

CREATE TABLE public.chat_room_presence (
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (room_id, user_id, client_id)
);
CREATE INDEX chat_room_presence_user_expiry ON public.chat_room_presence(user_id, expires_at);
ALTER TABLE public.chat_room_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_room_presence FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.chat_room_presence TO service_role;

CREATE FUNCTION public.set_chat_presence(p_room_id uuid, p_client_id uuid, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  viewer_id uuid := auth.uid();
BEGIN
  IF viewer_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  IF p_client_id IS NULL OR p_active IS NULL OR p_room_id IS NULL THEN
    RAISE EXCEPTION 'invalid_presence' USING ERRCODE = '22023';
  END IF;
  -- Expired rows are inert and are cleaned on the user's next presence update.
  DELETE FROM public.chat_room_presence WHERE user_id = viewer_id AND expires_at <= now();
  IF NOT p_active THEN
    DELETE FROM public.chat_room_presence
    WHERE room_id = p_room_id AND user_id = viewer_id AND client_id = p_client_id;
    RETURN;
  END IF;
  IF NOT public.can_access_chat_room(p_room_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.chat_room_presence(room_id, user_id, client_id, expires_at)
  VALUES (p_room_id, viewer_id, p_client_id, now() + interval '90 seconds')
  ON CONFLICT (room_id, user_id, client_id) DO UPDATE SET expires_at = EXCLUDED.expires_at;
END;
$$;

-- Derive recipients from an already-persisted message, never from a client userId.
-- At most two small rows, including locale and whether the recipient is viewing.
CREATE FUNCTION public.get_chat_push_recipients(p_message_id uuid)
RETURNS TABLE(user_id uuid, portal_role text, locale text, room_id uuid, viewing boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT profile.id, profile.role::text, profile.locale, room.id,
    EXISTS (
      SELECT 1 FROM public.chat_room_presence presence
      WHERE presence.room_id = room.id AND presence.user_id = profile.id
        AND presence.expires_at > now()
    )
  FROM public.chat_messages message
  JOIN public.chat_rooms room ON room.id = message.room_id
  JOIN public.students student ON student.id = room.student_id
  JOIN public.profiles profile ON profile.id IN (student.account_holder_id, room.teacher_id)
  WHERE message.id = p_message_id AND profile.id <> message.sender_id
    AND profile.role::text IN ('student', 'teacher')
    AND (message.sender_role::text = 'admin' OR profile.role <> message.sender_role);
$$;

REVOKE ALL ON FUNCTION public.set_chat_presence(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_chat_presence(uuid, uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.get_chat_push_recipients(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_chat_push_recipients(uuid) TO service_role;
ALTER FUNCTION public.set_chat_presence(uuid, uuid, boolean) OWNER TO postgres;
ALTER FUNCTION public.get_chat_push_recipients(uuid) OWNER TO postgres;

COMMIT;
