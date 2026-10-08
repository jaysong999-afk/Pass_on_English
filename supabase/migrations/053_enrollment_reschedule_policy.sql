BEGIN;

-- Reschedule allowances belong to an enrollment, not to a calendar month.
-- The value is snapshotted on each enrollment so future plan changes do not
-- silently change an existing student's allowance.
ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS student_reschedule_limit integer NOT NULL DEFAULT 2;

ALTER TABLE public.enrollments
  DROP CONSTRAINT IF EXISTS enrollments_student_reschedule_limit_check;
ALTER TABLE public.enrollments
  ADD CONSTRAINT enrollments_student_reschedule_limit_check
  CHECK (student_reschedule_limit >= 0 AND student_reschedule_limit <= 20);

ALTER TABLE public.lesson_reschedule_requests
  ADD COLUMN IF NOT EXISTS enrollment_id uuid REFERENCES public.enrollments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_trial_request boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS teacher_bonus_policy_applies boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS closed_reason text;

UPDATE public.lesson_reschedule_requests request
SET enrollment_id = lesson.enrollment_id,
    is_trial_request = lesson.is_trial,
    teacher_bonus_policy_applies = false
FROM public.lessons lesson
WHERE lesson.id = request.lesson_id
  AND (
    request.enrollment_id IS DISTINCT FROM lesson.enrollment_id
    OR request.is_trial_request IS DISTINCT FROM lesson.is_trial
    OR request.teacher_bonus_policy_applies IS DISTINCT FROM false
  );

DROP INDEX IF EXISTS public.idx_lesson_reschedule_pending_unique;
CREATE UNIQUE INDEX idx_lesson_reschedule_pending_unique
  ON public.lesson_reschedule_requests (lesson_id)
  WHERE status IN ('pending_student_approval', 'pending_teacher_approval');

CREATE INDEX IF NOT EXISTS idx_lesson_reschedule_enrollment_usage
  ON public.lesson_reschedule_requests (enrollment_id, initiator, is_trial_request, status);
CREATE INDEX IF NOT EXISTS idx_lesson_reschedule_student_trial_usage
  ON public.lesson_reschedule_requests (student_id, initiator, is_trial_request, status)
  WHERE is_trial_request = true;
CREATE INDEX IF NOT EXISTS idx_lesson_reschedule_pending_expiry
  ON public.lesson_reschedule_requests (original_scheduled_at)
  WHERE status IN ('pending_student_approval', 'pending_teacher_approval');

-- Keep schedule-change attendance disqualifications separate from no-show
-- penalty rows. Reversing a no-show must never erase this independent event.
CREATE TABLE IF NOT EXISTS public.teacher_attendance_policy_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  reschedule_request_id uuid NOT NULL UNIQUE
    REFERENCES public.lesson_reschedule_requests(id) ON DELETE CASCADE,
  event_month text NOT NULL CHECK (event_month ~ '^[0-9]{4}-[0-9]{2}$'),
  event_type text NOT NULL DEFAULT 'excess_reschedule'
    CHECK (event_type = 'excess_reschedule'),
  perfect_attendance_forfeited boolean NOT NULL DEFAULT true,
  quarterly_bonus_reset boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teacher_attendance_policy_events_teacher_month
  ON public.teacher_attendance_policy_events (teacher_id, event_month);

ALTER TABLE public.teacher_attendance_policy_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS teacher_attendance_policy_events_select
  ON public.teacher_attendance_policy_events;
CREATE POLICY teacher_attendance_policy_events_select
  ON public.teacher_attendance_policy_events
  FOR SELECT USING (public.is_admin() OR teacher_id = auth.uid());

REVOKE ALL ON TABLE public.teacher_attendance_policy_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.teacher_attendance_policy_events TO authenticated;
GRANT ALL ON TABLE public.teacher_attendance_policy_events TO service_role;

