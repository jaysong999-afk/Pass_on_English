-- Make reschedule/payroll state transitions atomic and prevent direct exposure
-- of profile private fields and teacher compensation columns.

CREATE OR REPLACE FUNCTION public.create_lesson_reschedule_request(
  p_lesson_id uuid,
  p_proposed_scheduled_at timestamptz,
  p_reason text,
  p_initiator public.reschedule_initiator,
  p_request_month text
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
BEGIN
  SELECT * INTO v_lesson FROM public.lessons WHERE id = p_lesson_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lesson_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_lesson.status NOT IN ('scheduled', 'reschedule_pending') THEN
    RAISE EXCEPTION 'lesson_not_eligible' USING ERRCODE = '22023';
  END IF;
  IF p_initiator = 'teacher' AND v_lesson.teacher_id <> auth.uid() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_initiator = 'student' AND NOT public.owns_student(v_lesson.student_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF public.current_user_role()::text <> p_initiator::text THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_lesson.teacher_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.lesson_reschedule_requests r
    WHERE r.lesson_id = p_lesson_id
      AND r.status IN ('pending_student_approval', 'pending_teacher_approval')
  ) THEN
    RAISE EXCEPTION 'pending_request_exists' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.lessons l
    WHERE l.teacher_id = v_lesson.teacher_id
      AND l.id <> v_lesson.id
      AND l.status IN ('scheduled', 'reschedule_pending')
      AND tstzrange(l.scheduled_at, l.scheduled_at + make_interval(mins => l.duration_minutes), '[)')
          && tstzrange(p_proposed_scheduled_at, p_proposed_scheduled_at + make_interval(mins => v_lesson.duration_minutes), '[)')
  ) THEN
    RAISE EXCEPTION 'slot_unavailable' USING ERRCODE = '23P01';
  END IF;

  v_status := CASE WHEN p_initiator = 'teacher'
    THEN 'pending_student_approval'::public.reschedule_status
    ELSE 'pending_teacher_approval'::public.reschedule_status END;
  INSERT INTO public.lesson_reschedule_requests (
    lesson_id, teacher_id, student_id, initiator, original_scheduled_at,
    proposed_scheduled_at, status, reason, request_month
  ) VALUES (
    v_lesson.id, v_lesson.teacher_id, v_lesson.student_id, p_initiator,
    v_lesson.scheduled_at, p_proposed_scheduled_at, v_status,
    NULLIF(pg_catalog.btrim(p_reason), ''), p_request_month
  ) RETURNING * INTO v_request;

  UPDATE public.lessons SET status = 'reschedule_pending' WHERE id = v_lesson.id;
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
BEGIN
  SELECT * INTO v_request FROM public.lesson_reschedule_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_request.status NOT IN ('pending_student_approval', 'pending_teacher_approval') THEN
    RAISE EXCEPTION 'not_pending' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO v_lesson FROM public.lessons WHERE id = v_request.lesson_id FOR UPDATE;
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
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_request.teacher_id::text, 0));
    IF EXISTS (
      SELECT 1 FROM public.lessons l
      WHERE l.teacher_id = v_request.teacher_id
        AND l.id <> v_lesson.id
        AND l.status IN ('scheduled', 'reschedule_pending')
        AND tstzrange(l.scheduled_at, l.scheduled_at + make_interval(mins => l.duration_minutes), '[)')
            && tstzrange(v_request.proposed_scheduled_at, v_request.proposed_scheduled_at + make_interval(mins => v_lesson.duration_minutes), '[)')
    ) THEN
      RAISE EXCEPTION 'slot_unavailable' USING ERRCODE = '23P01';
    END IF;
    UPDATE public.lesson_reschedule_requests
      SET status = 'approved', responded_at = now()
      WHERE id = p_request_id RETURNING * INTO v_request;
    UPDATE public.lessons
      SET scheduled_at = v_request.proposed_scheduled_at, status = 'scheduled'
      WHERE id = v_request.lesson_id;
  ELSIF p_action = 'reject' THEN
    IF v_role = 'student' AND v_request.status <> 'pending_student_approval' THEN
      RAISE EXCEPTION 'not_awaiting_student' USING ERRCODE = '55000';
    END IF;
    IF v_role = 'teacher' AND v_request.status <> 'pending_teacher_approval' THEN
      RAISE EXCEPTION 'not_awaiting_teacher' USING ERRCODE = '55000';
    END IF;
    UPDATE public.lesson_reschedule_requests
      SET status = 'rejected', responded_at = now()
      WHERE id = p_request_id RETURNING * INTO v_request;
    UPDATE public.lessons SET status = 'scheduled' WHERE id = v_request.lesson_id;
  ELSIF p_action = 'cancel' THEN
    IF v_role = 'admin' OR v_request.initiator::text <> v_role THEN
      RAISE EXCEPTION 'not_initiator' USING ERRCODE = '42501';
    END IF;
    UPDATE public.lesson_reschedule_requests
      SET status = 'cancelled', responded_at = now()
      WHERE id = p_request_id RETURNING * INTO v_request;
    UPDATE public.lessons SET status = 'scheduled' WHERE id = v_request.lesson_id;
  ELSE
    RAISE EXCEPTION 'invalid_action' USING ERRCODE = '22023';
  END IF;
  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_teacher_salary_settlement(
  p_statement_id uuid,
  p_krw_transfer_amount numeric
)
RETURNS public.teacher_salary_statements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_statement public.teacher_salary_statements%ROWTYPE;
  v_teacher_name text;
  v_php_total numeric;
  v_tx_id uuid;
  v_date date;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_krw_transfer_amount IS NULL OR p_krw_transfer_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_statement FROM public.teacher_salary_statements
    WHERE id = p_statement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_statement.status = 'completed' AND v_statement.finance_transaction_id IS NOT NULL THEN
    RETURN v_statement;
  END IF;
  IF v_statement.status <> 'paid' THEN RAISE EXCEPTION 'invalid_state' USING ERRCODE = '55000'; END IF;

  SELECT display_name INTO v_teacher_name FROM public.teachers WHERE id = v_statement.teacher_id;
  v_php_total := v_statement.base_salary + v_statement.perfect_attendance_bonus
    + v_statement.quarterly_bonus + v_statement.other_incentives - v_statement.deductions;
  v_date := COALESCE(v_statement.php_paid_at, CURRENT_DATE);

  INSERT INTO public.finance_transactions (
    transaction_date, type, category, description, currency, amount, amount_krw,
    supply_amount, vat_amount, tax_treatment, source, teacher_id, teacher_name,
    salary_statement_id
  ) VALUES (
    v_date, 'expense', 'teacher_payroll',
    COALESCE(v_teacher_name, 'Teacher') || ' — ' || v_statement.month || ' salary settlement',
    'PHP', v_php_total, p_krw_transfer_amount, v_php_total, 0, 'zero_rated',
    'auto', v_statement.teacher_id, v_teacher_name, v_statement.id
  )
  ON CONFLICT (salary_statement_id) WHERE salary_statement_id IS NOT NULL
  DO UPDATE SET
    transaction_date = EXCLUDED.transaction_date,
    amount = EXCLUDED.amount,
    amount_krw = EXCLUDED.amount_krw,
    supply_amount = EXCLUDED.supply_amount,
    teacher_name = EXCLUDED.teacher_name
  RETURNING id INTO v_tx_id;

  UPDATE public.teacher_salary_statements SET
    status = 'completed', krw_transfer_amount = p_krw_transfer_amount,
    completed_at = now(), finance_transaction_id = v_tx_id,
    is_live_estimate = false
  WHERE id = p_statement_id RETURNING * INTO v_statement;
  RETURN v_statement;
