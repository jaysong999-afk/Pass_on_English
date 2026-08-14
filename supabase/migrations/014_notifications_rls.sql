-- Demo RLS for in-app notifications (when RLS enabled)

DO $policies$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['notifications']
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