-- Validate the concrete date against working hours, date exceptions, existing
-- lessons and other students' recurring enrollment holds. All filtering stays
-- in PostgreSQL so a request never downloads global schedules to the app.
CREATE OR REPLACE FUNCTION public.reschedule_slot_is_available(
  p_lesson_id uuid,
  p_proposed_scheduled_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_lesson public.lessons%ROWTYPE;
  v_local timestamp;
  v_block timestamp;
  v_day text;
  v_blocks integer;
  v_i integer;
BEGIN
  SELECT * INTO v_lesson
  FROM public.lessons
  WHERE id = p_lesson_id;
  IF NOT FOUND THEN RETURN false; END IF;

  v_local := p_proposed_scheduled_at AT TIME ZONE 'Asia/Seoul';
  IF p_proposed_scheduled_at <= now()
     OR p_proposed_scheduled_at = v_lesson.scheduled_at
     OR v_lesson.duration_minutes <= 0
     OR v_lesson.duration_minutes % 20 <> 0
     OR extract(minute FROM v_local)::integer % 20 <> 0
     OR extract(second FROM v_local) <> 0 THEN
    RETURN false;
  END IF;

  v_day := (ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])[
    extract(isodow FROM v_local)::integer
  ];
  v_blocks := v_lesson.duration_minutes / 20;

  IF EXISTS (
    SELECT 1
    FROM public.teacher_availability_exceptions exception
    WHERE exception.teacher_id = v_lesson.teacher_id
      AND exception.exception_date = v_local::date
  ) THEN
    RETURN false;
  END IF;

  FOR v_i IN 0..v_blocks - 1 LOOP
    v_block := v_local + v_i * interval '20 minutes';
    IF NOT EXISTS (
      SELECT 1
      FROM public.teachers_weekly_availability availability
      WHERE availability.teacher_id = v_lesson.teacher_id
        AND availability.day = v_day
        AND availability.start_time = v_block::time
    ) THEN
      RETURN false;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.lessons other
    WHERE other.teacher_id = v_lesson.teacher_id
      AND other.id <> v_lesson.id
      AND other.status IN ('scheduled', 'reschedule_pending', 'pending_payment')
      AND other.scheduled_at < p_proposed_scheduled_at
        + make_interval(mins => v_lesson.duration_minutes)
      AND other.scheduled_at + make_interval(mins => other.duration_minutes)
        > p_proposed_scheduled_at
  ) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.enrollments enrollment
    JOIN public.pricing_plans plan ON plan.id = enrollment.plan_id
    WHERE enrollment.teacher_id = v_lesson.teacher_id
      AND enrollment.id IS DISTINCT FROM v_lesson.enrollment_id
      AND enrollment.payment_status <> 'rejected'
      AND (
        enrollment.status = 'pending_payment'
        OR (enrollment.status IN ('active', 'expiring_soon')
          AND coalesce(enrollment.sessions_remaining, 0) > 0)
      )
      AND coalesce(
        nullif(plan.description->'schedule_days', '[]'::jsonb),
        CASE
          WHEN enrollment.preferred_slot_day IS NOT NULL
            THEN jsonb_build_array(enrollment.preferred_slot_day)
          ELSE '[]'::jsonb
        END
      ) ? v_day
      AND coalesce(enrollment.preferred_slot_time, '10:00')::time
        < v_local::time + make_interval(mins => v_lesson.duration_minutes)
      AND coalesce(enrollment.preferred_slot_time, '10:00')::time
          + make_interval(mins => plan.session_minutes) > v_local::time
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_slot_is_available(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_slot_is_available(uuid, timestamptz)
  TO service_role;

-- Derive immutable policy fields from the lesson and enforce the quota even
-- for privileged/manual writers. Pending and approved requests consume quota;
-- rejected and cancelled requests do not.
CREATE OR REPLACE FUNCTION public.check_student_reschedule_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_lesson public.lessons%ROWTYPE;
  v_limit integer;
  v_count integer;
  v_scope text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO v_lesson
    FROM public.lessons
    WHERE id = NEW.lesson_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'lesson_not_found' USING ERRCODE = 'P0002';
    END IF;

    NEW.teacher_id := v_lesson.teacher_id;
    NEW.student_id := v_lesson.student_id;
    NEW.enrollment_id := v_lesson.enrollment_id;
    NEW.is_trial_request := v_lesson.is_trial;
    NEW.original_scheduled_at := v_lesson.scheduled_at;
    NEW.request_month := to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM');
    NEW.teacher_bonus_policy_applies := true;

    IF now() > v_lesson.scheduled_at - interval '2 hours' THEN
      RAISE EXCEPTION 'reschedule_deadline_passed' USING ERRCODE = '22023';
    END IF;
  ELSE
    NEW.lesson_id := OLD.lesson_id;
    NEW.teacher_id := OLD.teacher_id;
    NEW.student_id := OLD.student_id;
    NEW.enrollment_id := OLD.enrollment_id;
    NEW.is_trial_request := OLD.is_trial_request;
    NEW.initiator := OLD.initiator;
    NEW.original_scheduled_at := OLD.original_scheduled_at;
    NEW.request_month := OLD.request_month;
    NEW.teacher_bonus_policy_applies := OLD.teacher_bonus_policy_applies;
    NEW.created_at := OLD.created_at;
  END IF;

  IF NEW.initiator = 'student'
     AND NEW.status IN ('pending_student_approval', 'pending_teacher_approval', 'approved') THEN
    IF NEW.is_trial_request THEN
      v_limit := 1;
      v_scope := 'trial:' || NEW.student_id::text;
    ELSE
      IF NEW.enrollment_id IS NULL THEN
        RAISE EXCEPTION 'enrollment_not_found' USING ERRCODE = 'P0002';
      END IF;
      SELECT student_reschedule_limit INTO v_limit
      FROM public.enrollments
      WHERE id = NEW.enrollment_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'enrollment_not_found' USING ERRCODE = 'P0002';
      END IF;
      v_scope := 'enrollment:' || NEW.enrollment_id::text;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('student-reschedule:' || v_scope, 0));
    -- Recount after the lock to serialize concurrent requests for one scope.
    IF NEW.is_trial_request THEN
      SELECT count(*) INTO v_count
      FROM public.lesson_reschedule_requests request
      WHERE request.student_id = NEW.student_id
        AND request.is_trial_request = true
        AND request.initiator = 'student'
        AND request.status IN ('pending_student_approval', 'pending_teacher_approval', 'approved')
        AND request.id <> NEW.id;
    ELSE
      SELECT count(*) INTO v_count
      FROM public.lesson_reschedule_requests request
      WHERE request.enrollment_id = NEW.enrollment_id
        AND request.is_trial_request = false
        AND request.initiator = 'student'
        AND request.status IN ('pending_student_approval', 'pending_teacher_approval', 'approved')
        AND request.id <> NEW.id;
    END IF;

    IF v_count >= v_limit THEN
      RAISE EXCEPTION 'student_reschedule_limit_reached' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_student_reschedule_limit
  ON public.lesson_reschedule_requests;
