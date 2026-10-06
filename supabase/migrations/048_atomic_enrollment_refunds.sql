-- Admin-only enrollment refund finalization.
-- Preview reads one enrollment and aggregates its lessons. Finalization locks
-- that enrollment and commits cancellation, finance, chat, and notifications
-- atomically without warming application-wide caches.

BEGIN;

ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS paid_sessions_total integer,
  ADD COLUMN IF NOT EXISTS paid_sessions_source text;

-- Recover the original paid-session denominator without rewriting adjustment
-- history. A plan mismatch with no history remains unresolved and must be
-- confirmed once by an administrator in the refund dialog.
WITH basis AS (
  SELECT
    enrollment.id,
    CASE
      WHEN jsonb_typeof(enrollment.session_adjustments) = 'array'
        AND jsonb_array_length(enrollment.session_adjustments) > 0
        AND (enrollment.session_adjustments->0->>'previousTotal') ~ '^[1-9][0-9]*$'
        THEN (enrollment.session_adjustments->0->>'previousTotal')::integer
      WHEN enrollment.sessions_total = plan.sessions_count THEN enrollment.sessions_total
      ELSE NULL
    END AS paid_sessions_total,
    CASE
      WHEN jsonb_typeof(enrollment.session_adjustments) = 'array'
        AND jsonb_array_length(enrollment.session_adjustments) > 0
        AND (enrollment.session_adjustments->0->>'previousTotal') ~ '^[1-9][0-9]*$'
        THEN 'legacy_adjustment_history'
      WHEN enrollment.sessions_total = plan.sessions_count THEN 'legacy_plan_match'
      ELSE 'needs_admin_review'
    END AS paid_sessions_source
  FROM public.enrollments enrollment
  JOIN public.pricing_plans plan ON plan.id = enrollment.plan_id
  WHERE enrollment.payment_status = 'confirmed'
    AND enrollment.paid_sessions_total IS NULL
)
UPDATE public.enrollments enrollment
SET paid_sessions_total = basis.paid_sessions_total,
    paid_sessions_source = basis.paid_sessions_source
FROM basis
WHERE enrollment.id = basis.id;

ALTER TABLE public.enrollments
  DROP CONSTRAINT IF EXISTS enrollments_paid_sessions_total_check;
ALTER TABLE public.enrollments
  ADD CONSTRAINT enrollments_paid_sessions_total_check
  CHECK (paid_sessions_total IS NULL OR paid_sessions_total > 0);

CREATE OR REPLACE FUNCTION public.set_paid_sessions_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.payment_status = 'confirmed' AND NEW.paid_sessions_total IS NULL THEN
    NEW.paid_sessions_total := NEW.sessions_total;
    NEW.paid_sessions_source := 'payment_confirmation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_paid_sessions_snapshot ON public.enrollments;
CREATE TRIGGER set_paid_sessions_snapshot
BEFORE INSERT OR UPDATE OF payment_status ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.set_paid_sessions_snapshot();

CREATE OR REPLACE FUNCTION public.guard_paid_sessions_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF OLD.paid_sessions_total IS NOT NULL
    AND NEW.paid_sessions_total IS DISTINCT FROM OLD.paid_sessions_total
    AND current_setting('app.allow_paid_sessions_override', true) IS DISTINCT FROM 'true'
  THEN
    RAISE EXCEPTION 'paid_sessions_total_immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_paid_sessions_snapshot ON public.enrollments;
CREATE TRIGGER guard_paid_sessions_snapshot
BEFORE UPDATE OF paid_sessions_total ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.guard_paid_sessions_snapshot();

ALTER TABLE public.chat_rooms
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_reason text;

CREATE OR REPLACE FUNCTION public.guard_closed_chat_room_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.chat_rooms room
    WHERE room.id = NEW.room_id AND room.closed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'chat_room_closed' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_closed_chat_room_message ON public.chat_messages;
CREATE TRIGGER guard_closed_chat_room_message
BEFORE INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.guard_closed_chat_room_message();

-- Keep history readable while exposing the closed state in the existing
-- bounded inbox RPC. This definition builds on migration 045 read cursors.
DROP FUNCTION IF EXISTS public.get_chat_inbox(uuid);
CREATE FUNCTION public.get_chat_inbox(p_student_id uuid DEFAULT NULL)
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
SET search_path = public
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
  WHERE viewer.role = 'admin'::public.user_role
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

