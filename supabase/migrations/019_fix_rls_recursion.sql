-- Break RLS policy recursion (students <-> lessons) and open profile reads for auth/chat.

CREATE OR REPLACE FUNCTION public.owns_student(p_student_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.id = p_student_id
      AND s.account_holder_id = auth.uid()
  ) INTO result;
  RETURN COALESCE(result, false);
END;
$$;

ALTER FUNCTION public.owns_student(uuid) OWNER TO postgres;

DROP POLICY IF EXISTS rls_profiles_select_own ON profiles;
DROP POLICY IF EXISTS rls_profiles_select_admin ON profiles;
DROP POLICY IF EXISTS rls_profiles_select ON profiles;
CREATE POLICY rls_profiles_select ON profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS rls_students_select ON students;
CREATE POLICY rls_students_select ON students
  FOR SELECT USING (
    account_holder_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.lessons l
      WHERE l.student_id = students.id AND l.teacher_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.chat_rooms c
      WHERE c.student_id = students.id AND c.teacher_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.teacher_student_context t
      WHERE t.student_id = students.id AND t.teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS rls_lessons_select ON lessons;
CREATE POLICY rls_lessons_select ON lessons
  FOR SELECT USING (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR public.owns_student(student_id)
  );

DROP POLICY IF EXISTS rls_lessons_insert ON lessons;
CREATE POLICY rls_lessons_insert ON lessons
  FOR INSERT WITH CHECK (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR public.owns_student(student_id)
  );

DROP POLICY IF EXISTS rls_lessons_update ON lessons;
CREATE POLICY rls_lessons_update ON lessons
  FOR UPDATE USING (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR public.owns_student(student_id)
  );

DROP POLICY IF EXISTS rls_enrollments_select ON enrollments;
CREATE POLICY rls_enrollments_select ON enrollments
  FOR SELECT USING (
    public.is_admin()
    OR public.owns_student(student_id)
    OR EXISTS (
      SELECT 1 FROM public.lessons l
      WHERE l.enrollment_id = enrollments.id AND l.teacher_id = auth.uid()
    )
  );
