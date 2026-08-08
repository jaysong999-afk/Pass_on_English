-- Pass on English — Unified initial schema
-- Spec: docs/db.md
-- Run: supabase db push  |  Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- 1. ENUM types (IF NOT EXISTS via pg_type check)
-- ---------------------------------------------------------------------------

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('student', 'teacher', 'admin');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type') THEN
    CREATE TYPE account_type AS ENUM ('self', 'guardian');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'country_code') THEN
    CREATE TYPE country_code AS ENUM ('KR', 'CN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'teacher_status') THEN
    CREATE TYPE teacher_status AS ENUM ('pending', 'active', 'inactive', 'on_leave', 'terminated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enrollment_status') THEN
    CREATE TYPE enrollment_status AS ENUM (
      'pending_payment', 'active', 'expiring_soon', 'completed', 'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lesson_status') THEN
    CREATE TYPE lesson_status AS ENUM (
      'pending_payment', 'scheduled', 'reschedule_pending', 'completed', 'cancelled', 'no_show'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM ('pending', 'reported', 'confirmed', 'rejected');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reschedule_status') THEN
    CREATE TYPE reschedule_status AS ENUM (
      'pending_student_approval', 'pending_teacher_approval',
      'approved', 'rejected', 'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reschedule_initiator') THEN
    CREATE TYPE reschedule_initiator AS ENUM ('student', 'teacher');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'salary_payout_status') THEN
    CREATE TYPE salary_payout_status AS ENUM ('estimated', 'processing', 'paid');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'video_platform') THEN
    CREATE TYPE video_platform AS ENUM ('ZOOM', 'VOOV');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_type') THEN
    CREATE TYPE plan_type AS ENUM (
      'weekday5_20min', 'mwf_20min', 'tuth_20min', 'weekend_20min'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'currency_code') THEN
    CREATE TYPE currency_code AS ENUM ('KRW', 'CNY', 'PHP');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE notification_type AS ENUM (
      'payment_request', 'payment_confirmed', 'reschedule_request',
      'reschedule_result', 'chat_message', 'admin_broadcast', 'lesson_reminder'
    );
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- 2. Shared trigger helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, locale)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'student'),
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(NEW.raw_user_meta_data->>'locale', 'ko')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Core tables
-- ---------------------------------------------------------------------------

-- 4.1 profiles (account_holder) — id references auth.users
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'student',
  full_name text,
  phone text,
  avatar_url text,
  locale text DEFAULT 'ko',
  account_type account_type,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS profiles_set_updated_at ON profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4.2 students (learners)
CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_holder_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  full_name text,
  english_name text NOT NULL,
  date_of_birth date NOT NULL,
  country country_code,
  english_level text,
  purposes text[] DEFAULT '{}',
  age_group text,
  onboarding_note text,
  trial_used boolean NOT NULL DEFAULT false,
  reschedule_count_month int NOT NULL DEFAULT 0,
  reschedule_month_key text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_students_account_holder_id ON students (account_holder_id);
CREATE INDEX IF NOT EXISTS idx_students_trial_used ON students (trial_used);

-- 4.3 teachers
CREATE TABLE IF NOT EXISTS teachers (
  id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  bio text DEFAULT '',
  specialties text[] DEFAULT '{}',
  experience_years int,
  status teacher_status NOT NULL DEFAULT 'pending',
  hourly_rate_php numeric(10, 2),
  timezone text NOT NULL DEFAULT 'Asia/Manila',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teachers_status ON teachers (status);
CREATE INDEX IF NOT EXISTS idx_teachers_status_active ON teachers (status) WHERE status = 'active';

DROP TRIGGER IF EXISTS teachers_set_updated_at ON teachers;
CREATE TRIGGER teachers_set_updated_at
  BEFORE UPDATE ON teachers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4.4 teachers_weekly_availability
CREATE TABLE IF NOT EXISTS teachers_weekly_availability (
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  day text NOT NULL CHECK (day IN ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')),
  start_time time NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id, day, start_time)
);

-- 4.5 teacher_availability_exceptions
CREATE TABLE IF NOT EXISTS teacher_availability_exceptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  exception_date date NOT NULL,
  reason text,
  UNIQUE (teacher_id, exception_date)
);

CREATE INDEX IF NOT EXISTS idx_teacher_availability_exceptions_teacher_id
  ON teacher_availability_exceptions (teacher_id);

