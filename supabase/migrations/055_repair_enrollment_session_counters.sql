-- Keep paid enrollment counters consistent when a teacher completes a lesson.
-- The previous trigger ran with the teacher's RLS privileges, so its
-- enrollments UPDATE silently affected zero rows. This migration also repairs
-- only the positive completion drift already present in production.

BEGIN;

CREATE OR REPLACE FUNCTION public.on_lesson_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  updated_count integer := 0;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    IF NEW.is_trial THEN
      UPDATE public.students
      SET trial_used = true
      WHERE id = NEW.student_id;
    ELSIF NEW.enrollment_id IS NOT NULL THEN
      UPDATE public.enrollments enrollment
      SET sessions_completed = LEAST(
            enrollment.sessions_total,
            enrollment.sessions_completed + 1
          ),
          sessions_remaining = GREATEST(
            COALESCE(
              enrollment.sessions_remaining,
              enrollment.sessions_total - enrollment.sessions_completed
            ) - 1,
            0
          )
      WHERE enrollment.id = NEW.enrollment_id;

      GET DIAGNOSTICS updated_count = ROW_COUNT;
      IF updated_count <> 1 THEN
        RAISE EXCEPTION 'lesson_completion_enrollment_update_failed:%', NEW.enrollment_id
          USING ERRCODE = 'P0002';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.on_lesson_completed() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.on_lesson_completed() FROM PUBLIC, anon, authenticated;

-- Backfill only completions that were never reflected in the stored counter.
-- For live paid courses, subtract exactly that missing delta from remaining.
-- Terminal and payment-hold balances are kept as historical contract data.
WITH paid_completion_counts AS (
  SELECT
    lesson.enrollment_id,
    COUNT(*)::integer AS completed_count
  FROM public.lessons lesson
  WHERE lesson.enrollment_id IS NOT NULL
    AND lesson.status = 'completed'
    AND NOT lesson.is_trial
  GROUP BY lesson.enrollment_id
), unresolved_lesson_counts AS (
  SELECT
    lesson.enrollment_id,
    COUNT(*)::integer AS unresolved_count
  FROM public.lessons lesson
  WHERE lesson.enrollment_id IS NOT NULL
    AND lesson.status IN ('scheduled', 'reschedule_pending', 'pending_payment')
    AND NOT lesson.is_trial
  GROUP BY lesson.enrollment_id
), counter_repairs AS (
  SELECT
    enrollment.id,
    LEAST(enrollment.sessions_total, counts.completed_count) AS target_completed,
    GREATEST(
      LEAST(enrollment.sessions_total, counts.completed_count)
        - enrollment.sessions_completed,
      0
    ) AS missing_completed,
    COALESCE(unresolved.unresolved_count, 0) AS unresolved_count
  FROM public.enrollments enrollment
  JOIN paid_completion_counts counts ON counts.enrollment_id = enrollment.id
  LEFT JOIN unresolved_lesson_counts unresolved ON unresolved.enrollment_id = enrollment.id
  WHERE counts.completed_count > enrollment.sessions_completed
)
UPDATE public.enrollments enrollment
SET sessions_completed = repair.target_completed,
    sessions_remaining = CASE
      WHEN enrollment.status IN ('active', 'expiring_soon')
        AND enrollment.payment_status = 'confirmed'
      THEN LEAST(
        enrollment.sessions_total,
        GREATEST(
          COALESCE(
            enrollment.sessions_remaining,
            enrollment.sessions_total - enrollment.sessions_completed
          ) - repair.missing_completed,
          repair.unresolved_count,
          0
        )
      )
      ELSE enrollment.sessions_remaining
    END
FROM counter_repairs repair
WHERE enrollment.id = repair.id
  AND repair.missing_completed > 0;

CREATE INDEX IF NOT EXISTS idx_lessons_enrollment_status_scheduled
  ON public.lessons (enrollment_id, status, scheduled_at)
  WHERE enrollment_id IS NOT NULL;

-- Admin student detail requests pass p_student_id. Apply that filter inside
-- the bounded inbox RPC so one detail view never downloads every chat room.
CREATE OR REPLACE FUNCTION public.get_chat_inbox(p_student_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  enrollment_id uuid,
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
  unread bigint,
  closed_at timestamptz,
  closed_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  WITH viewer AS (
    SELECT profile.id, profile.role, profile.active_student_id
    FROM public.profiles profile
    WHERE profile.id = auth.uid()
  )
  SELECT
    room.id,
    room.enrollment_id,
    room.teacher_id,
    COALESCE(NULLIF(BTRIM(teacher.display_name), ''), 'Teacher') AS teacher_name,
    room.student_id,
    COALESCE(NULLIF(BTRIM(student.english_name), ''), NULLIF(BTRIM(student.full_name), ''), 'Student') AS student_name,
    CASE viewer.role
      WHEN 'student'::public.user_role THEN COALESCE(NULLIF(BTRIM(teacher.display_name), ''), 'Teacher')
      WHEN 'teacher'::public.user_role THEN COALESCE(NULLIF(BTRIM(student.english_name), ''), NULLIF(BTRIM(student.full_name), ''), 'Student')
      ELSE COALESCE(NULLIF(BTRIM(student.english_name), ''), NULLIF(BTRIM(student.full_name), ''), 'Student')
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
    COALESCE(unread_count.value, 0)::bigint AS unread,
    room.closed_at,
    room.closed_reason
  FROM public.chat_rooms room
  CROSS JOIN viewer
  JOIN public.teachers teacher ON teacher.id = room.teacher_id
  JOIN public.students student ON student.id = room.student_id
  LEFT JOIN public.profiles teacher_profile ON teacher_profile.id = teacher.id
  LEFT JOIN public.profiles student_profile ON student_profile.id = student.account_holder_id
  LEFT JOIN public.chat_room_read_state read_state
    ON read_state.room_id = room.id AND read_state.user_id = viewer.id
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
  WHERE (
      viewer.role = 'admin'::public.user_role
      AND (p_student_id IS NULL OR room.student_id = p_student_id)
    )
    OR (viewer.role = 'teacher'::public.user_role AND room.teacher_id = viewer.id)
    OR (
      viewer.role = 'student'::public.user_role
      AND room.student_id = COALESCE(p_student_id, viewer.active_student_id)
      AND student.account_holder_id = viewer.id
    )
  ORDER BY COALESCE(latest.created_at, room.last_message_at, room.created_at) DESC;
$function$;

REVOKE ALL ON FUNCTION public.get_chat_inbox(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_inbox(uuid) TO authenticated;
ALTER FUNCTION public.get_chat_inbox(uuid) OWNER TO postgres;

COMMIT;