CREATE TRIGGER trg_check_student_reschedule_limit
  BEFORE INSERT OR UPDATE ON public.lesson_reschedule_requests
  FOR EACH ROW EXECUTE FUNCTION public.check_student_reschedule_limit();

DROP TRIGGER IF EXISTS trg_on_reschedule_approved
  ON public.lesson_reschedule_requests;

DROP FUNCTION IF EXISTS public.create_lesson_reschedule_request(
  uuid, timestamptz, text, public.reschedule_initiator, text
);

CREATE FUNCTION public.create_lesson_reschedule_request(
  p_lesson_id uuid,
  p_proposed_scheduled_at timestamptz,
  p_reason text,
  p_initiator public.reschedule_initiator
)
RETURNS public.lesson_reschedule_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_lesson public.lessons%ROWTYPE;
  v_request public.lesson_reschedule_requests%ROWTYPE;
  v_status public.reschedule_status;
  v_role text := public.current_user_role()::text;
BEGIN
  SELECT * INTO v_lesson
  FROM public.lessons
  WHERE id = p_lesson_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lesson_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_lesson.status <> 'scheduled' THEN
    RAISE EXCEPTION 'lesson_not_eligible' USING ERRCODE = '22023';
  END IF;
  IF NOT v_lesson.is_trial AND v_lesson.enrollment_id IS NULL THEN
    RAISE EXCEPTION 'enrollment_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_role <> p_initiator::text THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_initiator = 'teacher' AND v_lesson.teacher_id <> auth.uid() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_initiator = 'student' AND NOT public.owns_student(v_lesson.student_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF now() > v_lesson.scheduled_at - interval '2 hours' THEN
    RAISE EXCEPTION 'reschedule_deadline_passed' USING ERRCODE = '22023';
  END IF;

  -- Acquire the quota-scope lock in a separate statement before INSERT. If a
  -- concurrent request was waiting, the INSERT trigger then starts from a
  -- fresh READ COMMITTED snapshot and sees the request that won the lock.
  IF p_initiator = 'student' THEN
    IF v_lesson.is_trial THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(
        'student-reschedule:trial:' || v_lesson.student_id::text, 0
      ));
    ELSE
      PERFORM pg_advisory_xact_lock(hashtextextended(
        'student-reschedule:enrollment:' || v_lesson.enrollment_id::text, 0
      ));
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('lesson-reschedule:' || p_lesson_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.lesson_reschedule_requests request
    WHERE request.lesson_id = p_lesson_id
      AND request.status IN ('pending_student_approval', 'pending_teacher_approval')
  ) THEN
    RAISE EXCEPTION 'pending_request_exists' USING ERRCODE = '23505';
  END IF;
  IF NOT public.reschedule_slot_is_available(p_lesson_id, p_proposed_scheduled_at) THEN
    RAISE EXCEPTION 'slot_unavailable' USING ERRCODE = '23P01';
  END IF;

  v_status := CASE WHEN p_initiator = 'teacher'
    THEN 'pending_student_approval'::public.reschedule_status
    ELSE 'pending_teacher_approval'::public.reschedule_status END;

  INSERT INTO public.lesson_reschedule_requests (
    lesson_id, teacher_id, student_id, enrollment_id, is_trial_request,
    initiator, original_scheduled_at, proposed_scheduled_at, status, reason,
    request_month, teacher_bonus_policy_applies
  ) VALUES (
    v_lesson.id, v_lesson.teacher_id, v_lesson.student_id, v_lesson.enrollment_id,
    v_lesson.is_trial, p_initiator, v_lesson.scheduled_at,
    p_proposed_scheduled_at, v_status, nullif(btrim(p_reason), ''),
    to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM'), true
  )
  RETURNING * INTO v_request;

  UPDATE public.lessons
  SET status = 'reschedule_pending'
  WHERE id = v_lesson.id;

  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_lesson_reschedule_request(
  p_request_id uuid,
  p_action text
)
RETURNS public.lesson_reschedule_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_request public.lesson_reschedule_requests%ROWTYPE;
  v_lesson public.lessons%ROWTYPE;
  v_role text := public.current_user_role()::text;
  v_teacher_approved_count integer;
