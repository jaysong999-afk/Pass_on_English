-- Fixed-quarter bonuses, annual rate reviews and auditable no-show penalties.
-- Existing completed salary statements remain immutable snapshots.

BEGIN;

ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS employment_started_at date,
  ADD COLUMN IF NOT EXISTS employment_started_at_verified boolean NOT NULL DEFAULT false;

UPDATE public.teachers teacher
SET employment_started_at = COALESCE(
  (
    SELECT MIN((statement.month || '-01')::date)
    FROM public.teacher_salary_statements statement
    WHERE statement.teacher_id = teacher.id
      AND statement.status = 'completed'
      AND (
        statement.base_salary + statement.perfect_attendance_bonus
        + statement.quarterly_bonus + statement.other_incentives
        - statement.deductions
      ) > 0
  ),
  (
    SELECT MIN((lesson.scheduled_at AT TIME ZONE 'Asia/Seoul')::date)
    FROM public.lessons lesson
    WHERE lesson.teacher_id = teacher.id
      AND lesson.status = 'completed'
  ),
  teacher.created_at::date
)
WHERE teacher.employment_started_at IS NULL;

ALTER TABLE public.teacher_monthly_attendance
  ADD COLUMN IF NOT EXISTS eligible_classes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_classes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS no_show_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.quarterly_bonus_records
  ADD COLUMN IF NOT EXISTS earning_start_month text,
  ADD COLUMN IF NOT EXISTS earning_end_month text,
  ADD COLUMN IF NOT EXISTS payout_month text,
  ADD COLUMN IF NOT EXISTS eligible boolean,
  ADD COLUMN IF NOT EXISTS disqualification_reason text,
  ADD COLUMN IF NOT EXISTS computed_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS uq_quarterly_bonus_teacher_payout
  ON public.quarterly_bonus_records (teacher_id, payout_month);