-- 4.6 pricing_plans
CREATE TABLE IF NOT EXISTS pricing_plans (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_type plan_type NOT NULL UNIQUE,
  sessions_count int NOT NULL,
  session_minutes int NOT NULL DEFAULT 20,
  slot_block_minutes int NOT NULL DEFAULT 20,
  price_krw int NOT NULL,
  price_cny int NOT NULL,
  description jsonb DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true
);

-- 4.7 enrollments
CREATE TABLE IF NOT EXISTS enrollments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL REFERENCES pricing_plans(id) ON DELETE RESTRICT,
  status enrollment_status NOT NULL DEFAULT 'pending_payment',
  is_trial boolean NOT NULL DEFAULT false,
  payment_status payment_status NOT NULL DEFAULT 'pending',
  currency currency_code NOT NULL DEFAULT 'KRW',
  total_amount int NOT NULL DEFAULT 0,
  sessions_total int NOT NULL,
  sessions_completed int NOT NULL DEFAULT 0,
  sessions_remaining int,
  curriculum text,
  preferred_slot_time text,
  preferred_slot_day text,
  session_adjustments jsonb NOT NULL DEFAULT '[]'::jsonb,
  renewed_from_enrollment_id uuid REFERENCES enrollments(id) ON DELETE SET NULL,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON enrollments (student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_teacher_id ON enrollments (teacher_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments (status);

-- 4.8 lessons
CREATE TABLE IF NOT EXISTS lessons (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  enrollment_id uuid REFERENCES enrollments(id) ON DELETE SET NULL,
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  duration_minutes int NOT NULL DEFAULT 20,
  status lesson_status NOT NULL DEFAULT 'scheduled',
  is_trial boolean NOT NULL DEFAULT false,
  student_absent boolean NOT NULL DEFAULT false,
  teacher_no_show boolean NOT NULL DEFAULT false,
  unpaid_for_teacher boolean NOT NULL DEFAULT false,
  cancel_reason text,
  original_teacher_id uuid REFERENCES teachers(id) ON DELETE SET NULL,
  related_lesson_id uuid REFERENCES lessons(id) ON DELETE SET NULL,
  operation_note text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lessons_teacher_scheduled ON lessons (teacher_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_lessons_student_scheduled ON lessons (student_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_lessons_status ON lessons (status);
CREATE INDEX IF NOT EXISTS idx_lessons_enrollment_id ON lessons (enrollment_id);

-- 4.9 lesson_feedbacks
CREATE TABLE IF NOT EXISTS lesson_feedbacks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id uuid NOT NULL UNIQUE REFERENCES lessons(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  content text NOT NULL,
  homework text,
  progress_pages text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_feedbacks_teacher_id ON lesson_feedbacks (teacher_id);
CREATE INDEX IF NOT EXISTS idx_lesson_feedbacks_student_id ON lesson_feedbacks (student_id);

-- 4.10 lesson_reschedule_requests
CREATE TABLE IF NOT EXISTS lesson_reschedule_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  initiator reschedule_initiator NOT NULL,
  original_scheduled_at timestamptz NOT NULL,
  proposed_scheduled_at timestamptz NOT NULL,
  status reschedule_status NOT NULL DEFAULT 'pending_student_approval',
  reason text,
  request_month text NOT NULL,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_reschedule_lesson_status
  ON lesson_reschedule_requests (lesson_id, status);
CREATE INDEX IF NOT EXISTS idx_lesson_reschedule_student_month
  ON lesson_reschedule_requests (student_id, request_month);
CREATE INDEX IF NOT EXISTS idx_lesson_reschedule_teacher_status
  ON lesson_reschedule_requests (teacher_id, status);

-- 4.11 payments
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  enrollment_id uuid REFERENCES enrollments(id) ON DELETE SET NULL,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount int NOT NULL,
  currency currency_code NOT NULL DEFAULT 'KRW',
  status payment_status NOT NULL DEFAULT 'pending',
  depositor_name text,
  reported_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_enrollment_id ON payments (enrollment_id);
CREATE INDEX IF NOT EXISTS idx_payments_student_id ON payments (student_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);

-- 4.12 chat_rooms
CREATE TABLE IF NOT EXISTS chat_rooms (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  enrollment_id uuid NOT NULL UNIQUE REFERENCES enrollments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_rooms_student_id ON chat_rooms (student_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_teacher_id ON chat_rooms (teacher_id);

-- 4.13 chat_messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender_role user_role NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created
  ON chat_messages (room_id, created_at DESC);

-- 4.14 salary_settings
CREATE TABLE IF NOT EXISTS salary_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  monthly_bonus_per_hour_php numeric NOT NULL DEFAULT 25,
  quarter_bonus_tier1_hours int NOT NULL DEFAULT 300,
  quarter_bonus_tier1_php numeric NOT NULL DEFAULT 2000,
  quarter_bonus_tier2_hours int NOT NULL DEFAULT 150,
  quarter_bonus_tier2_php numeric NOT NULL DEFAULT 1300,
  quarter_bonus_tier3_php numeric NOT NULL DEFAULT 700,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

-- 4.15 teacher_bonuses
CREATE TABLE IF NOT EXISTS teacher_bonuses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  amount_php numeric NOT NULL,
  reason text NOT NULL,
  month_key text NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teacher_bonuses_teacher_month
  ON teacher_bonuses (teacher_id, month_key);

-- 4.16 teacher_monthly_attendance
CREATE TABLE IF NOT EXISTS teacher_monthly_attendance (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  month_key text NOT NULL,
  total_hours numeric NOT NULL DEFAULT 0,
  is_perfect_attendance boolean NOT NULL DEFAULT false,
  monthly_bonus_php numeric NOT NULL DEFAULT 0,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, month_key)
);

-- 4.17 quarterly_bonus_records
CREATE TABLE IF NOT EXISTS quarterly_bonus_records (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  quarter_key text NOT NULL,
  total_hours numeric NOT NULL DEFAULT 0,
  bonus_php numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quarterly_bonus_teacher_quarter
  ON quarterly_bonus_records (teacher_id, quarter_key);

-- 4.18 finance_snapshots
CREATE TABLE IF NOT EXISTS finance_snapshots (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_type text NOT NULL CHECK (period_type IN ('month', 'quarter', 'year')),
  period_key text NOT NULL,
  revenue_krw numeric NOT NULL DEFAULT 0,
  revenue_cny numeric NOT NULL DEFAULT 0,
  expense_php numeric NOT NULL DEFAULT 0,
  expense_krw numeric,
  snapshot_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_snapshots_period
  ON finance_snapshots (period_type, period_key);

-- 4.19 push_subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions (user_id);

-- 4.20 notifications
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

-- 4.21 admin_broadcasts
CREATE TABLE IF NOT EXISTS admin_broadcasts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sent_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  target_role user_role,
  target_country country_code,
  title text NOT NULL,
  body text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- 4.22 teacher_student_context
CREATE TABLE IF NOT EXISTS teacher_student_context (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  textbook text NOT NULL DEFAULT '',
  video_platform video_platform NOT NULL DEFAULT 'ZOOM',
  special_notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, student_id)
);

DROP TRIGGER IF EXISTS teacher_student_context_set_updated_at ON teacher_student_context;
CREATE TRIGGER teacher_student_context_set_updated_at
  BEFORE UPDATE ON teacher_student_context
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4.23 monthly_growth_reports
CREATE TABLE IF NOT EXISTS monthly_growth_reports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  month text NOT NULL,
  title text NOT NULL,
  lessons_covered text NOT NULL,
  progress_made text NOT NULL,
  areas_to_work_on text NOT NULL,
  next_month_goals text NOT NULL,
  overall_comment text NOT NULL,
  published_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, teacher_id, month)
);

-- 4.24 teacher_salary_statements
CREATE TABLE IF NOT EXISTS teacher_salary_statements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  month text NOT NULL,
  status salary_payout_status NOT NULL DEFAULT 'estimated',
  completed_classes int NOT NULL DEFAULT 0,
  total_hours numeric NOT NULL DEFAULT 0,
  hourly_rate numeric NOT NULL DEFAULT 0,
  base_salary numeric NOT NULL DEFAULT 0,
  perfect_attendance_bonus numeric NOT NULL DEFAULT 0,
  quarterly_bonus numeric NOT NULL DEFAULT 0,
  other_incentives numeric NOT NULL DEFAULT 0,
  deductions numeric NOT NULL DEFAULT 0,
  payment_date date,
  payout_account jsonb,
  is_live_estimate boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, month)
);

DROP TRIGGER IF EXISTS teacher_salary_statements_set_updated_at ON teacher_salary_statements;
CREATE TRIGGER teacher_salary_statements_set_updated_at
  BEFORE UPDATE ON teacher_salary_statements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4.25 admin_lesson_operation_logs
CREATE TABLE IF NOT EXISTS admin_lesson_operation_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  at timestamptz NOT NULL DEFAULT now(),
  teacher_id uuid REFERENCES teachers(id) ON DELETE SET NULL,
  lesson_id uuid REFERENCES lessons(id) ON DELETE SET NULL,
  student_name text,
  scheduled_at timestamptz,
  week_start_key date,
  action text NOT NULL CHECK (
    action IN ('assign_substitute', 'teacher_no_show', 'cancel_unpaid', 'reschedule')
  ),
  summary text NOT NULL,
  note text,
  admin_name text NOT NULL,
  undone_at timestamptz,
  undoable boolean NOT NULL DEFAULT false,
  undo_payload jsonb
);

CREATE INDEX IF NOT EXISTS idx_admin_lesson_operation_logs_teacher_week
  ON admin_lesson_operation_logs (teacher_id, week_start_key, at DESC);

-- 4.26 admin_review_logs
CREATE TABLE IF NOT EXISTS admin_review_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  category text NOT NULL CHECK (
    category IN ('reschedule', 'teacher_signup', 'student_signup', 'payment_activation')
  ),
  action text NOT NULL CHECK (
    action IN ('approved', 'rejected', 'confirmed', 'activated')
  ),
  target_id text NOT NULL,
  target_label text NOT NULL,
  detail text,
  admin_name text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_review_logs_at ON admin_review_logs (at DESC);

-- 4.27 teacher_payroll_penalties
CREATE TABLE IF NOT EXISTS teacher_payroll_penalties (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  month text NOT NULL,
  perfect_attendance_forfeited boolean NOT NULL DEFAULT false,
  quarterly_bonus_reset boolean NOT NULL DEFAULT false,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, month)
);

-- ---------------------------------------------------------------------------
-- 4. Auth signup → profiles
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 5. Views & functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_teacher_completed_hours AS
SELECT
  teacher_id,
  to_char(completed_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month_key,
  SUM(duration_minutes) / 60.0 AS total_hours
FROM lessons
WHERE status = 'completed'
  AND completed_at IS NOT NULL
GROUP BY teacher_id, to_char(completed_at AT TIME ZONE 'UTC', 'YYYY-MM');

CREATE OR REPLACE FUNCTION public.check_student_reschedule_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  request_count int;
BEGIN
  IF NEW.initiator = 'student' THEN
    SELECT COUNT(*)
    INTO request_count
    FROM lesson_reschedule_requests
    WHERE student_id = NEW.student_id
      AND request_month = NEW.request_month
      AND status <> 'cancelled'
      AND (TG_OP = 'INSERT' OR id <> NEW.id);

    IF request_count >= 2 THEN
      RAISE EXCEPTION 'Student reschedule limit exceeded for month %', NEW.request_month;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_student_reschedule_limit ON lesson_reschedule_requests;
CREATE TRIGGER trg_check_student_reschedule_limit
  BEFORE INSERT OR UPDATE ON lesson_reschedule_requests
  FOR EACH ROW EXECUTE FUNCTION public.check_student_reschedule_limit();

CREATE OR REPLACE FUNCTION public.on_lesson_completed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    UPDATE enrollments
    SET sessions_completed = sessions_completed + 1,
        sessions_remaining = GREATEST(COALESCE(sessions_remaining, sessions_total - sessions_completed) - 1, 0)
    WHERE id = NEW.enrollment_id;

    IF NEW.is_trial THEN
      UPDATE students
      SET trial_used = true
      WHERE id = NEW.student_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_lesson_completed ON lessons;
CREATE TRIGGER trg_on_lesson_completed
  AFTER UPDATE OF status ON lessons
  FOR EACH ROW EXECUTE FUNCTION public.on_lesson_completed();

CREATE OR REPLACE FUNCTION public.on_payment_confirmed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed') THEN
    UPDATE enrollments
    SET payment_status = 'confirmed',
        status = CASE WHEN status = 'pending_payment' THEN 'active'::enrollment_status ELSE status END
    WHERE id = NEW.enrollment_id;

    UPDATE lessons
    SET status = 'scheduled'
    WHERE enrollment_id = NEW.enrollment_id
      AND status = 'pending_payment';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_payment_confirmed ON payments;
CREATE TRIGGER trg_on_payment_confirmed
  AFTER UPDATE OF status ON payments
  FOR EACH ROW EXECUTE FUNCTION public.on_payment_confirmed();

CREATE OR REPLACE FUNCTION public.on_chat_message_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE chat_rooms
  SET last_message_at = NEW.created_at
  WHERE id = NEW.room_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_chat_message_insert ON chat_messages;
CREATE TRIGGER trg_on_chat_message_insert
  AFTER INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.on_chat_message_insert();

CREATE OR REPLACE FUNCTION public.on_reschedule_approved()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE lessons
    SET scheduled_at = NEW.proposed_scheduled_at,
        status = CASE WHEN status = 'reschedule_pending' THEN 'scheduled'::lesson_status ELSE status END
    WHERE id = NEW.lesson_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_reschedule_approved ON lesson_reschedule_requests;
CREATE TRIGGER trg_on_reschedule_approved
  AFTER UPDATE OF status ON lesson_reschedule_requests
  FOR EACH ROW EXECUTE FUNCTION public.on_reschedule_approved();

-- ---------------------------------------------------------------------------
-- 6. Seed data — pricing_plans (4 plans) & salary_settings
-- ---------------------------------------------------------------------------

INSERT INTO pricing_plans (
  plan_type,
  sessions_count,
  session_minutes,
  slot_block_minutes,
  price_krw,
  price_cny,
  description,
  is_active
)
VALUES
  (
    'weekday5_20min',
    20,
    20,
    20,
    87000,
    480,
    '{
      "ko": {"name": "주5회(월~금) 20분"},
      "zh-CN": {"name": "每周5次(周一至周五) 20分钟"},
      "schedule_days": ["Mon", "Tue", "Wed", "Thu", "Fri"],
      "sort_order": 1,
      "is_popular": true
    }'::jsonb,
    true
  ),
  (
    'mwf_20min',
    12,
    20,
    20,
    90000,
    490,
    '{
      "ko": {"name": "월·수·금 20분"},
      "zh-CN": {"name": "周一·周三·周五 20分钟"},
      "schedule_days": ["Mon", "Wed", "Fri"],
      "sort_order": 2,
      "is_popular": false
    }'::jsonb,
    true
  ),
  (
    'tuth_20min',
    8,
    20,
    20,
    64000,
    340,
    '{
      "ko": {"name": "화·목 20분"},
      "zh-CN": {"name": "周二·周四 20分钟"},
      "schedule_days": ["Tue", "Thu"],
      "sort_order": 3,
      "is_popular": false
    }'::jsonb,
    true
  ),
  (
    'weekend_20min',
    8,
    20,
    20,
    64000,
    340,
    '{
      "ko": {"name": "주말(토·일) 20분"},
      "zh-CN": {"name": "周末(周六·周日) 20分钟"},
      "schedule_days": ["Sat", "Sun"],
      "sort_order": 4,
      "is_popular": false
    }'::jsonb,
    true
  )
