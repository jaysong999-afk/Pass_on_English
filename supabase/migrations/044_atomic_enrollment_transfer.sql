BEGIN;

-- Read only the departing teacher's contracts. Keep response size bounded;
-- missing/overdue schedules are explicit blockers, never silently regenerated.
CREATE OR REPLACE FUNCTION public.admin_transfer_enrollments(p_from uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF public.is_admin() IS NOT TRUE THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF (SELECT count(*) FROM enrollments WHERE teacher_id = p_from
      AND status IN ('active', 'expiring_soon') AND sessions_remaining > 0) > 100 THEN
    RAISE EXCEPTION 'transfer_batch_too_large';
  END IF;
  IF (SELECT count(*) FROM lessons l JOIN enrollments e ON e.id = l.enrollment_id
      WHERE e.teacher_id = p_from AND e.status IN ('active','expiring_soon') AND e.sessions_remaining > 0
        AND l.status IN ('scheduled','reschedule_pending')) > 2000 THEN RAISE EXCEPTION 'transfer_batch_too_large'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'enrollmentId', e.id, 'studentId', e.student_id,
    'studentName', coalesce(nullif(s.english_name, ''), s.full_name, '—'),
    'planId', e.plan_id, 'planLabel', coalesce(p.description->'ko'->>'name', p.plan_type::text),
    'curriculum', coalesce(e.curriculum, ''),
    'scheduleDays', coalesce(p.description->'schedule_days', '[]'::jsonb),
    'slotLabel', concat_ws(' ', (SELECT string_agg(value,'·') FROM jsonb_array_elements_text(
      coalesce(nullif(p.description->'schedule_days','[]'::jsonb),
        CASE WHEN e.preferred_slot_day IS NOT NULL THEN jsonb_build_array(e.preferred_slot_day)
        ELSE '["Mon","Wed","Fri"]'::jsonb END))), coalesce(e.preferred_slot_time,'10:00')),
    'sessionsRemaining', e.sessions_remaining, 'sessionsTotal', e.sessions_total,
    'contractStart', coalesce(to_char(e.started_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD'), x.first_date),
    'contractEnd', coalesce(to_char(e.ended_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD'), x.last_date),
    'status', e.status, 'upcomingLessonCount', x.upcoming,
    'overdueOpenLessonCount', x.overdue, 'unresolvedLessonCount', x.unresolved,
    'scheduleInSync', x.upcoming = e.sessions_remaining AND x.overdue = 0 AND x.unresolved = x.upcoming,
    'upcomingLessons', x.upcoming_lessons
  ) ORDER BY e.created_at, e.id), '[]'::jsonb) INTO result
  FROM enrollments e JOIN students s ON s.id = e.student_id
  JOIN pricing_plans p ON p.id = e.plan_id
  CROSS JOIN LATERAL (
    SELECT count(*) FILTER (WHERE l.status IN ('scheduled','reschedule_pending') AND NOT l.is_trial
             AND l.teacher_id = p_from AND l.scheduled_at >= now()) AS upcoming,
           count(*) FILTER (WHERE l.status IN ('scheduled','reschedule_pending') AND NOT l.is_trial
             AND l.scheduled_at < now()) AS overdue,
           count(*) FILTER (WHERE l.status IN ('scheduled','reschedule_pending') AND NOT l.is_trial) AS unresolved,
           min(to_char(l.scheduled_at AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD')) AS first_date,
           max(to_char(l.scheduled_at AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD')) AS last_date,
           coalesce(jsonb_agg(jsonb_build_object('id',l.id,'scheduledAt',l.scheduled_at)
             ORDER BY l.scheduled_at) FILTER (WHERE l.status IN ('scheduled','reschedule_pending')
             AND NOT l.is_trial AND l.teacher_id = p_from AND l.scheduled_at >= now()), '[]'::jsonb) AS upcoming_lessons
    FROM lessons l WHERE l.enrollment_id = e.id
  ) x
  WHERE e.teacher_id = p_from AND e.status IN ('active','expiring_soon') AND e.sessions_remaining > 0;
  RETURN result;
END $$;

-- One shared validator for preview and execution; no weekly availability writes.
-- The execution lock is deliberately short and bounded to 100 contracts/2000
-- lessons. It also coordinates legacy writers that do not take advisory locks.
CREATE OR REPLACE FUNCTION public.admin_transfer_batch(p_from uuid, p_transfers jsonb, p_execute boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  item record; lesson record; target record; contract record;
  block_at timestamp; blocks integer; i integer; reason text; issues jsonb;
  total integer; movable integer; unresolved integer; preview jsonb := '{}'::jsonb;
  results jsonb := '[]'::jsonb; moved_ids jsonb; all_ok boolean := true;
  student_name text; affected integer;
BEGIN
  IF public.is_admin() IS NOT TRUE THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_from IS NULL OR p_execute IS NULL OR jsonb_typeof(p_transfers) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_transfer_request';
  END IF;
  IF jsonb_array_length(p_transfers) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_transfer_request'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_transfers) AS t("enrollmentId" uuid,"toTeacherId" uuid)
             WHERE t."enrollmentId" IS NULL OR t."toTeacherId" IS NULL OR t."toTeacherId" = p_from)
    OR (SELECT count(DISTINCT t."enrollmentId") FROM jsonb_to_recordset(p_transfers) AS t("enrollmentId" uuid))
       <> jsonb_array_length(p_transfers) THEN RAISE EXCEPTION 'invalid_transfer_request'; END IF;

  IF p_execute THEN
    -- Reads continue; concurrent writes wait or cause a retryable timeout.
    SET LOCAL lock_timeout = '3s';
    LOCK TABLE teachers, pricing_plans, enrollments, lessons, teachers_weekly_availability,
      teacher_availability_exceptions, lesson_reschedule_requests IN SHARE ROW EXCLUSIVE MODE;
  END IF;
  IF (SELECT count(*) FROM lessons l JOIN jsonb_to_recordset(p_transfers) AS t("enrollmentId" uuid)
      ON l.enrollment_id = t."enrollmentId" WHERE l.status IN ('scheduled','reschedule_pending')) > 2000 THEN
    RAISE EXCEPTION 'transfer_batch_too_large';
  END IF;

  FOR item IN SELECT * FROM jsonb_to_recordset(p_transfers) AS t("enrollmentId" uuid,"toTeacherId" uuid) LOOP
    issues := '[]'::jsonb; total := 0; movable := 0;
    SELECT e.id,e.student_id,e.teacher_id,e.status,e.sessions_remaining,e.is_trial,e.payment_status,
      e.preferred_slot_time,e.preferred_slot_day,p.session_minutes,p.description
      INTO contract FROM enrollments e JOIN pricing_plans p ON p.id=e.plan_id WHERE e.id = item."enrollmentId";
    SELECT t.id,t.status,t.display_name INTO target FROM teachers t WHERE t.id = item."toTeacherId";
    IF contract.id IS NULL OR contract.teacher_id <> p_from OR contract.status NOT IN ('active','expiring_soon')
      OR contract.is_trial OR coalesce(contract.sessions_remaining,0) <= 0 OR contract.payment_status = 'rejected' THEN
      issues := issues || jsonb_build_array(jsonb_build_object('reason','invalid_enrollment'));
    END IF;
    IF target.id IS NULL OR target.status <> 'active' THEN
      issues := issues || jsonb_build_array(jsonb_build_object('reason','teacher_inactive'));
    END IF;
    -- The contract's recurring hours also move. Validate these even if only
    -- one date remains, so later schedule maintenance cannot reopen off hours.
    IF contract.id IS NOT NULL AND EXISTS (
      SELECT 1 FROM generate_series(0,6) d(n)
      CROSS JOIN LATERAL generate_series(0,greatest(0,contract.session_minutes-1),20) b(minute_offset)
      CROSS JOIN LATERAL (SELECT date '2000-01-03' + d.n + coalesce(contract.preferred_slot_time,'10:00')::time
        + b.minute_offset * interval '1 minute' AS starts) w
      WHERE coalesce(nullif(contract.description->'schedule_days','[]'::jsonb),
        CASE WHEN contract.preferred_slot_day IS NOT NULL THEN jsonb_build_array(contract.preferred_slot_day)
        ELSE '["Mon","Wed","Fri"]'::jsonb END) ? (ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])[d.n+1]
        AND NOT EXISTS (SELECT 1 FROM teachers_weekly_availability a WHERE a.teacher_id=item."toTeacherId"
          AND a.day=(ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])[extract(isodow FROM w.starts)::int]
          AND a.start_time=w.starts::time)
    ) THEN issues := issues || jsonb_build_array(jsonb_build_object('reason','contract_availability_off')); END IF;
    SELECT count(*) INTO unresolved FROM lessons l WHERE l.enrollment_id = item."enrollmentId"
      AND NOT l.is_trial AND l.status IN ('scheduled','reschedule_pending');

    FOR lesson IN SELECT l.id,l.scheduled_at,l.duration_minutes,l.status
      FROM lessons l WHERE l.enrollment_id = item."enrollmentId" AND l.teacher_id = p_from
        AND NOT l.is_trial AND l.status IN ('scheduled','reschedule_pending') AND l.scheduled_at >= now()
      ORDER BY l.scheduled_at LOOP
      total := total + 1; reason := NULL;
      block_at := lesson.scheduled_at AT TIME ZONE 'Asia/Seoul';
      IF lesson.duration_minutes NOT BETWEEN 20 AND 1440 OR lesson.duration_minutes % 20 <> 0
        OR extract(minute FROM block_at)::int % 20 <> 0 OR extract(second FROM block_at) <> 0 THEN
        reason := 'invalid_lesson_time';
      ELSIF lesson.status = 'reschedule_pending' OR EXISTS (
        SELECT 1 FROM lesson_reschedule_requests r WHERE r.lesson_id = lesson.id
        AND r.status::text LIKE 'pending%'
      ) THEN reason := 'reschedule_pending';
      ELSE
        blocks := lesson.duration_minutes / 20;
        FOR i IN 0..blocks-1 LOOP
          IF EXISTS (SELECT 1 FROM teacher_availability_exceptions a WHERE a.teacher_id = item."toTeacherId"
            AND a.exception_date = block_at::date) OR NOT EXISTS (SELECT 1 FROM teachers_weekly_availability a
            WHERE a.teacher_id = item."toTeacherId"
              AND a.day::text = (ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])[extract(isodow FROM block_at)::int]
              AND a.start_time = block_at::time) THEN
            reason := 'availability_off'; EXIT;
          END IF;
          block_at := block_at + interval '20 minutes';
        END LOOP;
      END IF;
      IF reason IS NULL AND EXISTS (
        SELECT 1 FROM lessons other WHERE other.teacher_id = item."toTeacherId"
          AND other.status IN ('scheduled','reschedule_pending','pending_payment')
          AND other.scheduled_at < lesson.scheduled_at + make_interval(mins => lesson.duration_minutes)
          AND other.scheduled_at + make_interval(mins => other.duration_minutes) > lesson.scheduled_at
      ) THEN reason := 'lesson_conflict'; END IF;
      -- Pending and active contracts reserve weekly blocks, including dates
      -- whose lessons have not yet been materialized. Exclude only this batch.
      IF reason IS NULL AND EXISTS (
        SELECT 1 FROM enrollments e JOIN pricing_plans p ON p.id = e.plan_id
        WHERE e.teacher_id = item."toTeacherId" AND e.payment_status <> 'rejected'
          AND (e.status = 'pending_payment' OR (e.status IN ('active','expiring_soon') AND e.sessions_remaining > 0))
          AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_transfers) AS t("enrollmentId" uuid) WHERE t."enrollmentId" = e.id)
          AND EXISTS (
            SELECT 1 FROM generate_series(0,6) d(n)
            CROSS JOIN LATERAL (SELECT date_trunc('week',lesson.scheduled_at AT TIME ZONE 'Asia/Seoul')::date
              + d.n + coalesce(e.preferred_slot_time,'10:00')::time AS starts) w
            WHERE coalesce(nullif(p.description->'schedule_days','[]'::jsonb),
                    CASE WHEN e.preferred_slot_day IS NOT NULL THEN jsonb_build_array(e.preferred_slot_day)
                         ELSE '["Mon","Wed","Fri"]'::jsonb END) ? (ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])[d.n+1]
              AND w.starts < (lesson.scheduled_at AT TIME ZONE 'Asia/Seoul') + make_interval(mins => lesson.duration_minutes)
              AND w.starts + make_interval(mins => p.session_minutes) > (lesson.scheduled_at AT TIME ZONE 'Asia/Seoul')
          )
      ) THEN reason := 'contract_conflict'; END IF;
      IF reason IS NULL AND EXISTS (
        SELECT 1 FROM jsonb_to_recordset(p_transfers) AS t("enrollmentId" uuid,"toTeacherId" uuid)
        JOIN lessons other ON other.enrollment_id = t."enrollmentId"
        WHERE t."toTeacherId" = item."toTeacherId" AND other.id <> lesson.id
          AND other.teacher_id = p_from AND NOT other.is_trial AND other.scheduled_at >= now()
          AND other.status IN ('scheduled','reschedule_pending')
          AND extract(isodow FROM other.scheduled_at AT TIME ZONE 'Asia/Seoul') = extract(isodow FROM lesson.scheduled_at AT TIME ZONE 'Asia/Seoul')
          AND (other.scheduled_at AT TIME ZONE 'Asia/Seoul')::time < (lesson.scheduled_at AT TIME ZONE 'Asia/Seoul')::time + make_interval(mins => lesson.duration_minutes)
          AND (other.scheduled_at AT TIME ZONE 'Asia/Seoul')::time + make_interval(mins => other.duration_minutes) > (lesson.scheduled_at AT TIME ZONE 'Asia/Seoul')::time
          AND (t."enrollmentId" <> item."enrollmentId" OR other.scheduled_at::date = lesson.scheduled_at::date)
      ) THEN reason := 'batch_conflict'; END IF;
      IF reason IS NULL THEN movable := movable + 1;
      ELSE issues := issues || jsonb_build_array(jsonb_build_object('lessonId',lesson.id,'scheduledAt',lesson.scheduled_at,'reason',reason)); END IF;
    END LOOP;
    IF total = 0 OR total IS DISTINCT FROM contract.sessions_remaining OR unresolved <> total THEN
      issues := issues || jsonb_build_array(jsonb_build_object('reason','schedule_mismatch'));
    END IF;
    all_ok := all_ok AND jsonb_array_length(issues) = 0;
    preview := preview || jsonb_build_object(item."enrollmentId"::text, jsonb_build_object(
      'movableCount',movable,'totalScheduled',total,'canAbsorbAll',jsonb_array_length(issues)=0,
      'issues',issues,'toTeacherId',item."toTeacherId"));
  END LOOP;
  IF NOT p_execute OR NOT all_ok THEN
    RETURN jsonb_build_object('ok',all_ok,'slotsByEnrollment',preview,'transfers','[]'::jsonb);
  END IF;

  FOR item IN SELECT * FROM jsonb_to_recordset(p_transfers) AS t("enrollmentId" uuid,"toTeacherId" uuid) LOOP
    SELECT t.display_name INTO target FROM teachers t WHERE t.id = item."toTeacherId";
    SELECT coalesce(nullif(s.english_name,''),s.full_name,'—') INTO student_name
      FROM enrollments e JOIN students s ON s.id = e.student_id WHERE e.id = item."enrollmentId";
    WITH moved AS (
      UPDATE lessons SET teacher_id = item."toTeacherId", original_teacher_id = coalesce(original_teacher_id,p_from),
        operation_note = '휴직·퇴직 수강 일괄 이관'
      WHERE enrollment_id = item."enrollmentId" AND teacher_id = p_from AND NOT is_trial
        AND status = 'scheduled' AND scheduled_at >= now()
      RETURNING id,scheduled_at
    ), logged AS (
      INSERT INTO admin_lesson_operation_logs(teacher_id,lesson_id,student_name,scheduled_at,week_start_key,
        action,summary,note,admin_name,undoable)
      SELECT p_from,id,student_name,scheduled_at,date_trunc('week',scheduled_at AT TIME ZONE 'Asia/Seoul')::date,
        'assign_substitute','수강 일괄 이관 → ' || target.display_name,'계약 및 잔여 수업 전체 이관',auth.uid()::text,false
      FROM moved RETURNING lesson_id
    ) SELECT coalesce(jsonb_agg(lesson_id),'[]'::jsonb) INTO moved_ids FROM logged;
    IF jsonb_array_length(moved_ids) <> (preview->item."enrollmentId"::text->>'totalScheduled')::int THEN
      RAISE EXCEPTION 'transfer_changed_retry';
    END IF;
    UPDATE enrollments SET teacher_id = item."toTeacherId" WHERE id = item."enrollmentId" AND teacher_id = p_from;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'transfer_changed_retry'; END IF;
    results := results || jsonb_build_array(jsonb_build_object('enrollmentId',item."enrollmentId",
      'studentName',student_name,'toTeacherId',item."toTeacherId",'toTeacherName',target.display_name,
      'enrollmentUpdated',true,'lessonsMoved',jsonb_array_length(moved_ids),'lessonsSkipped',0,
      'skipReasons','[]'::jsonb,'lessonIds',moved_ids));
  END LOOP;
  RETURN jsonb_build_object('ok',true,'slotsByEnrollment',preview,'transfers',results);
