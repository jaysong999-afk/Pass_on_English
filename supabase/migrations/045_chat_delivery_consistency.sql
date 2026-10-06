-- Keep chat delivery/read state correct without loading global message caches.

BEGIN;

-- A message can be observed independently by a student, teacher, and admin.
-- The legacy chat_messages.read_at column is retained for counterpart read receipts,
-- while inbox badges use this per-profile cursor.
CREATE TABLE IF NOT EXISTS public.chat_room_read_state (
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL,
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_room_read_state_user
  ON public.chat_room_read_state (user_id, room_id);

ALTER TABLE public.chat_room_read_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.chat_room_read_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.chat_room_read_state TO service_role;
DROP POLICY IF EXISTS rls_chat_room_read_state_internal_only ON public.chat_room_read_state;
CREATE POLICY rls_chat_room_read_state_internal_only ON public.chat_room_read_state
  FOR ALL USING (false) WITH CHECK (false);

-- Preserve the best available legacy read position for existing participants.
INSERT INTO public.chat_room_read_state (room_id, user_id, last_read_at)
SELECT
  room.id,
  student.account_holder_id,
  CASE
    WHEN COUNT(*) FILTER (WHERE message.read_at IS NULL) > 0
      THEN MIN(message.created_at) FILTER (WHERE message.read_at IS NULL) - interval '1 microsecond'
    ELSE MAX(message.created_at)
  END
FROM public.chat_rooms room
JOIN public.students student ON student.id = room.student_id
JOIN public.chat_messages message
  ON message.room_id = room.id
  AND message.sender_role <> 'student'::public.user_role
GROUP BY room.id, student.account_holder_id
ON CONFLICT (room_id, user_id) DO UPDATE
SET last_read_at = GREATEST(
  public.chat_room_read_state.last_read_at,
  EXCLUDED.last_read_at
);

INSERT INTO public.chat_room_read_state (room_id, user_id, last_read_at)
SELECT
  room.id,
  room.teacher_id,
  CASE
    WHEN COUNT(*) FILTER (WHERE message.read_at IS NULL) > 0
      THEN MIN(message.created_at) FILTER (WHERE message.read_at IS NULL) - interval '1 microsecond'
    ELSE MAX(message.created_at)
  END
FROM public.chat_rooms room
JOIN public.chat_messages message
  ON message.room_id = room.id
  AND message.sender_role <> 'teacher'::public.user_role
GROUP BY room.id, room.teacher_id
ON CONFLICT (room_id, user_id) DO UPDATE
SET last_read_at = GREATEST(
  public.chat_room_read_state.last_read_at,
  EXCLUDED.last_read_at
);

INSERT INTO public.chat_room_read_state (room_id, user_id, last_read_at)
SELECT
  room.id,
  admin.id,
  CASE
    WHEN COUNT(*) FILTER (WHERE message.read_at IS NULL) > 0
      THEN MIN(message.created_at) FILTER (WHERE message.read_at IS NULL) - interval '1 microsecond'
    ELSE MAX(message.created_at)
  END
FROM public.chat_rooms room
JOIN public.profiles admin ON admin.role = 'admin'::public.user_role
JOIN public.chat_messages message
  ON message.room_id = room.id
  AND message.sender_role <> 'admin'::public.user_role
GROUP BY room.id, admin.id
ON CONFLICT (room_id, user_id) DO UPDATE
SET last_read_at = GREATEST(
  public.chat_room_read_state.last_read_at,
  EXCLUDED.last_read_at
);

CREATE OR REPLACE FUNCTION public.mark_chat_room_read(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  viewer_id uuid := auth.uid();
  viewer_role public.user_role;
  read_timestamp timestamptz := clock_timestamp();
BEGIN
  IF viewer_id IS NULL OR NOT public.can_access_chat_room(p_room_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT profile.role
  INTO viewer_role
  FROM public.profiles profile
  WHERE profile.id = viewer_id;

  IF viewer_role IS NULL THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.chat_room_read_state (room_id, user_id, last_read_at)
  VALUES (p_room_id, viewer_id, read_timestamp)
  ON CONFLICT (room_id, user_id) DO UPDATE
  SET last_read_at = GREATEST(
    public.chat_room_read_state.last_read_at,
    EXCLUDED.last_read_at
  );

  -- Keep existing student/teacher read receipts working. Admin monitoring must
  -- never mark a participant's message as read by its actual counterpart.
  IF viewer_role <> 'admin'::public.user_role THEN
    UPDATE public.chat_messages message
    SET read_at = COALESCE(message.read_at, read_timestamp)
    WHERE message.room_id = p_room_id
      AND message.sender_role <> viewer_role
      AND message.read_at IS NULL;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_chat_inbox(p_student_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  teacher_id uuid,
  teacher_name text,
  student_id uuid,
  student_name text,
  display_name text,
  avatar_url text,
  teacher_avatar_url text,
  student_avatar_url text,
  last_message text,
  last_message_at timestamptz,
  unread bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH viewer AS (
    SELECT profile.id, profile.role, profile.active_student_id
    FROM public.profiles profile
    WHERE profile.id = auth.uid()
  )
  SELECT
    room.id,
    room.teacher_id,
    COALESCE(NULLIF(BTRIM(teacher.display_name), ''), 'Teacher') AS teacher_name,
    room.student_id,
    COALESCE(
      NULLIF(BTRIM(student.english_name), ''),
      NULLIF(BTRIM(student.full_name), ''),
      'Student'
    ) AS student_name,
    CASE viewer.role
      WHEN 'student'::public.user_role THEN
        COALESCE(NULLIF(BTRIM(teacher.display_name), ''), 'Teacher')
      WHEN 'teacher'::public.user_role THEN
        COALESCE(
          NULLIF(BTRIM(student.english_name), ''),
          NULLIF(BTRIM(student.full_name), ''),
          'Student'
        )
      ELSE
        COALESCE(NULLIF(BTRIM(student.english_name), ''), NULLIF(BTRIM(student.full_name), ''), 'Student')
        || ' · ' || COALESCE(NULLIF(BTRIM(teacher.display_name), ''), 'Teacher')
    END AS display_name,
    CASE viewer.role
      WHEN 'student'::public.user_role THEN teacher_profile.avatar_url
      WHEN 'teacher'::public.user_role THEN student_profile.avatar_url
      ELSE COALESCE(teacher_profile.avatar_url, student_profile.avatar_url)
    END AS avatar_url,
    teacher_profile.avatar_url AS teacher_avatar_url,
    student_profile.avatar_url AS student_avatar_url,
    COALESCE(latest.body, '') AS last_message,
    COALESCE(latest.created_at, room.last_message_at, room.created_at) AS last_message_at,
    COALESCE(unread_count.value, 0)::bigint AS unread
  FROM public.chat_rooms room
  CROSS JOIN viewer
  JOIN public.teachers teacher ON teacher.id = room.teacher_id
  JOIN public.students student ON student.id = room.student_id
  LEFT JOIN public.profiles teacher_profile ON teacher_profile.id = teacher.id
  LEFT JOIN public.profiles student_profile ON student_profile.id = student.account_holder_id
  LEFT JOIN public.chat_room_read_state read_state
    ON read_state.room_id = room.id
    AND read_state.user_id = viewer.id
  LEFT JOIN LATERAL (
    SELECT message.body, message.created_at
    FROM public.chat_messages message
    WHERE message.room_id = room.id
    ORDER BY message.created_at DESC
    LIMIT 1
  ) latest ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS value
    FROM public.chat_messages message
    WHERE message.room_id = room.id
      AND message.sender_role <> viewer.role
      AND message.created_at > COALESCE(read_state.last_read_at, '-infinity'::timestamptz)
  ) unread_count ON true
  WHERE
    (viewer.role = 'admin'::public.user_role)
    OR (
      viewer.role = 'teacher'::public.user_role
      AND room.teacher_id = viewer.id
    )
    OR (
      viewer.role = 'student'::public.user_role
      AND room.student_id = COALESCE(p_student_id, viewer.active_student_id)
      AND student.account_holder_id = viewer.id
    )
  ORDER BY COALESCE(latest.created_at, room.last_message_at, room.created_at) DESC;
$function$;

CREATE INDEX IF NOT EXISTS idx_admin_direct_messages_thread_unread
  ON public.admin_direct_messages (thread_id, sender_role)
  WHERE read_at IS NULL;

CREATE OR REPLACE FUNCTION public.get_admin_direct_inbox()
RETURNS TABLE (
  id uuid,
  target_type text,
  target_id uuid,
  display_name text,
  subtitle text,
  avatar_url text,
  last_message text,
  last_message_at timestamptz,
  unread bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    thread.id,
    thread.target_type,
    CASE
      WHEN thread.target_type = 'student' THEN thread.student_id
      ELSE thread.teacher_id
    END AS target_id,
    CASE
      WHEN thread.target_type = 'student' THEN COALESCE(
        NULLIF(BTRIM(student.english_name), ''),
        NULLIF(BTRIM(student.full_name), ''),
        NULLIF(BTRIM(profile.full_name), ''),
        'Student'
      )
      ELSE COALESCE(
        NULLIF(BTRIM(teacher.display_name), ''),
        NULLIF(BTRIM(profile.full_name), ''),
        'Teacher'
      )
    END AS display_name,
    CASE
      WHEN thread.target_type = 'teacher' THEN '선생님'
      WHEN NULLIF(BTRIM(student.full_name), '') IS NOT NULL
        AND NULLIF(BTRIM(student.full_name), '') IS DISTINCT FROM NULLIF(BTRIM(student.english_name), '')
        THEN student.full_name
      ELSE '학부모'
    END AS subtitle,
    profile.avatar_url,
    COALESCE(NULLIF(thread.last_message_preview, ''), '(새 대화)') AS last_message,
    COALESCE(thread.last_message_at, thread.created_at) AS last_message_at,
    COALESCE(unread_count.value, 0)::bigint AS unread
  FROM public.admin_direct_threads thread
  LEFT JOIN public.students student ON student.id = thread.student_id
  LEFT JOIN public.teachers teacher ON teacher.id = thread.teacher_id
  LEFT JOIN public.profiles profile ON profile.id = thread.profile_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS value
    FROM public.admin_direct_messages message
    WHERE message.thread_id = thread.id
      AND message.sender_role <> 'admin'
      AND message.read_at IS NULL
  ) unread_count ON true
  ORDER BY COALESCE(thread.last_message_at, thread.created_at) DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_direct_thread_messages(p_thread_id uuid)
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
  ORDER BY message.created_at ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.send_admin_direct_message(
  p_thread_id uuid,
  p_body text
)
RETURNS TABLE (
  id uuid,
  thread_id uuid,
  sender_role text,
  sender_id uuid,
  body text,
  read_at timestamptz,
  created_at timestamptz,
  target_profile_id uuid,
  target_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  viewer_id uuid := auth.uid();
  viewer_role public.user_role;
  sender_role_value text;
  thread_row public.admin_direct_threads%ROWTYPE;
  message_row public.admin_direct_messages%ROWTYPE;
  trimmed_body text := BTRIM(COALESCE(p_body, ''));
BEGIN
  IF viewer_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF trimmed_body = '' THEN
    RAISE EXCEPTION 'message_body_required' USING ERRCODE = '22023';
  END IF;

  SELECT profile.role
  INTO viewer_role
  FROM public.profiles profile
  WHERE profile.id = viewer_id;

  SELECT thread.*
  INTO thread_row
  FROM public.admin_direct_threads thread
  WHERE thread.id = p_thread_id
  FOR UPDATE;

  IF thread_row.id IS NULL THEN
    RAISE EXCEPTION 'thread_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF viewer_role = 'admin'::public.user_role THEN
    sender_role_value := 'admin';
  ELSIF thread_row.profile_id = viewer_id
    AND thread_row.target_type = viewer_role::text
    AND viewer_role IN ('student'::public.user_role, 'teacher'::public.user_role) THEN
    sender_role_value := viewer_role::text;
  ELSE
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.admin_direct_messages (
    thread_id,
    sender_role,
    sender_id,
    body
  )
  VALUES (
    p_thread_id,
    sender_role_value,
    viewer_id,
    trimmed_body
  )
  RETURNING * INTO message_row;

  UPDATE public.admin_direct_threads thread
  SET
    last_message_at = message_row.created_at,
    last_message_preview = LEFT(trimmed_body, 200)
  WHERE thread.id = p_thread_id;

  RETURN QUERY
  SELECT
    message_row.id,
    message_row.thread_id,
    message_row.sender_role,
    message_row.sender_id,
    message_row.body,
    message_row.read_at,
    message_row.created_at,
    thread_row.profile_id,
    thread_row.target_type;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_chat_room_read(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_chat_inbox(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_admin_direct_inbox()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_admin_direct_thread_messages(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.send_admin_direct_message(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.mark_chat_room_read(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_chat_inbox(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_direct_inbox() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_direct_thread_messages(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_admin_direct_message(uuid, text) TO authenticated, service_role;

ALTER FUNCTION public.mark_chat_room_read(uuid) OWNER TO postgres;
ALTER FUNCTION public.get_chat_inbox(uuid) OWNER TO postgres;
ALTER FUNCTION public.get_admin_direct_inbox() OWNER TO postgres;
ALTER FUNCTION public.get_admin_direct_thread_messages(uuid) OWNER TO postgres;
ALTER FUNCTION public.send_admin_direct_message(uuid, text) OWNER TO postgres;

COMMIT;
