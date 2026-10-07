BEGIN;

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created_id_desc
  ON public.chat_messages (room_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_admin_direct_messages_thread_created_id_desc
  ON public.admin_direct_messages (thread_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.get_chat_thread_messages_page(
  p_room_id uuid,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 51
)
RETURNS TABLE (
  id uuid,
  room_id uuid,
  sender_id uuid,
  sender_name text,
  sender_avatar_url text,
  sender_role public.user_role,
  body text,
  read_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_chat_room(p_room_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'invalid_cursor' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    message.id,
    message.room_id,
    message.sender_id,
    CASE message.sender_role
      WHEN 'admin'::public.user_role THEN 'Pass on English'
      WHEN 'teacher'::public.user_role THEN
        COALESCE(NULLIF(BTRIM(teacher.display_name), ''), NULLIF(BTRIM(profile.full_name), ''), 'Teacher')
      ELSE
        COALESCE(
          NULLIF(BTRIM(student.english_name), ''),
          NULLIF(BTRIM(student.full_name), ''),
          NULLIF(BTRIM(profile.full_name), ''),
          'Student'
        )
    END AS sender_name,
    profile.avatar_url AS sender_avatar_url,
    message.sender_role,
    message.body,
    message.read_at,
    message.created_at
  FROM public.chat_messages message
  LEFT JOIN public.profiles profile ON profile.id = message.sender_id
  LEFT JOIN public.teachers teacher
    ON teacher.id = message.sender_id
    AND message.sender_role = 'teacher'::public.user_role
  LEFT JOIN LATERAL (
    SELECT s.english_name, s.full_name
    FROM public.students s
    WHERE s.account_holder_id = message.sender_id
    ORDER BY s.created_at ASC
    LIMIT 1
  ) student ON message.sender_role = 'student'::public.user_role
  WHERE message.room_id = p_room_id
    AND (
      p_before_created_at IS NULL
      OR message.created_at < p_before_created_at
      OR (message.created_at = p_before_created_at AND message.id < p_before_id)
    )
  ORDER BY message.created_at DESC, message.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 51), 1), 101);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_direct_thread_messages_page(
  p_thread_id uuid,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 51
)
RETURNS TABLE (
  id uuid,
  thread_id uuid,
  sender_role text,
  sender_id uuid,
  body text,
  read_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_admin_direct_thread(p_thread_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'invalid_cursor' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    message.id,
    message.thread_id,
    message.sender_role,
    message.sender_id,
    message.body,
    message.read_at,
    message.created_at
  FROM public.admin_direct_messages message
  WHERE message.thread_id = p_thread_id
    AND (
      p_before_created_at IS NULL
      OR message.created_at < p_before_created_at
      OR (message.created_at = p_before_created_at AND message.id < p_before_id)
    )
  ORDER BY message.created_at DESC, message.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 51), 1), 101);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_chat_thread_messages_page(uuid, timestamptz, uuid, integer)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_direct_thread_messages_page(uuid, timestamptz, uuid, integer)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_chat_thread_messages_page(uuid, timestamptz, uuid, integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_direct_thread_messages_page(uuid, timestamptz, uuid, integer)
  TO authenticated, service_role;

ALTER FUNCTION public.get_chat_thread_messages_page(uuid, timestamptz, uuid, integer) OWNER TO postgres;
ALTER FUNCTION public.get_admin_direct_thread_messages_page(uuid, timestamptz, uuid, integer) OWNER TO postgres;

COMMIT;