ON CONFLICT (plan_type) DO UPDATE SET
  sessions_count = EXCLUDED.sessions_count,
  session_minutes = EXCLUDED.session_minutes,
  slot_block_minutes = EXCLUDED.slot_block_minutes,
  price_krw = EXCLUDED.price_krw,
  price_cny = EXCLUDED.price_cny,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;

INSERT INTO salary_settings (
  id,
  monthly_bonus_per_hour_php,
  quarter_bonus_tier1_hours,
  quarter_bonus_tier1_php,
  quarter_bonus_tier2_hours,
  quarter_bonus_tier2_php,
  quarter_bonus_tier3_php,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  25,
  300,
  2000,
  150,
  1300,
  700,
  now()
)
ON CONFLICT (id) DO UPDATE SET
  monthly_bonus_per_hour_php = EXCLUDED.monthly_bonus_per_hour_php,
  quarter_bonus_tier1_hours = EXCLUDED.quarter_bonus_tier1_hours,
  quarter_bonus_tier1_php = EXCLUDED.quarter_bonus_tier1_php,
  quarter_bonus_tier2_hours = EXCLUDED.quarter_bonus_tier2_hours,
  quarter_bonus_tier2_php = EXCLUDED.quarter_bonus_tier2_php,
  quarter_bonus_tier3_php = EXCLUDED.quarter_bonus_tier3_php,
  updated_at = EXCLUDED.updated_at;
