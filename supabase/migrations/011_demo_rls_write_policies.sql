-- Demo write policies (+ profiles read) when RLS is enabled on remote Supabase

DO $policies$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'profiles',
    'students',
    'enrollments',
    'lessons',
    'lesson_feedbacks',
    'chat_rooms',
    'chat_messages',
    'teacher_student_context',
    'lesson_reschedule_requests',
    'payments',
    'push_subscriptions',
    'finance_transactions',
    'teachers'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = tbl AND rowsecurity = true
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS demo_read_%I ON %I', tbl, tbl);
      EXECUTE format('CREATE POLICY demo_read_%I ON %I FOR SELECT USING (true)', tbl, tbl);
      EXECUTE format('DROP POLICY IF EXISTS demo_write_%I ON %I', tbl, tbl);
      EXECUTE format(
        'CREATE POLICY demo_write_%I ON %I FOR ALL USING (true) WITH CHECK (true)',
        tbl,
        tbl
      );
    END IF;
  END LOOP;
END
$policies$;
