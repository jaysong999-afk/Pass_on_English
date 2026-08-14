-- Allow teacher applicants to read their own application (Package B signup step 2)
DROP POLICY IF EXISTS rls_teacher_applications_select ON teacher_applications;

CREATE POLICY rls_teacher_applications_select ON teacher_applications
  FOR SELECT USING (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