END;
$$;

ALTER FUNCTION public.create_lesson_reschedule_request(uuid, timestamptz, text, public.reschedule_initiator, text) OWNER TO postgres;
ALTER FUNCTION public.respond_lesson_reschedule_request(uuid, text) OWNER TO postgres;
ALTER FUNCTION public.complete_teacher_salary_settlement(uuid, numeric) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_lesson_reschedule_request(uuid, timestamptz, text, public.reschedule_initiator, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_lesson_reschedule_request(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_teacher_salary_settlement(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_lesson_reschedule_request(uuid, timestamptz, text, public.reschedule_initiator, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_lesson_reschedule_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_teacher_salary_settlement(uuid, numeric) TO authenticated;

-- Authenticated users may read only their own profile row (admins retain all rows).
-- Anonymous users retain public teacher identity columns only.
CREATE OR REPLACE FUNCTION public.can_read_profile(p_profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN EXISTS (
      SELECT 1 FROM public.teachers t WHERE t.id = p_profile_id AND t.status = 'active'
    )
    ELSE p_profile_id = auth.uid() OR public.is_admin()
  END;
$$;
ALTER FUNCTION public.can_read_profile(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_read_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_profile(uuid) TO anon, authenticated;

REVOKE SELECT ON TABLE public.teachers FROM anon, authenticated;
GRANT SELECT (id, display_name, bio, specialties, experience_years, status, timezone, created_at, updated_at)
  ON TABLE public.teachers TO anon, authenticated;
