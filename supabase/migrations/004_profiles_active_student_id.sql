-- Pass on English — persist active learner selection on account (profiles)
-- Spec: docs/db.md §4.1, backend.md student account session

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS active_student_id uuid REFERENCES students(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_active_student_id ON profiles (active_student_id);
