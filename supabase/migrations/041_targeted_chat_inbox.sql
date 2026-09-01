-- Targeted chat inbox reads and lifecycle provisioning.
-- Avoids loading every room/message into the application process for one inbox.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created_desc
  ON public.chat_messages (room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_unread
  ON public.chat_messages (room_id, sender_role)
  WHERE read_at IS NULL;

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
    SELECT p.id, p.role, p.active_student_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
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
      AND message.read_at IS NULL
      AND message.sender_role <> viewer.role
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

CREATE OR REPLACE FUNCTION public.get_chat_thread_messages(p_room_id uuid)
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
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
    AND public.can_access_chat_room(p_room_id)
  ORDER BY message.created_at ASC;
$function$;

REVOKE ALL ON FUNCTION public.get_chat_inbox(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_chat_thread_messages(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_inbox(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_thread_messages(uuid) TO authenticated;

ALTER FUNCTION public.get_chat_inbox(uuid) OWNER TO postgres;
ALTER FUNCTION public.get_chat_thread_messages(uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.ensure_chat_room_for_active_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.status::text IN ('active', 'expiring_soon') THEN
    INSERT INTO public.chat_rooms (enrollment_id, student_id, teacher_id)
    VALUES (NEW.id, NEW.student_id, NEW.teacher_id)
    ON CONFLICT (enrollment_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_active_enrollment_ensure_chat_room ON public.enrollments;
CREATE TRIGGER on_active_enrollment_ensure_chat_room
AFTER INSERT OR UPDATE OF status, student_id, teacher_id ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.ensure_chat_room_for_active_enrollment();

INSERT INTO public.chat_rooms (enrollment_id, student_id, teacher_id)
SELECT enrollment.id, enrollment.student_id, enrollment.teacher_id
FROM public.enrollments enrollment
WHERE enrollment.status::text IN ('active', 'expiring_soon')
ON CONFLICT (enrollment_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_student_admin_direct_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.admin_direct_threads (
    target_type,
    student_id,
    profile_id,
    last_message_preview
  )
  VALUES ('student', NEW.id, NEW.account_holder_id, '(새 대화)')
  ON CONFLICT (profile_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_teacher_admin_direct_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.admin_direct_threads (
    target_type,
    teacher_id,
    profile_id,
    last_message_preview
  )
  VALUES ('teacher', NEW.id, NEW.id, '(새 대화)')
  ON CONFLICT (profile_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_chat_room_for_active_enrollment() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_student_admin_direct_thread() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_teacher_admin_direct_thread() FROM PUBLIC;

ALTER FUNCTION public.ensure_chat_room_for_active_enrollment() OWNER TO postgres;
ALTER FUNCTION public.ensure_student_admin_direct_thread() OWNER TO postgres;
ALTER FUNCTION public.ensure_teacher_admin_direct_thread() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_student_ensure_admin_direct_thread ON public.students;
CREATE TRIGGER on_student_ensure_admin_direct_thread
AFTER INSERT ON public.students
FOR EACH ROW EXECUTE FUNCTION public.ensure_student_admin_direct_thread();

DROP TRIGGER IF EXISTS on_teacher_ensure_admin_direct_thread ON public.teachers;
CREATE TRIGGER on_teacher_ensure_admin_direct_thread
AFTER INSERT ON public.teachers
FOR EACH ROW EXECUTE FUNCTION public.ensure_teacher_admin_direct_thread();

INSERT INTO public.admin_direct_threads (
  target_type,
  student_id,
  profile_id,
  last_message_preview
)
SELECT DISTINCT ON (student.account_holder_id)
  'student',
  student.id,
  student.account_holder_id,
  '(새 대화)'
FROM public.students student
WHERE student.is_active = true
ORDER BY student.account_holder_id, student.created_at ASC
ON CONFLICT (profile_id) DO NOTHING;

INSERT INTO public.admin_direct_threads (
  target_type,
  teacher_id,
  profile_id,
  last_message_preview
)
SELECT 'teacher', teacher.id, teacher.id, '(새 대화)'
FROM public.teachers teacher
ON CONFLICT (profile_id) DO NOTHING;

COMMIT;
