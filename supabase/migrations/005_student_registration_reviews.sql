-- Pass on English — student registration reviews (admin review center: student_signup)
-- Spec: docs/backend.md §7.3, docs/db.md §8
-- Run after 001~004

-- ---------------------------------------------------------------------------
-- 1. ENUM
-- ---------------------------------------------------------------------------

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'registration_status') THEN
    CREATE TYPE registration_status AS ENUM ('pending', 'confirmed', 'rejected');
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- 2. student_registration_reviews
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS student_registration_reviews (
  id uuid PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  account_holder_name text NOT NULL,
  account_email text NOT NULL,
  account_phone text NOT NULL,
  account_type account_type NOT NULL,
  country country_code NOT NULL,
  learner_full_name text NOT NULL,
  learner_english_name text NOT NULL,
  learner_date_of_birth date NOT NULL,
  english_level text,
  purposes text[] NOT NULL DEFAULT '{}',
  status registration_status NOT NULL DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_student_registration_reviews_status_submitted
  ON student_registration_reviews (status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_registration_reviews_account_email
  ON student_registration_reviews (account_email);
