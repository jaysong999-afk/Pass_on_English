-- Keep exactly one durable chat room for each student/teacher pair.
-- Renewals reopen the same room, while inactive pairs remain readable and
-- read-only. Existing duplicate rooms are merged without losing messages,
-- read cursors, presence leases, or historical notification deep links.

BEGIN;

LOCK TABLE public.chat_rooms, public.chat_messages, public.chat_room_read_state,
  public.chat_room_presence, public.notifications IN EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS public.chat_room_aliases (
  alias_room_id uuid PRIMARY KEY,
  canonical_room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_room_aliases_distinct_ids CHECK (alias_room_id <> canonical_room_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_room_aliases_canonical
  ON public.chat_room_aliases (canonical_room_id);
ALTER TABLE public.chat_room_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.chat_room_aliases FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.chat_room_aliases TO service_role;
DROP POLICY IF EXISTS rls_chat_room_aliases_internal_only ON public.chat_room_aliases;
CREATE POLICY rls_chat_room_aliases_internal_only ON public.chat_room_aliases
  FOR ALL USING (false) WITH CHECK (false);

-- Prefer an open room with the newest real activity as the canonical room.
CREATE TEMP TABLE chat_room_merge_map ON COMMIT DROP AS
WITH message_activity AS (
  SELECT message.room_id, MAX(message.created_at) AS latest_message_at
  FROM public.chat_messages message
  GROUP BY message.room_id
), ranked AS (
  SELECT
    room.id AS old_room_id,
    FIRST_VALUE(room.id) OVER (
      PARTITION BY room.student_id, room.teacher_id
      ORDER BY
        (room.closed_at IS NULL) DESC,
        (message_activity.latest_message_at IS NOT NULL) DESC,
        GREATEST(
          COALESCE(message_activity.latest_message_at, '-infinity'::timestamptz),
          COALESCE(room.last_message_at, '-infinity'::timestamptz),
          room.created_at
        ) DESC,
        room.id
    ) AS canonical_room_id
  FROM public.chat_rooms room
  LEFT JOIN message_activity ON message_activity.room_id = room.id
)
SELECT old_room_id, canonical_room_id FROM ranked;

INSERT INTO public.chat_room_aliases (alias_room_id, canonical_room_id)
SELECT map.old_room_id, map.canonical_room_id
FROM chat_room_merge_map map
WHERE map.old_room_id <> map.canonical_room_id
ON CONFLICT (alias_room_id) DO UPDATE
SET canonical_room_id = EXCLUDED.canonical_room_id;

INSERT INTO public.chat_room_read_state (room_id, user_id, last_read_at)
SELECT map.canonical_room_id, state.user_id, MAX(state.last_read_at)
FROM public.chat_room_read_state state
JOIN chat_room_merge_map map ON map.old_room_id = state.room_id
GROUP BY map.canonical_room_id, state.user_id
ON CONFLICT (room_id, user_id) DO UPDATE
SET last_read_at = GREATEST(public.chat_room_read_state.last_read_at, EXCLUDED.last_read_at);

DELETE FROM public.chat_room_read_state state
USING chat_room_merge_map map
WHERE state.room_id = map.old_room_id
  AND map.old_room_id <> map.canonical_room_id;

INSERT INTO public.chat_room_presence (room_id, user_id, client_id, expires_at)
SELECT map.canonical_room_id, presence.user_id, presence.client_id, MAX(presence.expires_at)
FROM public.chat_room_presence presence
JOIN chat_room_merge_map map ON map.old_room_id = presence.room_id
GROUP BY map.canonical_room_id, presence.user_id, presence.client_id
ON CONFLICT (room_id, user_id, client_id) DO UPDATE
SET expires_at = GREATEST(public.chat_room_presence.expires_at, EXCLUDED.expires_at);

DELETE FROM public.chat_room_presence presence
USING chat_room_merge_map map
WHERE presence.room_id = map.old_room_id
  AND map.old_room_id <> map.canonical_room_id;

UPDATE public.chat_messages message
SET room_id = map.canonical_room_id
FROM chat_room_merge_map map
WHERE message.room_id = map.old_room_id
  AND map.old_room_id <> map.canonical_room_id;

UPDATE public.notifications notification
SET payload = jsonb_set(
  COALESCE(notification.payload, '{}'::jsonb),
  '{roomId}',
  to_jsonb(map.canonical_room_id::text),
  true
)
FROM chat_room_merge_map map
WHERE map.old_room_id <> map.canonical_room_id
  AND notification.payload->>'roomId' = map.old_room_id::text;

WITH room_activity AS (
  SELECT map.canonical_room_id,
    MAX(GREATEST(COALESCE(room.last_message_at, '-infinity'::timestamptz), room.created_at)) AS last_activity_at
  FROM chat_room_merge_map map
  JOIN public.chat_rooms room ON room.id = map.old_room_id
  GROUP BY map.canonical_room_id
), message_activity AS (
  SELECT message.room_id AS canonical_room_id, MAX(message.created_at) AS last_message_at
  FROM public.chat_messages message
  GROUP BY message.room_id
)
UPDATE public.chat_rooms room
SET last_message_at = GREATEST(
  COALESCE(room_activity.last_activity_at, '-infinity'::timestamptz),
  COALESCE(message_activity.last_message_at, '-infinity'::timestamptz)
)
FROM room_activity
LEFT JOIN message_activity ON message_activity.canonical_room_id = room_activity.canonical_room_id
WHERE room.id = room_activity.canonical_room_id;

DELETE FROM public.chat_rooms room
USING chat_room_merge_map map
WHERE room.id = map.old_room_id
  AND map.old_room_id <> map.canonical_room_id;

-- enrollment_id remains temporarily as a representative enrollment for old
-- clients, but it no longer identifies or owns the room.
ALTER TABLE public.chat_rooms DROP CONSTRAINT IF EXISTS chat_rooms_enrollment_id_key;
ALTER TABLE public.chat_rooms DROP CONSTRAINT IF EXISTS chat_rooms_enrollment_id_fkey;
ALTER TABLE public.chat_rooms ALTER COLUMN enrollment_id DROP NOT NULL;
ALTER TABLE public.chat_rooms
  ADD CONSTRAINT chat_rooms_enrollment_id_fkey
  FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE SET NULL;

UPDATE public.chat_rooms room
SET enrollment_id = COALESCE(
  (
    SELECT enrollment.id
    FROM public.enrollments enrollment
    WHERE enrollment.student_id = room.student_id
      AND enrollment.teacher_id = room.teacher_id
      AND enrollment.status IN ('active'::public.enrollment_status, 'expiring_soon'::public.enrollment_status)
      AND enrollment.payment_status = 'confirmed'::public.payment_status
      AND (enrollment.ended_at IS NULL OR enrollment.ended_at > now())
    ORDER BY enrollment.ended_at DESC NULLS FIRST, enrollment.created_at DESC, enrollment.id
    LIMIT 1
  ),
  (
    SELECT enrollment.id
    FROM public.enrollments enrollment
    WHERE enrollment.student_id = room.student_id
      AND enrollment.teacher_id = room.teacher_id
    ORDER BY enrollment.created_at DESC, enrollment.id
    LIMIT 1
  )
);

ALTER TABLE public.chat_rooms
  ADD CONSTRAINT chat_rooms_student_teacher_key UNIQUE (student_id, teacher_id);

CREATE INDEX IF NOT EXISTS idx_enrollments_chat_eligible_pair
  ON public.enrollments (student_id, teacher_id, ended_at DESC, created_at DESC)
  WHERE status IN ('active'::public.enrollment_status, 'expiring_soon'::public.enrollment_status)
    AND payment_status = 'confirmed'::public.payment_status;

CREATE OR REPLACE FUNCTION public.is_chat_pair_open(p_student_id uuid, p_teacher_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.enrollments enrollment
    WHERE enrollment.student_id = p_student_id
      AND enrollment.teacher_id = p_teacher_id
      AND enrollment.status IN ('active'::public.enrollment_status, 'expiring_soon'::public.enrollment_status)
      AND enrollment.payment_status = 'confirmed'::public.payment_status
      AND (enrollment.ended_at IS NULL OR enrollment.ended_at > now())
  );
$function$;

-- Sole room lifecycle writer: renewals reuse the pair room and the room closes
-- only after the final eligible enrollment for that pair ends.
CREATE OR REPLACE FUNCTION public.sync_chat_room_for_pair(p_student_id uuid, p_teacher_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  active_enrollment_id uuid;
  latest_enrollment_id uuid;
  latest_status text;
  latest_cancel_reason text;
  latest_ended_at timestamptz;
  close_reason text;
  close_time timestamptz;
BEGIN
  IF p_student_id IS NULL OR p_teacher_id IS NULL THEN RETURN; END IF;

  SELECT enrollment.id INTO active_enrollment_id
  FROM public.enrollments enrollment
  WHERE enrollment.student_id = p_student_id
    AND enrollment.teacher_id = p_teacher_id
    AND enrollment.status IN ('active'::public.enrollment_status, 'expiring_soon'::public.enrollment_status)
    AND enrollment.payment_status = 'confirmed'::public.payment_status
    AND (enrollment.ended_at IS NULL OR enrollment.ended_at > now())
  ORDER BY enrollment.ended_at DESC NULLS FIRST, enrollment.created_at DESC, enrollment.id
  LIMIT 1;

  IF active_enrollment_id IS NOT NULL THEN
    INSERT INTO public.chat_rooms (enrollment_id, student_id, teacher_id, closed_at, closed_reason)
    VALUES (active_enrollment_id, p_student_id, p_teacher_id, NULL, NULL)
    ON CONFLICT ON CONSTRAINT chat_rooms_student_teacher_key DO UPDATE
    SET enrollment_id = EXCLUDED.enrollment_id,
        closed_at = NULL,
        closed_reason = NULL;
    RETURN;
  END IF;

  SELECT enrollment.id, enrollment.status::text, enrollment.cancel_reason, enrollment.ended_at
  INTO latest_enrollment_id, latest_status, latest_cancel_reason, latest_ended_at
  FROM public.enrollments enrollment
  WHERE enrollment.student_id = p_student_id
    AND enrollment.teacher_id = p_teacher_id
  ORDER BY enrollment.created_at DESC, enrollment.id
  LIMIT 1;

  close_reason := CASE
    WHEN COALESCE(latest_cancel_reason, '') LIKE 'refund:%' THEN 'enrollment_refund'
    WHEN latest_ended_at IS NOT NULL AND latest_ended_at <= now() THEN 'enrollment_ended'
    WHEN latest_status = 'completed' THEN 'enrollment_ended'
    ELSE 'enrollment_inactive'
  END;
  close_time := CASE
    WHEN close_reason = 'enrollment_ended' AND latest_ended_at IS NOT NULL
      THEN LEAST(latest_ended_at, now())
    ELSE now()
  END;

  UPDATE public.chat_rooms room
  SET enrollment_id = latest_enrollment_id,
      closed_at = COALESCE(room.closed_at, close_time),
      closed_reason = COALESCE(room.closed_reason, close_reason)
  WHERE room.student_id = p_student_id
    AND room.teacher_id = p_teacher_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_chat_room_pair()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.enrollment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.enrollments enrollment
    WHERE enrollment.id = NEW.enrollment_id
      AND enrollment.student_id = NEW.student_id
      AND enrollment.teacher_id = NEW.teacher_id
  ) THEN
    RAISE EXCEPTION 'chat_enrollment_pair_mismatch' USING ERRCODE = '55000';
  END IF;
  IF NEW.closed_at IS NULL AND NOT public.is_chat_pair_open(NEW.student_id, NEW.teacher_id) THEN
    RAISE EXCEPTION 'chat_pair_not_active' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_chat_room_enrollment ON public.chat_rooms;
DROP TRIGGER IF EXISTS guard_chat_room_pair ON public.chat_rooms;
CREATE TRIGGER guard_chat_room_pair
BEFORE INSERT OR UPDATE OF enrollment_id, student_id, teacher_id, closed_at ON public.chat_rooms
FOR EACH ROW EXECUTE FUNCTION public.guard_chat_room_pair();

CREATE OR REPLACE FUNCTION public.sync_chat_room_after_enrollment_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_chat_room_for_pair(OLD.student_id, OLD.teacher_id);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE'
    AND (OLD.student_id, OLD.teacher_id) IS DISTINCT FROM (NEW.student_id, NEW.teacher_id)
  THEN
    PERFORM public.sync_chat_room_for_pair(OLD.student_id, OLD.teacher_id);
  END IF;
  PERFORM public.sync_chat_room_for_pair(NEW.student_id, NEW.teacher_id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_active_enrollment_ensure_chat_room ON public.enrollments;
DROP TRIGGER IF EXISTS sync_chat_room_after_enrollment_write ON public.enrollments;
CREATE TRIGGER sync_chat_room_after_enrollment_write
AFTER INSERT OR UPDATE OF status, payment_status, ended_at, cancel_reason, student_id, teacher_id
ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.sync_chat_room_after_enrollment_write();

DROP TRIGGER IF EXISTS sync_chat_room_after_enrollment_delete ON public.enrollments;
CREATE TRIGGER sync_chat_room_after_enrollment_delete
AFTER DELETE ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.sync_chat_room_after_enrollment_write();

-- One migration-time reconciliation. Runtime writes are event-driven; there is
-- no cron, background polling, or extra client query for normal inbox loads.
DO $block$
DECLARE pair record;
BEGIN
  FOR pair IN
    SELECT room.student_id, room.teacher_id FROM public.chat_rooms room
    UNION
    SELECT enrollment.student_id, enrollment.teacher_id
    FROM public.enrollments enrollment
    WHERE enrollment.status IN ('active'::public.enrollment_status, 'expiring_soon'::public.enrollment_status)
      AND enrollment.payment_status = 'confirmed'::public.payment_status
      AND (enrollment.ended_at IS NULL OR enrollment.ended_at > now())
  LOOP
    PERFORM public.sync_chat_room_for_pair(pair.student_id, pair.teacher_id);
  END LOOP;
END;
$block$;

CREATE OR REPLACE FUNCTION public.guard_closed_chat_room_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_rooms room
    WHERE room.id = NEW.room_id
      AND public.is_chat_pair_open(room.student_id, room.teacher_id)
  ) THEN
    RAISE EXCEPTION 'chat_room_closed' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;

-- Used only when a requested id is absent from the normal inbox.
CREATE OR REPLACE FUNCTION public.resolve_chat_room_id(p_room_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE resolved_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_room_id IS NULL THEN RETURN NULL; END IF;
  SELECT room.id INTO resolved_id FROM public.chat_rooms room WHERE room.id = p_room_id;
  IF resolved_id IS NULL THEN
    SELECT alias.canonical_room_id INTO resolved_id
    FROM public.chat_room_aliases alias
    WHERE alias.alias_room_id = p_room_id;
  END IF;
  IF resolved_id IS NULL OR NOT public.can_access_chat_room(resolved_id) THEN RETURN NULL; END IF;
  RETURN resolved_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_chat_inbox(p_student_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid, enrollment_id uuid, teacher_id uuid, teacher_name text,
  student_id uuid, student_name text, display_name text, avatar_url text,
  teacher_avatar_url text, student_avatar_url text, last_message text,
  last_message_at timestamptz, unread bigint, closed_at timestamptz, closed_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  WITH viewer AS (
    SELECT profile.id, profile.role, profile.active_student_id
    FROM public.profiles profile WHERE profile.id = auth.uid()
  )
  SELECT
    room.id, room.enrollment_id, room.teacher_id,
    COALESCE(NULLIF(BTRIM(teacher.display_name), ''), 'Teacher'),
    room.student_id,
    COALESCE(NULLIF(BTRIM(student.english_name), ''), NULLIF(BTRIM(student.full_name), ''), 'Student'),
    CASE viewer.role
      WHEN 'student'::public.user_role THEN COALESCE(NULLIF(BTRIM(teacher.display_name), ''), 'Teacher')
      WHEN 'teacher'::public.user_role THEN COALESCE(NULLIF(BTRIM(student.english_name), ''), NULLIF(BTRIM(student.full_name), ''), 'Student')
      ELSE COALESCE(NULLIF(BTRIM(student.english_name), ''), NULLIF(BTRIM(student.full_name), ''), 'Student')
        || ' · ' || COALESCE(NULLIF(BTRIM(teacher.display_name), ''), 'Teacher')
    END,
    CASE viewer.role
      WHEN 'student'::public.user_role THEN teacher_profile.avatar_url
      WHEN 'teacher'::public.user_role THEN student_profile.avatar_url
      ELSE COALESCE(teacher_profile.avatar_url, student_profile.avatar_url)
    END,
    teacher_profile.avatar_url, student_profile.avatar_url,
    COALESCE(latest.body, ''),
    COALESCE(latest.created_at, room.last_message_at, room.created_at),
    COALESCE(unread_count.value, 0)::bigint,
    CASE
      WHEN eligibility.is_open THEN NULL
      WHEN room.closed_at IS NOT NULL THEN room.closed_at
      WHEN representative.ended_at IS NOT NULL AND representative.ended_at <= now() THEN representative.ended_at
      ELSE now()
    END,
    CASE
      WHEN eligibility.is_open THEN NULL
      WHEN room.closed_reason IS NOT NULL THEN room.closed_reason
      WHEN COALESCE(representative.cancel_reason, '') LIKE 'refund:%' THEN 'enrollment_refund'
      WHEN representative.ended_at IS NOT NULL AND representative.ended_at <= now() THEN 'enrollment_ended'
      WHEN representative.status::text = 'completed' THEN 'enrollment_ended'
      ELSE 'enrollment_inactive'
    END
  FROM public.chat_rooms room
  CROSS JOIN viewer
  CROSS JOIN LATERAL (SELECT public.is_chat_pair_open(room.student_id, room.teacher_id) AS is_open) eligibility
  LEFT JOIN public.enrollments representative ON representative.id = room.enrollment_id
  JOIN public.teachers teacher ON teacher.id = room.teacher_id
  JOIN public.students student ON student.id = room.student_id
  LEFT JOIN public.profiles teacher_profile ON teacher_profile.id = teacher.id
  LEFT JOIN public.profiles student_profile ON student_profile.id = student.account_holder_id
  LEFT JOIN public.chat_room_read_state read_state
    ON read_state.room_id = room.id AND read_state.user_id = viewer.id
  LEFT JOIN LATERAL (
    SELECT message.body, message.created_at FROM public.chat_messages message
    WHERE message.room_id = room.id
    ORDER BY message.created_at DESC, message.id DESC LIMIT 1
  ) latest ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS value FROM public.chat_messages message
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

ALTER FUNCTION public.is_chat_pair_open(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.sync_chat_room_for_pair(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.guard_chat_room_pair() OWNER TO postgres;
ALTER FUNCTION public.sync_chat_room_after_enrollment_write() OWNER TO postgres;
ALTER FUNCTION public.guard_closed_chat_room_message() OWNER TO postgres;
ALTER FUNCTION public.resolve_chat_room_id(uuid) OWNER TO postgres;
ALTER FUNCTION public.get_chat_inbox(uuid) OWNER TO postgres;
ALTER TABLE public.chat_room_aliases OWNER TO postgres;

REVOKE ALL ON FUNCTION public.is_chat_pair_open(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_chat_room_for_pair(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_chat_room_pair() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_chat_room_after_enrollment_write() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_closed_chat_room_message() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.resolve_chat_room_id(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_chat_inbox(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_chat_room_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_inbox(uuid) TO authenticated;

COMMIT;