END $$;

-- Enforce collision checks for legacy lesson writers too. A request that read
-- before a transfer must not insert a conflicting lesson after the commit.
-- Existing rows are not rewritten; unrelated updates remain possible.
CREATE OR REPLACE FUNCTION public.guard_lesson_teacher_overlap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status NOT IN ('scheduled','reschedule_pending','pending_payment') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('scheduled','reschedule_pending','pending_payment')
      AND (OLD.teacher_id,OLD.scheduled_at,OLD.duration_minutes) IS NOT DISTINCT FROM
          (NEW.teacher_id,NEW.scheduled_at,NEW.duration_minutes) THEN RETURN NEW; END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('lesson-teacher:' || NEW.teacher_id::text,0));
  IF EXISTS (SELECT 1 FROM lessons l WHERE l.teacher_id = NEW.teacher_id AND l.id <> NEW.id
    AND l.status IN ('scheduled','reschedule_pending','pending_payment')
    AND l.scheduled_at < NEW.scheduled_at + make_interval(mins => NEW.duration_minutes)
    AND l.scheduled_at + make_interval(mins => l.duration_minutes) > NEW.scheduled_at) THEN
    RAISE EXCEPTION 'teacher_lesson_overlap' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_lesson_teacher_overlap
BEFORE INSERT OR UPDATE OF teacher_id,scheduled_at,duration_minutes,status ON public.lessons
FOR EACH ROW EXECUTE FUNCTION public.guard_lesson_teacher_overlap();
REVOKE ALL ON FUNCTION public.guard_lesson_teacher_overlap() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_transfer_enrollments(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_transfer_batch(uuid,jsonb,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_transfer_enrollments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_transfer_batch(uuid,jsonb,boolean) TO authenticated;
COMMIT;