CREATE TABLE IF NOT EXISTS public.teacher_compensation_reviews (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  cycle_number integer NOT NULL CHECK (cycle_number > 0),
  qualifying_payout_count integer NOT NULL CHECK (qualifying_payout_count >= 12),
  eligible_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('pending', 'deferred', 'approved', 'no_change')),
  previous_hourly_rate_php numeric(10,2) NOT NULL,
  new_hourly_rate_php numeric(10,2),
  effective_month text,
  deferred_until date,
  review_note text,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, cycle_number),
  CHECK (effective_month IS NULL OR effective_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CHECK (
    status <> 'approved'
    OR (new_hourly_rate_php IS NOT NULL AND new_hourly_rate_php > 0 AND effective_month IS NOT NULL)
  ),
  CHECK (status <> 'deferred' OR deferred_until IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_teacher_comp_reviews_status
  ON public.teacher_compensation_reviews (status, deferred_until, eligible_at DESC);

CREATE TABLE IF NOT EXISTS public.teacher_hourly_rate_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  previous_hourly_rate_php numeric(10,2) NOT NULL,
  hourly_rate_php numeric(10,2) NOT NULL CHECK (hourly_rate_php > 0),
  effective_month text NOT NULL CHECK (effective_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  source text NOT NULL CHECK (source IN ('annual_review', 'manual_adjustment', 'bulk_adjustment')),
  review_id uuid REFERENCES public.teacher_compensation_reviews(id) ON DELETE SET NULL,
  reason text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_rate_review
  ON public.teacher_hourly_rate_history (review_id)
  WHERE review_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_teacher_rate_history_effective
  ON public.teacher_hourly_rate_history (teacher_id, effective_month DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.teacher_payroll_penalty_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE RESTRICT,
  operation_log_id uuid REFERENCES public.admin_lesson_operation_logs(id) ON DELETE SET NULL,
  salary_month text NOT NULL CHECK (salary_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  kind text NOT NULL DEFAULT 'teacher_no_show' CHECK (kind = 'teacher_no_show'),
  occurred_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  hourly_rate_snapshot_php numeric(10,2) NOT NULL CHECK (hourly_rate_snapshot_php >= 0),
  unpaid_amount_php numeric(10,2) NOT NULL CHECK (unpaid_amount_php >= 0),
  deduction_amount_php numeric(10,2) NOT NULL CHECK (deduction_amount_php >= 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reversed')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  reversed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reversal_reason text,
  UNIQUE (lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_teacher_penalty_events_month
  ON public.teacher_payroll_penalty_events (teacher_id, salary_month, status, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_penalty_events_operation
  ON public.teacher_payroll_penalty_events (operation_log_id)
  WHERE operation_log_id IS NOT NULL;

ALTER TABLE public.teacher_compensation_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_hourly_rate_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_payroll_penalty_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_teacher_compensation_reviews_admin ON public.teacher_compensation_reviews;
CREATE POLICY rls_teacher_compensation_reviews_admin
  ON public.teacher_compensation_reviews FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS rls_teacher_rate_history_admin ON public.teacher_hourly_rate_history;
CREATE POLICY rls_teacher_rate_history_admin
  ON public.teacher_hourly_rate_history FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS rls_teacher_rate_history_own ON public.teacher_hourly_rate_history;
CREATE POLICY rls_teacher_rate_history_own
  ON public.teacher_hourly_rate_history FOR SELECT
  USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS rls_teacher_penalty_events_admin ON public.teacher_payroll_penalty_events;
CREATE POLICY rls_teacher_penalty_events_admin
  ON public.teacher_payroll_penalty_events FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS rls_teacher_penalty_events_own ON public.teacher_payroll_penalty_events;
CREATE POLICY rls_teacher_penalty_events_own
  ON public.teacher_payroll_penalty_events FOR SELECT
  USING (teacher_id = auth.uid());

REVOKE ALL ON public.teacher_compensation_reviews FROM anon, authenticated;
REVOKE ALL ON public.teacher_hourly_rate_history FROM anon, authenticated;
REVOKE ALL ON public.teacher_payroll_penalty_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.teacher_compensation_reviews TO authenticated;
GRANT SELECT, INSERT ON public.teacher_hourly_rate_history TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.teacher_payroll_penalty_events TO authenticated;
GRANT ALL ON public.teacher_compensation_reviews TO service_role;
GRANT ALL ON public.teacher_hourly_rate_history TO service_role;
GRANT ALL ON public.teacher_payroll_penalty_events TO service_role;

CREATE OR REPLACE FUNCTION public.apply_due_teacher_hourly_rates()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH due AS (
    SELECT DISTINCT ON (history.teacher_id)
      history.teacher_id,
      history.hourly_rate_php
    FROM public.teacher_hourly_rate_history history
    WHERE history.effective_month <= to_char(CURRENT_DATE, 'YYYY-MM')
    ORDER BY history.teacher_id, history.effective_month DESC, history.created_at DESC
  )
  UPDATE public.teachers teacher
  SET hourly_rate_php = due.hourly_rate_php,
      updated_at = now()
  FROM due
  WHERE teacher.id = due.teacher_id
    AND teacher.hourly_rate_php IS DISTINCT FROM due.hourly_rate_php;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_teacher_compensation_overview(
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH eligible_teachers AS (
    SELECT
      teacher.id,
      teacher.display_name,
      teacher.status::text,
      teacher.hourly_rate_php,
      COALESCE(teacher.employment_started_at, teacher.created_at::date) AS employment_started_at,
      teacher.employment_started_at_verified,
      (
        EXTRACT(YEAR FROM age(CURRENT_DATE, COALESCE(teacher.employment_started_at, teacher.created_at::date)))::integer * 12
        + EXTRACT(MONTH FROM age(CURRENT_DATE, COALESCE(teacher.employment_started_at, teacher.created_at::date)))::integer
      ) AS tenure_months
    FROM public.teachers teacher
    WHERE teacher.status::text IN ('active', 'on_leave')
  ),
  completed_ranked AS (
    SELECT
      statement.*,
      row_number() OVER (
        PARTITION BY statement.teacher_id
        ORDER BY statement.completed_at DESC NULLS LAST, statement.month DESC
      ) AS recent_rank
    FROM public.teacher_salary_statements statement
    WHERE statement.status = 'completed'
      AND (
        statement.base_salary + statement.perfect_attendance_bonus
        + statement.quarterly_bonus + statement.other_incentives
        - statement.deductions
      ) > 0
  ),
  salary_metrics AS (
    SELECT
      ranked.teacher_id,
      count(*)::integer AS completed_payout_count,
      COALESCE(sum(ranked.completed_classes) FILTER (WHERE ranked.recent_rank <= 12), 0)::integer AS recent_completed_classes,
      COALESCE(sum(ranked.total_hours) FILTER (WHERE ranked.recent_rank <= 12), 0)::numeric AS recent_total_hours,
      count(*) FILTER (
        WHERE ranked.recent_rank <= 12 AND ranked.perfect_attendance_bonus > 0
      )::integer AS recent_perfect_months,
      count(*) FILTER (WHERE ranked.quarterly_bonus > 0)::integer AS quarterly_bonus_count
    FROM completed_ranked ranked
    GROUP BY ranked.teacher_id
  ),
  penalty_metrics AS (
    SELECT
      event.teacher_id,
      count(*) FILTER (WHERE event.status = 'active')::integer AS lifetime_no_show_count,
      count(*) FILTER (
        WHERE event.status = 'active'
          AND event.occurred_at >= now() - interval '12 months'
      )::integer AS recent_no_show_count,
      COALESCE(sum(event.deduction_amount_php) FILTER (WHERE event.status = 'active'), 0)::numeric AS total_penalty_php
    FROM public.teacher_payroll_penalty_events event
    GROUP BY event.teacher_id
  ),
  review_metrics AS (
    SELECT
      review.teacher_id,
      max(review.cycle_number) FILTER (WHERE review.status IN ('approved', 'no_change'))::integer AS closed_cycle,
      (array_agg(review.status ORDER BY review.cycle_number DESC, review.updated_at DESC))[1] AS latest_status,
      (array_agg(review.deferred_until ORDER BY review.cycle_number DESC, review.updated_at DESC))[1] AS deferred_until,
      (array_agg(review.cycle_number ORDER BY review.cycle_number DESC, review.updated_at DESC))[1] AS latest_cycle
    FROM public.teacher_compensation_reviews review
    GROUP BY review.teacher_id
  ),
  combined AS (
    SELECT
      teacher.*,
      COALESCE(salary.completed_payout_count, 0) AS completed_payout_count,
      COALESCE(salary.recent_completed_classes, 0) AS recent_completed_classes,
      COALESCE(salary.recent_total_hours, 0) AS recent_total_hours,
      COALESCE(salary.recent_perfect_months, 0) AS recent_perfect_months,
      COALESCE(salary.quarterly_bonus_count, 0) AS quarterly_bonus_count,
      COALESCE(penalty.lifetime_no_show_count, 0) AS lifetime_no_show_count,
      COALESCE(penalty.recent_no_show_count, 0) AS recent_no_show_count,
      COALESCE(penalty.total_penalty_php, 0) AS total_penalty_php,
      COALESCE(review.closed_cycle, 0) AS closed_cycle,
      review.latest_status,
      review.deferred_until,
      COALESCE(review.latest_cycle, 0) AS latest_cycle,
      floor(COALESCE(salary.completed_payout_count, 0) / 12.0)::integer AS eligible_cycle
    FROM eligible_teachers teacher
    LEFT JOIN salary_metrics salary ON salary.teacher_id = teacher.id
    LEFT JOIN penalty_metrics penalty ON penalty.teacher_id = teacher.id
    LEFT JOIN review_metrics review ON review.teacher_id = teacher.id
  ),
  rows AS (
    SELECT
      combined.*,
      (
        combined.eligible_cycle > combined.closed_cycle
        OR combined.latest_status = 'pending'
        OR (
          combined.latest_status = 'deferred'
          AND (combined.deferred_until IS NULL OR combined.deferred_until <= CURRENT_DATE)
        )
      ) AS review_due,
      CASE
        WHEN combined.eligible_cycle > combined.closed_cycle
          OR combined.latest_status IN ('pending', 'deferred') THEN 0
        WHEN mod(combined.completed_payout_count, 12) = 0 THEN 12
        ELSE 12 - mod(combined.completed_payout_count, 12)
      END AS payouts_until_review
    FROM combined
  ),
  paged AS (
    SELECT *
    FROM rows
    ORDER BY review_due DESC, recent_no_show_count DESC, tenure_months DESC, display_name
    LIMIT LEAST(GREATEST(p_limit, 1), 200)
    OFFSET GREATEST(p_offset, 0)
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'teacherCount', (SELECT count(*) FROM rows),
      'reviewDueCount', (SELECT count(*) FROM rows WHERE review_due),
      'recentPenaltyTeacherCount', (SELECT count(*) FROM rows WHERE recent_no_show_count > 0),
      'quarterlyBonusAchieverCount', (SELECT count(*) FROM rows WHERE quarterly_bonus_count > 0)
    ),
    'rows', COALESCE((SELECT jsonb_agg(to_jsonb(paged)) FROM paged), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_save_teacher_compensation_review(
  p_teacher_id uuid,
  p_cycle_number integer,
  p_status text,
  p_new_hourly_rate_php numeric DEFAULT NULL,
  p_effective_month text DEFAULT NULL,
  p_deferred_until date DEFAULT NULL,
  p_review_note text DEFAULT NULL
)
RETURNS public.teacher_compensation_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_teacher public.teachers%ROWTYPE;
  v_review public.teacher_compensation_reviews%ROWTYPE;
  v_payout_count integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('approved', 'no_change', 'deferred') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;
  IF p_cycle_number < 1 THEN
    RAISE EXCEPTION 'invalid_cycle' USING ERRCODE = '22023';
  END IF;
  IF p_status = 'approved' AND (
    p_new_hourly_rate_php IS NULL OR p_new_hourly_rate_php <= 0
    OR p_effective_month IS NULL OR p_effective_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  ) THEN
    RAISE EXCEPTION 'invalid_rate_review' USING ERRCODE = '22023';
  END IF;
  IF p_status = 'deferred' AND p_deferred_until IS NULL THEN
    RAISE EXCEPTION 'deferred_date_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_teacher FROM public.teachers WHERE id = p_teacher_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'teacher_not_found' USING ERRCODE = 'P0002'; END IF;

  SELECT count(*)::integer INTO v_payout_count
  FROM public.teacher_salary_statements statement
  WHERE statement.teacher_id = p_teacher_id
    AND statement.status = 'completed'
    AND (
      statement.base_salary + statement.perfect_attendance_bonus
      + statement.quarterly_bonus + statement.other_incentives
      - statement.deductions
    ) > 0;

  IF v_payout_count < p_cycle_number * 12 THEN
    RAISE EXCEPTION 'review_not_due' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.teacher_compensation_reviews (
    teacher_id, cycle_number, qualifying_payout_count, status,
    previous_hourly_rate_php, new_hourly_rate_php, effective_month,
    deferred_until, review_note, reviewed_by, reviewed_at, updated_at
  ) VALUES (
    p_teacher_id, p_cycle_number, v_payout_count, p_status,
    COALESCE(v_teacher.hourly_rate_php, 0),
    CASE WHEN p_status = 'approved' THEN p_new_hourly_rate_php ELSE NULL END,
    CASE WHEN p_status = 'approved' THEN p_effective_month ELSE NULL END,
    CASE WHEN p_status = 'deferred' THEN p_deferred_until ELSE NULL END,
    NULLIF(btrim(p_review_note), ''), auth.uid(), now(), now()
  )
  ON CONFLICT (teacher_id, cycle_number) DO UPDATE SET
    qualifying_payout_count = EXCLUDED.qualifying_payout_count,
    status = EXCLUDED.status,
    new_hourly_rate_php = EXCLUDED.new_hourly_rate_php,
    effective_month = EXCLUDED.effective_month,
    deferred_until = EXCLUDED.deferred_until,
    review_note = EXCLUDED.review_note,
    reviewed_by = EXCLUDED.reviewed_by,
    reviewed_at = EXCLUDED.reviewed_at,
    updated_at = now()
  RETURNING * INTO v_review;

  IF p_status = 'approved' THEN
    INSERT INTO public.teacher_hourly_rate_history (
      teacher_id, previous_hourly_rate_php, hourly_rate_php, effective_month,
      source, review_id, reason, created_by
    ) VALUES (
      p_teacher_id, COALESCE(v_teacher.hourly_rate_php, 0), p_new_hourly_rate_php,
      p_effective_month, 'annual_review', v_review.id,
      COALESCE(NULLIF(btrim(p_review_note), ''), '연간 기본 시급 인상 심사'), auth.uid()
    )
    ON CONFLICT (review_id) WHERE review_id IS NOT NULL DO UPDATE SET
      previous_hourly_rate_php = EXCLUDED.previous_hourly_rate_php,
      hourly_rate_php = EXCLUDED.hourly_rate_php,
      effective_month = EXCLUDED.effective_month,
      reason = EXCLUDED.reason,
      created_by = EXCLUDED.created_by,
      created_at = now();

    IF p_effective_month <= to_char(CURRENT_DATE, 'YYYY-MM') THEN
      UPDATE public.teachers
      SET hourly_rate_php = p_new_hourly_rate_php, updated_at = now()
      WHERE id = p_teacher_id;
    END IF;
  END IF;

  RETURN v_review;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_teacher_employment_start(
  p_teacher_id uuid,
  p_employment_started_at date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_employment_started_at IS NULL OR p_employment_started_at > CURRENT_DATE THEN
    RAISE EXCEPTION 'invalid_start_date' USING ERRCODE = '22023';
  END IF;
  UPDATE public.teachers
  SET employment_started_at = p_employment_started_at,
      employment_started_at_verified = true,
      updated_at = now()
  WHERE id = p_teacher_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'teacher_not_found' USING ERRCODE = 'P0002'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_schedule_teacher_hourly_rate(
  p_teacher_id uuid,
  p_hourly_rate_php numeric,
  p_effective_month text,
  p_source text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_previous_rate numeric(10,2);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_hourly_rate_php IS NULL OR p_hourly_rate_php <= 0
    OR p_effective_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    OR p_source NOT IN ('manual_adjustment', 'bulk_adjustment')
    OR NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'invalid_rate_change' USING ERRCODE = '22023';
  END IF;

  SELECT hourly_rate_php INTO v_previous_rate
  FROM public.teachers WHERE id = p_teacher_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'teacher_not_found' USING ERRCODE = 'P0002'; END IF;

  INSERT INTO public.teacher_hourly_rate_history (
    teacher_id, previous_hourly_rate_php, hourly_rate_php, effective_month,
    source, reason, created_by
  ) VALUES (
    p_teacher_id, COALESCE(v_previous_rate, 0), p_hourly_rate_php,
    p_effective_month, p_source, btrim(p_reason), auth.uid()
  );

  IF p_effective_month <= to_char(CURRENT_DATE, 'YYYY-MM') THEN
    UPDATE public.teachers
    SET hourly_rate_php = p_hourly_rate_php, updated_at = now()
    WHERE id = p_teacher_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_bulk_schedule_teacher_hourly_rate(
  p_teacher_ids uuid[],
  p_hourly_rate_php numeric,
  p_effective_month text,
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_hourly_rate_php IS NULL OR p_hourly_rate_php <= 0
    OR p_effective_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    OR NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'invalid_rate_change' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.teacher_hourly_rate_history (
    teacher_id, previous_hourly_rate_php, hourly_rate_php, effective_month,
    source, reason, created_by
  )
  SELECT teacher.id, COALESCE(teacher.hourly_rate_php, 0), p_hourly_rate_php,
         p_effective_month, 'bulk_adjustment', btrim(p_reason), auth.uid()
  FROM public.teachers teacher
  WHERE teacher.id = ANY(p_teacher_ids)
    AND teacher.hourly_rate_php IS DISTINCT FROM p_hourly_rate_php;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF p_effective_month <= to_char(CURRENT_DATE, 'YYYY-MM') THEN
    UPDATE public.teachers
    SET hourly_rate_php = p_hourly_rate_php, updated_at = now()
    WHERE id = ANY(p_teacher_ids)
      AND hourly_rate_php IS DISTINCT FROM p_hourly_rate_php;
  END IF;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_apply_teacher_no_show(
  p_lesson_id uuid,
  p_makeup_scheduled_at timestamptz,
  p_week_start_key date,
  p_note text,
  p_admin_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_lesson public.lessons%ROWTYPE;
  v_teacher_id uuid;
  v_rate numeric(10,2);
  v_amount numeric(10,2);
  v_month text;
  v_makeup_id uuid := public.uuid_generate_v4();
  v_log_id uuid := public.uuid_generate_v4();
  v_event_id uuid := public.uuid_generate_v4();
  v_student_name text;
  v_previous_ended_at timestamptz;
  v_existing public.teacher_payroll_penalty_events%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_existing
  FROM public.teacher_payroll_penalty_events
  WHERE lesson_id = p_lesson_id AND status = 'active';
  IF FOUND THEN
    RETURN jsonb_build_object(
      'originalLessonId', p_lesson_id,
      'makeupLessonId', (SELECT related_lesson_id FROM public.lessons WHERE id = p_lesson_id),
      'operationLogId', v_existing.operation_log_id,
      'penaltyEventId', v_existing.id,
      'deductionAmountPhp', v_existing.deduction_amount_php
    );
  END IF;

  SELECT * INTO v_lesson FROM public.lessons WHERE id = p_lesson_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lesson_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_lesson.status NOT IN ('scheduled', 'reschedule_pending') THEN
    RAISE EXCEPTION 'lesson_not_active' USING ERRCODE = '55000';
  END IF;
  IF p_makeup_scheduled_at IS NULL OR p_makeup_scheduled_at <= v_lesson.scheduled_at THEN
    RAISE EXCEPTION 'invalid_makeup_time' USING ERRCODE = '22023';
  END IF;

  v_teacher_id := COALESCE(v_lesson.original_teacher_id, v_lesson.teacher_id);
  SELECT COALESCE(hourly_rate_php, 0) INTO v_rate FROM public.teachers WHERE id = v_teacher_id;
  v_amount := round((v_lesson.duration_minutes::numeric / 60) * v_rate, 2);
  v_month := to_char(v_lesson.scheduled_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM');
  SELECT COALESCE(NULLIF(english_name, ''), full_name, 'Student')
    INTO v_student_name FROM public.students WHERE id = v_lesson.student_id;

  IF v_lesson.enrollment_id IS NOT NULL THEN
    SELECT ended_at INTO v_previous_ended_at
    FROM public.enrollments WHERE id = v_lesson.enrollment_id FOR UPDATE;

    UPDATE public.enrollments enrollment
    SET sessions_total = enrollment.sessions_total + 1,
        ended_at = GREATEST(
          COALESCE(enrollment.ended_at, p_makeup_scheduled_at),
          p_makeup_scheduled_at
        ),
        session_adjustments = jsonb_build_array(jsonb_build_object(
          'id', 'adj-' || replace(public.uuid_generate_v4()::text, '-', ''),
          'at', now(),
          'adminName', COALESCE(NULLIF(btrim(p_admin_name), ''), '관리자'),
          'deltaRemaining', 0,
          'previousRemaining', enrollment.sessions_remaining,
          'newRemaining', enrollment.sessions_remaining,
          'previousTotal', enrollment.sessions_total,
          'newTotal', enrollment.sessions_total + 1,
          'reason', '선생님 노쇼 — 수업 1회 보상'
        )) || COALESCE(enrollment.session_adjustments, '[]'::jsonb)
    WHERE enrollment.id = v_lesson.enrollment_id;
  END IF;

  INSERT INTO public.lessons (
    id, enrollment_id, teacher_id, student_id, scheduled_at, duration_minutes,
    status, is_trial, unpaid_for_teacher, original_teacher_id, related_lesson_id,
    operation_note
  ) VALUES (
    v_makeup_id, v_lesson.enrollment_id, v_lesson.teacher_id, v_lesson.student_id,
    p_makeup_scheduled_at, v_lesson.duration_minutes, 'scheduled', false, true,
    v_teacher_id, p_lesson_id, '노쇼 보강 수업 (노쇼 선생님 무급)'
  );

  UPDATE public.lessons
  SET status = 'cancelled',
      teacher_no_show = true,
      unpaid_for_teacher = true,
      cancel_reason = 'teacher_no_show',
      related_lesson_id = v_makeup_id,
      operation_note = COALESCE(NULLIF(btrim(p_note), ''), '선생님 노쇼 처리')
  WHERE id = p_lesson_id;

  INSERT INTO public.admin_lesson_operation_logs (
    id, teacher_id, lesson_id, student_name, scheduled_at, week_start_key,
    action, summary, note, admin_name, undoable, undo_payload
  ) VALUES (
    v_log_id, v_teacher_id, p_lesson_id, v_student_name, v_lesson.scheduled_at,
    p_week_start_key, 'teacher_no_show',
    '선생님 노쇼 처리 · 보강 수업 생성 · 급여 추가 공제',
    COALESCE(NULLIF(btrim(p_note), ''), '선생님 노쇼 처리'),
    COALESCE(NULLIF(btrim(p_admin_name), ''), '관리자'), true,
    jsonb_build_object(
      'type', 'teacher_no_show',
      'originalLesson', jsonb_build_object(
        'id', v_lesson.id,
        'enrollmentId', v_lesson.enrollment_id,
        'teacherId', v_lesson.teacher_id,
        'studentId', v_lesson.student_id,
        'scheduledAt', v_lesson.scheduled_at,
        'durationMinutes', v_lesson.duration_minutes,
        'status', v_lesson.status,
        'isTrial', v_lesson.is_trial,
        'studentAbsent', v_lesson.student_absent,
        'teacherNoShow', v_lesson.teacher_no_show,
        'unpaidForTeacher', v_lesson.unpaid_for_teacher,
        'cancelReason', v_lesson.cancel_reason,
        'originalTeacherId', v_lesson.original_teacher_id,
        'relatedLessonId', v_lesson.related_lesson_id,
        'operationNote', v_lesson.operation_note
      ),
      'makeupLessonId', v_makeup_id,
      'enrollmentId', v_lesson.enrollment_id,
      'enrollmentDeltaRemaining', 0,
      'enrollmentDeltaTotal', CASE WHEN v_lesson.enrollment_id IS NULL THEN 0 ELSE 1 END,
      'penaltyTeacherId', v_teacher_id,
      'penaltyMonth', v_month,
      'previousEnrollmentEndAt', v_previous_ended_at
    )
  );

  INSERT INTO public.teacher_payroll_penalty_events (
    id, teacher_id, lesson_id, operation_log_id, salary_month, occurred_at,
    duration_minutes, hourly_rate_snapshot_php, unpaid_amount_php,
    deduction_amount_php, reason, created_by
  ) VALUES (
    v_event_id, v_teacher_id, p_lesson_id, v_log_id, v_month,
    v_lesson.scheduled_at, v_lesson.duration_minutes, v_rate, v_amount, v_amount,
    COALESCE(NULLIF(btrim(p_note), ''), '사전 연락 없는 강사 노쇼'), auth.uid()
  )
  ON CONFLICT (lesson_id) DO UPDATE SET
    operation_log_id = EXCLUDED.operation_log_id,
    salary_month = EXCLUDED.salary_month,
    occurred_at = EXCLUDED.occurred_at,
    duration_minutes = EXCLUDED.duration_minutes,
    hourly_rate_snapshot_php = EXCLUDED.hourly_rate_snapshot_php,
    unpaid_amount_php = EXCLUDED.unpaid_amount_php,
    deduction_amount_php = EXCLUDED.deduction_amount_php,
    reason = EXCLUDED.reason,
    status = 'active', reversed_at = NULL, reversed_by = NULL, reversal_reason = NULL
  RETURNING id INTO v_event_id;

  INSERT INTO public.teacher_payroll_penalties (
    teacher_id, month, perfect_attendance_forfeited, quarterly_bonus_reset, reason
  ) VALUES (v_teacher_id, v_month, true, true, '선생님 노쇼')
  ON CONFLICT (teacher_id, month) DO UPDATE SET
    perfect_attendance_forfeited = true,
    quarterly_bonus_reset = true,
    reason = '선생님 노쇼';

  RETURN jsonb_build_object(
    'originalLessonId', p_lesson_id,
    'makeupLessonId', v_makeup_id,
    'operationLogId', v_log_id,
    'penaltyEventId', v_event_id,
    'deductionAmountPhp', v_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reverse_teacher_no_show(
  p_operation_log_id uuid,
  p_reason text DEFAULT '노쇼 조치 취소'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_log public.admin_lesson_operation_logs%ROWTYPE;
  v_event public.teacher_payroll_penalty_events%ROWTYPE;
  v_lesson public.lessons%ROWTYPE;
  v_makeup public.lessons%ROWTYPE;
  v_original jsonb;
  v_enrollment_id uuid;
  v_statement public.teacher_salary_statements%ROWTYPE;
  v_correction_reason text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_log
  FROM public.admin_lesson_operation_logs
  WHERE id = p_operation_log_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'log_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_log.undone_at IS NOT NULL THEN RAISE EXCEPTION 'already_undone' USING ERRCODE = '55000'; END IF;
  IF v_log.action <> 'teacher_no_show' THEN
    RETURN jsonb_build_object('handled', false);
  END IF;

  SELECT * INTO v_event
  FROM public.teacher_payroll_penalty_events
  WHERE operation_log_id = p_operation_log_id AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('handled', false); END IF;

  SELECT * INTO v_lesson FROM public.lessons WHERE id = v_event.lesson_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lesson_not_found' USING ERRCODE = 'P0002'; END IF;
  v_original := v_log.undo_payload->'originalLesson';
  IF v_original IS NULL THEN RAISE EXCEPTION 'invalid_undo_payload' USING ERRCODE = '22023'; END IF;

  IF v_lesson.related_lesson_id IS NOT NULL THEN
    SELECT * INTO v_makeup FROM public.lessons WHERE id = v_lesson.related_lesson_id FOR UPDATE;
    IF FOUND AND v_makeup.status = 'completed' THEN
      RAISE EXCEPTION 'makeup_already_completed' USING ERRCODE = '55000';
    END IF;
    IF FOUND THEN DELETE FROM public.lessons WHERE id = v_makeup.id; END IF;
  END IF;

  UPDATE public.lessons
  SET scheduled_at = (v_original->>'scheduledAt')::timestamptz,
      duration_minutes = (v_original->>'durationMinutes')::integer,
      status = (v_original->>'status')::public.lesson_status,
      is_trial = COALESCE((v_original->>'isTrial')::boolean, false),
      student_absent = COALESCE((v_original->>'studentAbsent')::boolean, false),
      teacher_no_show = COALESCE((v_original->>'teacherNoShow')::boolean, false),
      unpaid_for_teacher = COALESCE((v_original->>'unpaidForTeacher')::boolean, false),
      cancel_reason = NULLIF(v_original->>'cancelReason', ''),
      original_teacher_id = NULLIF(v_original->>'originalTeacherId', '')::uuid,
      related_lesson_id = NULLIF(v_original->>'relatedLessonId', '')::uuid,
      operation_note = NULLIF(v_original->>'operationNote', '')
  WHERE id = v_event.lesson_id;

  v_enrollment_id := NULLIF(v_log.undo_payload->>'enrollmentId', '')::uuid;
  IF v_enrollment_id IS NOT NULL THEN
    UPDATE public.enrollments enrollment
    SET sessions_total = GREATEST(enrollment.sessions_completed, enrollment.sessions_total - 1),
        ended_at = NULLIF(v_log.undo_payload->>'previousEnrollmentEndAt', '')::timestamptz,
        session_adjustments = jsonb_build_array(jsonb_build_object(
          'id', 'adj-' || replace(public.uuid_generate_v4()::text, '-', ''),
          'at', now(),
          'adminName', '관리자',
          'deltaRemaining', 0,
          'previousRemaining', enrollment.sessions_remaining,
          'newRemaining', enrollment.sessions_remaining,
          'previousTotal', enrollment.sessions_total,
          'newTotal', GREATEST(enrollment.sessions_completed, enrollment.sessions_total - 1),
          'reason', COALESCE(NULLIF(btrim(p_reason), ''), '노쇼 조치 취소')
        )) || COALESCE(enrollment.session_adjustments, '[]'::jsonb)
    WHERE enrollment.id = v_enrollment_id;
  END IF;

  UPDATE public.teacher_payroll_penalty_events
  SET status = 'reversed', reversed_at = now(), reversed_by = auth.uid(),
      reversal_reason = COALESCE(NULLIF(btrim(p_reason), ''), '노쇼 조치 취소')
  WHERE id = v_event.id;

  IF NOT EXISTS (
    SELECT 1 FROM public.teacher_payroll_penalty_events event
    WHERE event.teacher_id = v_event.teacher_id
      AND event.salary_month = v_event.salary_month
      AND event.status = 'active'
  ) THEN
    DELETE FROM public.teacher_payroll_penalties
    WHERE teacher_id = v_event.teacher_id AND month = v_event.salary_month;
  END IF;

  SELECT * INTO v_statement
  FROM public.teacher_salary_statements
  WHERE teacher_id = v_event.teacher_id AND month = v_event.salary_month
  FOR UPDATE;
  IF FOUND AND v_statement.status = 'estimated' THEN
    UPDATE public.teacher_salary_statements
    SET deductions = GREATEST(0, deductions - v_event.deduction_amount_php)
    WHERE id = v_statement.id;
  ELSIF FOUND AND v_statement.status IN ('processing', 'paid', 'completed') THEN
    v_correction_reason := '노쇼 패널티 취소 보정 (' || v_event.id::text || ')';
    IF NOT EXISTS (
      SELECT 1 FROM public.teacher_bonuses bonus
      WHERE bonus.teacher_id = v_event.teacher_id AND bonus.reason = v_correction_reason
    ) THEN
      INSERT INTO public.teacher_bonuses (
        teacher_id, amount_php, reason, month_key, created_by
      ) VALUES (
        v_event.teacher_id, v_event.deduction_amount_php, v_correction_reason,
        to_char(CURRENT_DATE, 'YYYY-MM'), auth.uid()
      );
    END IF;
  END IF;

  UPDATE public.admin_lesson_operation_logs
  SET undone_at = now()
  WHERE id = p_operation_log_id;

  RETURN jsonb_build_object(
    'handled', true,
    'originalLessonId', v_event.lesson_id,
    'makeupLessonId', v_makeup.id,
    'enrollmentId', v_enrollment_id,
    'penaltyEventId', v_event.id
  );
END;
$$;

ALTER FUNCTION public.apply_due_teacher_hourly_rates() OWNER TO postgres;
ALTER FUNCTION public.admin_teacher_compensation_overview(integer, integer) OWNER TO postgres;
ALTER FUNCTION public.admin_save_teacher_compensation_review(uuid, integer, text, numeric, text, date, text) OWNER TO postgres;
ALTER FUNCTION public.admin_update_teacher_employment_start(uuid, date) OWNER TO postgres;
ALTER FUNCTION public.admin_schedule_teacher_hourly_rate(uuid, numeric, text, text, text) OWNER TO postgres;
ALTER FUNCTION public.admin_bulk_schedule_teacher_hourly_rate(uuid[], numeric, text, text) OWNER TO postgres;
ALTER FUNCTION public.admin_apply_teacher_no_show(uuid, timestamptz, date, text, text) OWNER TO postgres;
ALTER FUNCTION public.admin_reverse_teacher_no_show(uuid, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.apply_due_teacher_hourly_rates() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_teacher_compensation_overview(integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_save_teacher_compensation_review(uuid, integer, text, numeric, text, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_teacher_employment_start(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_schedule_teacher_hourly_rate(uuid, numeric, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_bulk_schedule_teacher_hourly_rate(uuid[], numeric, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_apply_teacher_no_show(uuid, timestamptz, date, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_reverse_teacher_no_show(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_due_teacher_hourly_rates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_teacher_compensation_overview(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_teacher_compensation_review(uuid, integer, text, numeric, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_teacher_employment_start(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_schedule_teacher_hourly_rate(uuid, numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bulk_schedule_teacher_hourly_rate(uuid[], numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_apply_teacher_no_show(uuid, timestamptz, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reverse_teacher_no_show(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_due_teacher_hourly_rates() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_teacher_compensation_overview(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_teacher_compensation_review(uuid, integer, text, numeric, text, date, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_teacher_employment_start(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_schedule_teacher_hourly_rate(uuid, numeric, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_bulk_schedule_teacher_hourly_rate(uuid[], numeric, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_apply_teacher_no_show(uuid, timestamptz, date, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_reverse_teacher_no_show(uuid, text) TO service_role;

COMMIT;
