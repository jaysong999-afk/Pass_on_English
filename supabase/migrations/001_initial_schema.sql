-- Pass on English — Initial schema stub
-- Full schema: see docs/db.md
-- Run: supabase db push

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ENUM types (abbreviated — expand per db.md)
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('student', 'teacher', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- profiles linked to auth.users
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'student',
  full_name text,
  locale text DEFAULT 'ko',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- pricing_plans seed
CREATE TABLE IF NOT EXISTS pricing_plans (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_type text UNIQUE NOT NULL,
  sessions_count int NOT NULL,
  session_minutes int NOT NULL,
  price_krw int NOT NULL,
  price_cny int NOT NULL,
  is_active boolean DEFAULT true
);

INSERT INTO pricing_plans (plan_type, sessions_count, session_minutes, price_krw, price_cny)
VALUES
  ('weekday5_20min', 40, 20, 87000, 480),
  ('mwf_30min', 12, 30, 90000, 490),
  ('tuth_8sessions', 8, 25, 64000, 340)
ON CONFLICT (plan_type) DO NOTHING;

-- TODO: students, teachers, enrollments, lessons, payments, chat, salary tables
-- See docs/db.md for complete migration sequence