BEGIN
  SELECT * INTO v_request
  FROM public.lesson_reschedule_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_request.status NOT IN ('pending_student_approval', 'pending_teacher_approval') THEN
    RAISE EXCEPTION 'not_pending' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_lesson
  FROM public.lessons
  WHERE id = v_request.lesson_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lesson_not_found' USING ERRCODE = 'P0002'; END IF;

  IF v_role = 'teacher' AND v_request.teacher_id <> auth.uid() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  ELSIF v_role = 'student' AND NOT public.owns_student(v_request.student_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  ELSIF v_role NOT IN ('teacher', 'student', 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'approve' THEN
    IF v_role = 'student' AND v_request.status <> 'pending_student_approval' THEN
      RAISE EXCEPTION 'not_awaiting_student' USING ERRCODE = '55000';
    END IF;
    IF v_role = 'teacher' AND v_request.status <> 'pending_teacher_approval' THEN
      RAISE EXCEPTION 'not_awaiting_teacher' USING ERRCODE = '55000';
    END IF;

    -- A timely request may remain pending, but it expires at the original
    -- lesson start. Return the persisted cancellation so the API can explain it.
    IF now() >= v_request.original_scheduled_at THEN
      UPDATE public.lesson_reschedule_requests
      SET status = 'cancelled', responded_at = now(), closed_reason = 'expired_at_start'
      WHERE id = p_request_id
      RETURNING * INTO v_request;
      UPDATE public.lessons SET status = 'scheduled' WHERE id = v_request.lesson_id;
      RETURN v_request;
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended('lesson-reschedule:' || v_request.lesson_id::text, 0)
    );
    IF NOT public.reschedule_slot_is_available(
      v_request.lesson_id, v_request.proposed_scheduled_at
    ) THEN
      RAISE EXCEPTION 'slot_unavailable' USING ERRCODE = '23P01';
    END IF;

    UPDATE public.lesson_reschedule_requests
    SET status = 'approved', responded_at = now(), closed_reason = NULL
    WHERE id = p_request_id
    RETURNING * INTO v_request;

    UPDATE public.lessons
    SET scheduled_at = v_request.proposed_scheduled_at,
        status = 'scheduled'
    WHERE id = v_request.lesson_id;

    IF v_request.initiator = 'teacher'
       AND v_request.is_trial_request = false
       AND v_request.enrollment_id IS NOT NULL
       AND v_request.teacher_bonus_policy_applies THEN
      SELECT count(*) INTO v_teacher_approved_count
      FROM public.lesson_reschedule_requests request
      WHERE request.enrollment_id = v_request.enrollment_id
        AND request.teacher_id = v_request.teacher_id
        AND request.initiator = 'teacher'
        AND request.status = 'approved'
        AND request.is_trial_request = false
        AND request.teacher_bonus_policy_applies = true;

      IF v_teacher_approved_count >= 2 THEN
        INSERT INTO public.teacher_attendance_policy_events (
          teacher_id, enrollment_id, reschedule_request_id, event_month
        ) VALUES (
          v_request.teacher_id,
          v_request.enrollment_id,
          v_request.id,
          to_char(v_request.original_scheduled_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')
        ) ON CONFLICT (reschedule_request_id) DO NOTHING;
      END IF;
    END IF;
  ELSIF p_action = 'reject' THEN
    IF v_role = 'student' AND v_request.status <> 'pending_student_approval' THEN
      RAISE EXCEPTION 'not_awaiting_student' USING ERRCODE = '55000';
    END IF;
    IF v_role = 'teacher' AND v_request.status <> 'pending_teacher_approval' THEN
      RAISE EXCEPTION 'not_awaiting_teacher' USING ERRCODE = '55000';
    END IF;
    UPDATE public.lesson_reschedule_requests
    SET status = 'rejected', responded_at = now(), closed_reason = 'rejected'
    WHERE id = p_request_id
    RETURNING * INTO v_request;
    UPDATE public.lessons SET status = 'scheduled' WHERE id = v_request.lesson_id;
  ELSIF p_action = 'cancel' THEN
    IF v_role = 'admin' OR v_request.initiator::text <> v_role THEN
      RAISE EXCEPTION 'not_initiator' USING ERRCODE = '42501';
    END IF;
    UPDATE public.lesson_reschedule_requests
    SET status = 'cancelled', responded_at = now(), closed_reason = 'cancelled_by_initiator'
    WHERE id = p_request_id
    RETURNING * INTO v_request;
    UPDATE public.lessons SET status = 'scheduled' WHERE id = v_request.lesson_id;
  ELSE
    RAISE EXCEPTION 'invalid_action' USING ERRCODE = '22023';
  END IF;

  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_due_lesson_reschedule_requests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_count integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND public.is_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH expired AS (
    UPDATE public.lesson_reschedule_requests
    SET status = 'cancelled',
        responded_at = now(),
        closed_reason = 'expired_at_start'
    WHERE status IN ('pending_student_approval', 'pending_teacher_approval')
      AND original_scheduled_at <= now()
    RETURNING lesson_id
  ), restored AS (
    UPDATE public.lessons lesson
    SET status = 'scheduled'
    WHERE lesson.id IN (SELECT lesson_id FROM expired)
      AND lesson.status = 'reschedule_pending'
    RETURNING lesson.id
  )
  SELECT count(*) INTO v_count FROM expired;

  RETURN v_count;
END;
$$;

REVOKE ALL ON TABLE public.lesson_reschedule_requests FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.lesson_reschedule_requests FROM authenticated;
GRANT SELECT ON TABLE public.lesson_reschedule_requests TO authenticated;
GRANT ALL ON TABLE public.lesson_reschedule_requests TO service_role;

REVOKE ALL ON FUNCTION public.check_student_reschedule_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_lesson_reschedule_request(
  uuid, timestamptz, text, public.reschedule_initiator
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_lesson_reschedule_request(uuid, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expire_due_lesson_reschedule_requests()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_lesson_reschedule_request(
  uuid, timestamptz, text, public.reschedule_initiator
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.respond_lesson_reschedule_request(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expire_due_lesson_reschedule_requests()
  TO service_role;

COMMIT;
