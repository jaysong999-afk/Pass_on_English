-- Fix demo seed: valid teacher specialties + confirm auth users for sign-in

UPDATE teachers
SET specialties = ARRAY['Phonics', 'Friendly', 'Encouraging']::text[]
WHERE id = 'a0000001-0000-4000-8000-000000000001';

UPDATE auth.users
SET
  encrypted_password = extensions.crypt('DemoPass123!', extensions.gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE email IN ('demo-student@example.org', 'demo-teacher@example.org');

-- Allow authenticated + anon read on demo-facing tables when RLS was enabled manually
DO $policies$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'teachers' AND rowsecurity = true) THEN
    EXECUTE 'DROP POLICY IF EXISTS demo_public_read_teachers ON teachers';
    EXECUTE 'CREATE POLICY demo_public_read_teachers ON teachers FOR SELECT USING (true)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pricing_plans' AND rowsecurity = true) THEN
    EXECUTE 'DROP POLICY IF EXISTS demo_public_read_plans ON pricing_plans';
    EXECUTE 'CREATE POLICY demo_public_read_plans ON pricing_plans FOR SELECT USING (true)';
  END IF;
END
$policies$;