-- Refunds are revenue reversals, not ordinary operating expenses.
ALTER TABLE public.finance_transactions
  DROP CONSTRAINT IF EXISTS finance_transactions_type_check;
ALTER TABLE public.finance_transactions
  ADD CONSTRAINT finance_transactions_type_check
  CHECK (type IN ('income', 'expense', 'refund'));

CREATE TABLE IF NOT EXISTS public.enrollment_refunds (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  enrollment_id uuid NOT NULL UNIQUE REFERENCES public.enrollments(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  policy_version text NOT NULL,
  currency public.currency_code NOT NULL,
  paid_amount numeric NOT NULL CHECK (paid_amount >= 0),
  paid_sessions_total integer NOT NULL CHECK (paid_sessions_total > 0),
  counted_sessions integer NOT NULL CHECK (counted_sessions >= 0),
  student_absent_sessions integer NOT NULL DEFAULT 0 CHECK (student_absent_sessions >= 0),
  company_excluded_sessions integer NOT NULL DEFAULT 0 CHECK (company_excluded_sessions >= 0),
  refund_rate numeric NOT NULL CHECK (refund_rate BETWEEN 0 AND 1),
  calculated_amount numeric NOT NULL CHECK (calculated_amount >= 0),
  actual_amount numeric NOT NULL CHECK (actual_amount >= 0),
  refund_reason text NOT NULL,
  adjustment_reason text,
  admin_note text,
  cancelled_lesson_count integer NOT NULL DEFAULT 0,
  processed_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  finance_transaction_id uuid UNIQUE,
  calculation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS refund_id uuid REFERENCES public.enrollment_refunds(id) ON DELETE SET NULL;

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'enrollment_refunds_finance_transaction_fkey'
      AND conrelid = 'public.enrollment_refunds'::regclass
  ) THEN
    ALTER TABLE public.enrollment_refunds
      ADD CONSTRAINT enrollment_refunds_finance_transaction_fkey
      FOREIGN KEY (finance_transaction_id)
      REFERENCES public.finance_transactions(id) ON DELETE SET NULL;
  END IF;
END
$block$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_transactions_refund
  ON public.finance_transactions (refund_id)
  WHERE refund_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enrollment_refunds_created
  ON public.enrollment_refunds (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lessons_refund_aggregate
  ON public.lessons (enrollment_id, status, is_trial, scheduled_at);

ALTER TABLE public.enrollment_refunds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_enrollment_refunds_admin ON public.enrollment_refunds;
CREATE POLICY rls_enrollment_refunds_admin ON public.enrollment_refunds
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE ALL ON TABLE public.enrollment_refunds FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.enrollment_refunds TO authenticated;
GRANT ALL ON TABLE public.enrollment_refunds TO service_role;

CREATE OR REPLACE FUNCTION public.refund_policy_rate(
  p_counted_sessions integer,
  p_paid_sessions_total integer
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $function$
  SELECT CASE
    WHEN p_counted_sessions = 0 THEN 1::numeric
    WHEN p_counted_sessions * 3 < p_paid_sessions_total THEN 2::numeric / 3::numeric
    WHEN p_counted_sessions * 2 < p_paid_sessions_total THEN 1::numeric / 2::numeric
    ELSE 0::numeric
  END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_preview_enrollment_refund(p_enrollment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF public.is_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'enrollmentId', enrollment.id,
    'studentId', enrollment.student_id,
    'studentName', COALESCE(NULLIF(BTRIM(student.english_name), ''), NULLIF(BTRIM(student.full_name), ''), 'Student'),
    'teacherName', COALESCE(NULLIF(BTRIM(teacher.display_name), ''), 'Teacher'),
    'planLabel', COALESCE(plan.description->'ko'->>'name', plan.plan_type::text),
    'status', enrollment.status::text,
    'currency', payment.currency::text,
    'paidAmount', payment.amount,
    'paidSessionsTotal', enrollment.paid_sessions_total,
    'paidSessionsSource', enrollment.paid_sessions_source,
    'basisNeedsReview', enrollment.paid_sessions_total IS NULL,
    'countedSessions', lesson_stats.counted,
    'studentAbsentSessions', lesson_stats.student_absent,
    'companyExcludedSessions', lesson_stats.company_excluded,
    'cancelledSessions', lesson_stats.cancelled,
    'futureCancellableSessions', lesson_stats.future_cancellable,
    'unresolvedPastSessions', lesson_stats.unresolved_past,
    'policyVersion', '2026-10-06-v1',
    'policyTier', CASE
      WHEN enrollment.paid_sessions_total IS NULL THEN NULL
      WHEN lesson_stats.counted = 0 THEN 'full'
      WHEN lesson_stats.counted * 3 < enrollment.paid_sessions_total THEN 'two_thirds'
      WHEN lesson_stats.counted * 2 < enrollment.paid_sessions_total THEN 'half'
      ELSE 'none'
    END,
    'refundRate', CASE WHEN enrollment.paid_sessions_total IS NULL THEN NULL
      ELSE public.refund_policy_rate(lesson_stats.counted, enrollment.paid_sessions_total) END,
    'calculatedRefundAmount', CASE
      WHEN enrollment.paid_sessions_total IS NULL THEN NULL
      WHEN payment.currency = 'KRW'::public.currency_code THEN ROUND(
        payment.amount * public.refund_policy_rate(lesson_stats.counted, enrollment.paid_sessions_total)
      )
      ELSE ROUND(
        payment.amount * public.refund_policy_rate(lesson_stats.counted, enrollment.paid_sessions_total), 2
      )
    END,
    'alreadyRefunded', EXISTS (
      SELECT 1 FROM public.enrollment_refunds refund WHERE refund.enrollment_id = enrollment.id
    )
  ) INTO result
  FROM public.enrollments enrollment
  JOIN public.students student ON student.id = enrollment.student_id
  JOIN public.teachers teacher ON teacher.id = enrollment.teacher_id
  JOIN public.pricing_plans plan ON plan.id = enrollment.plan_id
  CROSS JOIN LATERAL (
    SELECT
      COALESCE(confirmed.amount, enrollment.total_amount)::numeric AS amount,
      COALESCE(confirmed.currency, enrollment.currency) AS currency
    FROM (SELECT 1) seed
    LEFT JOIN LATERAL (
      SELECT pay.amount, pay.currency
      FROM public.payments pay
      WHERE pay.enrollment_id = enrollment.id AND pay.status = 'confirmed'
      ORDER BY pay.confirmed_at DESC NULLS LAST, pay.created_at DESC
      LIMIT 1
    ) confirmed ON true
  ) payment
  CROSS JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (
        WHERE lesson.status = 'completed'::public.lesson_status
          AND NOT lesson.is_trial AND NOT lesson.teacher_no_show
      )::integer AS counted,
      COUNT(*) FILTER (
        WHERE lesson.status = 'completed'::public.lesson_status
          AND NOT lesson.is_trial AND lesson.student_absent AND NOT lesson.teacher_no_show
      )::integer AS student_absent,
      COUNT(*) FILTER (
        WHERE NOT lesson.is_trial AND (
          lesson.teacher_no_show
          OR (lesson.status = 'cancelled'::public.lesson_status AND lesson.cancel_reason IN ('teacher_no_show', 'company_cancelled'))
        )
      )::integer AS company_excluded,
      COUNT(*) FILTER (
        WHERE NOT lesson.is_trial AND lesson.status = 'cancelled'::public.lesson_status
      )::integer AS cancelled,
      COUNT(*) FILTER (
        WHERE NOT lesson.is_trial
          AND lesson.status IN ('scheduled', 'reschedule_pending', 'pending_payment')
          AND lesson.scheduled_at >= now()
      )::integer AS future_cancellable,
      COUNT(*) FILTER (
        WHERE NOT lesson.is_trial
          AND lesson.status IN ('scheduled', 'reschedule_pending', 'pending_payment', 'no_show')
          AND lesson.scheduled_at < now()
      )::integer AS unresolved_past
    FROM public.lessons lesson
    WHERE lesson.enrollment_id = enrollment.id
  ) lesson_stats
  WHERE enrollment.id = p_enrollment_id;

  IF result IS NULL THEN RAISE EXCEPTION 'enrollment_not_found' USING ERRCODE = 'P0002'; END IF;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_finalize_enrollment_refund(
  p_enrollment_id uuid,
  p_expected_counted_sessions integer,
  p_expected_calculated_amount numeric,
  p_actual_refund_amount numeric,
  p_refund_reason text,
  p_adjustment_reason text,
  p_admin_note text,
  p_paid_sessions_total_override integer,
  p_refund_completed boolean,
  p_exchange_rate numeric,
  p_exchange_rate_source text,
  p_exchange_rate_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  enrollment_row public.enrollments%ROWTYPE;
  preview jsonb;
  refund_id uuid := extensions.gen_random_uuid();
  finance_id uuid := extensions.gen_random_uuid();
  calculated_amount numeric;
  paid_amount numeric;
  refund_rate numeric;
  currency_value public.currency_code;
  student_user_id uuid;
  student_name text;
  teacher_ids uuid[];
  cancelled_count integer := 0;
  amount_krw numeric;
  supply_amount numeric;
  vat_amount numeric;
  student_url text;
  teacher_url text := '/teacher/schedule';
BEGIN
  IF public.is_admin() IS NOT TRUE THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_refund_completed IS NOT TRUE THEN RAISE EXCEPTION 'refund_not_completed' USING ERRCODE = '22023'; END IF;
  IF NULLIF(BTRIM(p_refund_reason), '') IS NULL THEN RAISE EXCEPTION 'refund_reason_required' USING ERRCODE = '22023'; END IF;
  IF p_actual_refund_amount IS NULL OR p_actual_refund_amount < 0 THEN
    RAISE EXCEPTION 'invalid_refund_amount' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO enrollment_row
  FROM public.enrollments enrollment
  WHERE enrollment.id = p_enrollment_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'enrollment_not_found' USING ERRCODE = 'P0002'; END IF;
  IF enrollment_row.status NOT IN ('active', 'expiring_soon')
    OR enrollment_row.payment_status <> 'confirmed'
    OR enrollment_row.is_trial
  THEN RAISE EXCEPTION 'enrollment_not_refundable' USING ERRCODE = '55000'; END IF;
  IF EXISTS (SELECT 1 FROM public.enrollment_refunds refund WHERE refund.enrollment_id = p_enrollment_id) THEN
    RAISE EXCEPTION 'refund_already_finalized' USING ERRCODE = '23505';
  END IF;

  IF enrollment_row.paid_sessions_total IS NULL THEN
    IF p_paid_sessions_total_override IS NULL OR p_paid_sessions_total_override NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION 'paid_sessions_total_review_required' USING ERRCODE = '22023';
    END IF;
    PERFORM set_config('app.allow_paid_sessions_override', 'true', true);
    UPDATE public.enrollments
    SET paid_sessions_total = p_paid_sessions_total_override,
        paid_sessions_source = 'admin_refund_review'
    WHERE id = p_enrollment_id;
  ELSIF p_paid_sessions_total_override IS NOT NULL
    AND p_paid_sessions_total_override <> enrollment_row.paid_sessions_total
  THEN
    RAISE EXCEPTION 'paid_sessions_total_immutable' USING ERRCODE = '55000';
  END IF;

  preview := public.admin_preview_enrollment_refund(p_enrollment_id);
  IF (preview->>'alreadyRefunded')::boolean THEN RAISE EXCEPTION 'refund_already_finalized' USING ERRCODE = '23505'; END IF;
  IF (preview->>'basisNeedsReview')::boolean THEN RAISE EXCEPTION 'paid_sessions_total_review_required' USING ERRCODE = '22023'; END IF;
  IF (preview->>'unresolvedPastSessions')::integer > 0 THEN
    RAISE EXCEPTION 'unresolved_past_lessons' USING ERRCODE = '55000';
  END IF;

  calculated_amount := (preview->>'calculatedRefundAmount')::numeric;
  paid_amount := (preview->>'paidAmount')::numeric;
  refund_rate := (preview->>'refundRate')::numeric;
  currency_value := (preview->>'currency')::public.currency_code;
  IF p_expected_counted_sessions IS DISTINCT FROM (preview->>'countedSessions')::integer
    OR p_expected_calculated_amount IS DISTINCT FROM calculated_amount
  THEN RAISE EXCEPTION 'refund_preview_changed_retry' USING ERRCODE = '40001'; END IF;
  IF p_actual_refund_amount > paid_amount THEN RAISE EXCEPTION 'refund_amount_exceeds_payment' USING ERRCODE = '22023'; END IF;
  IF currency_value = 'KRW'::public.currency_code AND p_actual_refund_amount <> ROUND(p_actual_refund_amount) THEN
    RAISE EXCEPTION 'invalid_refund_currency_precision' USING ERRCODE = '22023';
  ELSIF currency_value = 'CNY'::public.currency_code AND p_actual_refund_amount <> ROUND(p_actual_refund_amount, 2) THEN
    RAISE EXCEPTION 'invalid_refund_currency_precision' USING ERRCODE = '22023';
  END IF;
  IF p_actual_refund_amount IS DISTINCT FROM calculated_amount
    AND NULLIF(BTRIM(p_adjustment_reason), '') IS NULL
  THEN RAISE EXCEPTION 'adjustment_reason_required' USING ERRCODE = '22023'; END IF;

  IF currency_value = 'CNY'::public.currency_code THEN
    IF p_exchange_rate IS NULL OR p_exchange_rate <= 0
      OR NULLIF(BTRIM(p_exchange_rate_source), '') IS NULL OR p_exchange_rate_at IS NULL
    THEN RAISE EXCEPTION 'exchange_rate_required' USING ERRCODE = '22023'; END IF;
    amount_krw := ROUND(p_actual_refund_amount * p_exchange_rate);
    supply_amount := amount_krw;
    vat_amount := 0;
  ELSE
    amount_krw := p_actual_refund_amount;
    supply_amount := ROUND(amount_krw / 1.1);
    vat_amount := amount_krw - supply_amount;
  END IF;

  SELECT student.account_holder_id,
    COALESCE(NULLIF(BTRIM(student.english_name), ''), NULLIF(BTRIM(student.full_name), ''), 'Student'),
    CASE WHEN profile.locale = 'zh-CN' THEN '/zh-CN/student/enrollment' ELSE '/ko/student/enrollment' END
  INTO student_user_id, student_name, student_url
  FROM public.students student
  JOIN public.profiles profile ON profile.id = student.account_holder_id
  WHERE student.id = enrollment_row.student_id;

  SELECT ARRAY(
    SELECT DISTINCT affected.teacher_id
    FROM (
      SELECT enrollment_row.teacher_id AS teacher_id
      UNION ALL
      SELECT lesson.teacher_id FROM public.lessons lesson
      WHERE lesson.enrollment_id = p_enrollment_id
        AND NOT lesson.is_trial
        AND lesson.status IN ('scheduled', 'reschedule_pending', 'pending_payment')
    ) affected
    WHERE affected.teacher_id IS NOT NULL
  ) INTO teacher_ids;

  INSERT INTO public.enrollment_refunds (
    id, enrollment_id, student_id, policy_version, currency, paid_amount,
    paid_sessions_total, counted_sessions, student_absent_sessions,
    company_excluded_sessions, refund_rate, calculated_amount, actual_amount,
    refund_reason, adjustment_reason, admin_note, processed_by, calculation_snapshot
  ) VALUES (
    refund_id, p_enrollment_id, enrollment_row.student_id, preview->>'policyVersion',
    currency_value, paid_amount, (preview->>'paidSessionsTotal')::integer,
    (preview->>'countedSessions')::integer, (preview->>'studentAbsentSessions')::integer,
    (preview->>'companyExcludedSessions')::integer, refund_rate, calculated_amount,
    p_actual_refund_amount, BTRIM(p_refund_reason), NULLIF(BTRIM(p_adjustment_reason), ''),
    NULLIF(BTRIM(p_admin_note), ''), auth.uid(), preview
  );

  UPDATE public.lesson_reschedule_requests request
  SET status = 'cancelled'::public.reschedule_status, responded_at = now()
  WHERE request.lesson_id IN (
    SELECT lesson.id FROM public.lessons lesson WHERE lesson.enrollment_id = p_enrollment_id
  ) AND request.status IN ('pending_student_approval', 'pending_teacher_approval');

  UPDATE public.lessons lesson
  SET status = 'cancelled'::public.lesson_status,
      cancel_reason = 'enrollment_refund',
      unpaid_for_teacher = true,
      operation_note = CONCAT_WS(' · ', NULLIF(lesson.operation_note, ''), '환불 확정으로 잔여 수업 취소')
  WHERE lesson.enrollment_id = p_enrollment_id
    AND NOT lesson.is_trial
    AND lesson.status IN ('scheduled', 'reschedule_pending', 'pending_payment');
  GET DIAGNOSTICS cancelled_count = ROW_COUNT;

  UPDATE public.enrollments
  SET status = 'cancelled'::public.enrollment_status,
      sessions_remaining = 0,
      cancel_reason = 'refund:' || refund_id::text,
      ended_at = now()
  WHERE id = p_enrollment_id;

  UPDATE public.chat_rooms
  SET closed_at = now(), closed_reason = 'enrollment_refund'
  WHERE enrollment_id = p_enrollment_id AND closed_at IS NULL;

  INSERT INTO public.finance_transactions (
    id, transaction_date, type, category, description, currency, amount, amount_krw,
    exchange_rate, exchange_rate_source, exchange_rate_at, supply_amount, vat_amount,
    tax_treatment, source, student_name, enrollment_id, refund_id
  ) VALUES (
    finance_id, CURRENT_DATE, 'refund',
    CASE WHEN currency_value = 'CNY'::public.currency_code THEN 'student_refund_cn' ELSE 'student_refund_kr' END,
    student_name || ' — 수강 취소 환불', currency_value::text, p_actual_refund_amount,
    amount_krw, CASE WHEN currency_value = 'CNY'::public.currency_code THEN p_exchange_rate END,
    CASE WHEN currency_value = 'CNY'::public.currency_code THEN BTRIM(p_exchange_rate_source) END,
    CASE WHEN currency_value = 'CNY'::public.currency_code THEN p_exchange_rate_at END,
    supply_amount, vat_amount,
    CASE WHEN currency_value = 'CNY'::public.currency_code THEN 'non_taxable' ELSE 'taxable' END,
    'auto', student_name, p_enrollment_id, refund_id
  );

  UPDATE public.enrollment_refunds
  SET cancelled_lesson_count = cancelled_count, finance_transaction_id = finance_id
  WHERE id = refund_id;

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  SELECT student_user_id, 'payment_confirmed'::public.notification_type,
    CASE WHEN profile.locale = 'zh-CN' THEN '课程取消及退款处理完成' ELSE '수강 취소 및 환불 처리 완료' END,
    CASE WHEN profile.locale = 'zh-CN'
      THEN student_name || '的剩余课程已取消，退款处理已完成。'
      ELSE student_name || ' 학생의 잔여 수업 취소와 환불 처리가 완료되었습니다.' END,
    jsonb_build_object('kind', 'enrollment_refund', 'enrollmentId', p_enrollment_id,
      'refundId', refund_id, 'url', student_url, 'amount', p_actual_refund_amount, 'currency', currency_value)
  FROM public.profiles profile WHERE profile.id = student_user_id;

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  SELECT teacher_id, 'payment_confirmed'::public.notification_type,
    'Enrollment cancelled', student_name || '''s remaining lessons have been cancelled after a refund.',
    jsonb_build_object('kind', 'enrollment_refund', 'enrollmentId', p_enrollment_id,
      'refundId', refund_id, 'url', teacher_url)
  FROM unnest(teacher_ids) AS teacher_id;

  RETURN jsonb_build_object(
    'refundId', refund_id,
    'enrollmentId', p_enrollment_id,
    'currency', currency_value,
    'calculatedRefundAmount', calculated_amount,
    'actualRefundAmount', p_actual_refund_amount,
    'cancelledLessonCount', cancelled_count,
    'financeTransactionId', finance_id,
    'studentUserId', student_user_id,
    'teacherUserIds', to_jsonb(teacher_ids),
    'studentUrl', student_url,
    'teacherUrl', teacher_url
  );
END;
$function$;

ALTER FUNCTION public.set_paid_sessions_snapshot() OWNER TO postgres;
ALTER FUNCTION public.guard_paid_sessions_snapshot() OWNER TO postgres;
ALTER FUNCTION public.guard_closed_chat_room_message() OWNER TO postgres;
ALTER FUNCTION public.refund_policy_rate(integer, integer) OWNER TO postgres;
ALTER FUNCTION public.admin_preview_enrollment_refund(uuid) OWNER TO postgres;
ALTER FUNCTION public.admin_finalize_enrollment_refund(uuid, integer, numeric, numeric, text, text, text, integer, boolean, numeric, text, timestamptz) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.set_paid_sessions_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_paid_sessions_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_closed_chat_room_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_policy_rate(integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_preview_enrollment_refund(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_finalize_enrollment_refund(uuid, integer, numeric, numeric, text, text, text, integer, boolean, numeric, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_preview_enrollment_refund(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finalize_enrollment_refund(uuid, integer, numeric, numeric, text, text, text, integer, boolean, numeric, text, timestamptz) TO authenticated;

COMMIT;
