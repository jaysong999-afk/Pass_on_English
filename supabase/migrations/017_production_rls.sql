-- Production RLS: role-based policies replacing demo open policies
-- Apply: Supabase Dashboard → SQL Editor, or `npx supabase db push`

-- ---------------------------------------------------------------------------
-- 1. Helper functions (SECURITY DEFINER)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_student(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.id = p_student_id
      AND s.account_holder_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.teacher_can_access_student(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin()
    OR public.owns_student(p_student_id)
    OR EXISTS (
      SELECT 1 FROM public.lessons l
      WHERE l.student_id = p_student_id AND l.teacher_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.chat_rooms c
      WHERE c.student_id = p_student_id AND c.teacher_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.teacher_student_context t
      WHERE t.student_id = p_student_id AND t.teacher_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_enrollment(p_enrollment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.enrollments e
    WHERE e.id = p_enrollment_id
      AND (
        public.is_admin()
        OR public.owns_student(e.student_id)
        OR EXISTS (
          SELECT 1 FROM public.lessons l
          WHERE l.enrollment_id = e.id AND l.teacher_id = auth.uid()
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_chat_room(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_rooms r
    WHERE r.id = p_room_id
      AND (
        public.is_admin()
        OR public.owns_student(r.student_id)
        OR r.teacher_id = auth.uid()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_admin_direct_thread(p_thread_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_direct_threads t
    WHERE t.id = p_thread_id
      AND (public.is_admin() OR t.profile_id = auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.reserve_teacher_availability_slots(
  p_teacher_id uuid,
  p_slots jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  slot jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'student'
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR slot IN SELECT value FROM jsonb_array_elements(p_slots)
  LOOP
    DELETE FROM public.teachers_weekly_availability
    WHERE teacher_id = p_teacher_id
      AND day = slot->>'day'
      AND start_time = (slot->>'start_time')::time;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_role() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owns_student(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_can_access_student(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_enrollment(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_chat_room(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_admin_direct_thread(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_teacher_availability_slots(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Drop legacy demo policies
-- ---------------------------------------------------------------------------

DO $drop_demo$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        policyname LIKE 'demo\_%' ESCAPE '\'
        OR policyname LIKE 'demo_public\_%' ESCAPE '\'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      pol.policyname,
      pol.schemaname,
      pol.tablename
    );
  END LOOP;
END
$drop_demo$;

-- ---------------------------------------------------------------------------
-- 3. Enable RLS on all public tables
-- ---------------------------------------------------------------------------

DO $enable$
DECLARE
  tbl record;
BEGIN
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl.tablename);
  END LOOP;
END
$enable$;

-- ---------------------------------------------------------------------------
-- 4. Drop existing production policies (idempotent re-run)
-- ---------------------------------------------------------------------------

DO $drop_prod$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname LIKE 'rls\_%' ESCAPE '\'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      pol.policyname,
      pol.schemaname,
      pol.tablename
    );
  END LOOP;
END
$drop_prod$;

-- ---------------------------------------------------------------------------
-- 5. Table policies
-- ---------------------------------------------------------------------------

-- profiles
CREATE POLICY rls_profiles_select ON profiles
  FOR SELECT USING (id = auth.uid() OR public.is_admin());
CREATE POLICY rls_profiles_update ON profiles
  FOR UPDATE USING (id = auth.uid() OR public.is_admin());

-- students
CREATE POLICY rls_students_select ON students
  FOR SELECT USING (public.teacher_can_access_student(id));
CREATE POLICY rls_students_insert ON students
  FOR INSERT WITH CHECK (account_holder_id = auth.uid() OR public.is_admin());
CREATE POLICY rls_students_update ON students
  FOR UPDATE USING (account_holder_id = auth.uid() OR public.is_admin());

-- teachers
CREATE POLICY rls_teachers_select ON teachers
  FOR SELECT USING (status = 'active'::teacher_status OR id = auth.uid() OR public.is_admin());
CREATE POLICY rls_teachers_insert ON teachers
  FOR INSERT WITH CHECK (id = auth.uid() OR public.is_admin());
CREATE POLICY rls_teachers_update ON teachers
  FOR UPDATE USING (id = auth.uid() OR public.is_admin());

-- teacher availability (public read for enrollment slot UI)
CREATE POLICY rls_availability_select ON teachers_weekly_availability
  FOR SELECT USING (true);
CREATE POLICY rls_availability_mutate ON teachers_weekly_availability
  FOR ALL
  USING (teacher_id = auth.uid() OR public.is_admin())
  WITH CHECK (teacher_id = auth.uid() OR public.is_admin());

CREATE POLICY rls_availability_exceptions_select ON teacher_availability_exceptions
  FOR SELECT USING (true);
CREATE POLICY rls_availability_exceptions_mutate ON teacher_availability_exceptions
  FOR ALL
  USING (teacher_id = auth.uid() OR public.is_admin())
  WITH CHECK (teacher_id = auth.uid() OR public.is_admin());

-- pricing / faq / dashboard (public read)
CREATE POLICY rls_pricing_plans_select ON pricing_plans
  FOR SELECT USING (true);
CREATE POLICY rls_pricing_plans_admin ON pricing_plans
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY rls_faq_select ON faq_items
  FOR SELECT USING (published = true OR public.is_admin());
CREATE POLICY rls_faq_admin ON faq_items
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY rls_dashboard_select ON dashboard_settings
  FOR SELECT USING (true);
CREATE POLICY rls_dashboard_admin ON dashboard_settings
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- enrollments / lessons / payments
CREATE POLICY rls_enrollments_select ON enrollments
  FOR SELECT USING (
    public.is_admin()
    OR public.owns_student(student_id)
    OR EXISTS (
      SELECT 1 FROM public.lessons l
      WHERE l.enrollment_id = enrollments.id AND l.teacher_id = auth.uid()
    )
  );
CREATE POLICY rls_enrollments_insert ON enrollments
  FOR INSERT WITH CHECK (public.owns_student(student_id) OR public.is_admin());
CREATE POLICY rls_enrollments_update ON enrollments
  FOR UPDATE USING (
    public.owns_student(student_id) OR public.is_admin()
  );

CREATE POLICY rls_lessons_select ON lessons
  FOR SELECT USING (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR public.owns_student(student_id)
  );
CREATE POLICY rls_lessons_insert ON lessons
  FOR INSERT WITH CHECK (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR public.owns_student(student_id)
  );
CREATE POLICY rls_lessons_update ON lessons
  FOR UPDATE USING (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR public.owns_student(student_id)
  );

CREATE POLICY rls_payments_select ON payments
  FOR SELECT USING (
    public.is_admin() OR public.owns_student(student_id)
  );
CREATE POLICY rls_payments_insert ON payments
  FOR INSERT WITH CHECK (public.owns_student(student_id) OR public.is_admin());
CREATE POLICY rls_payments_update ON payments
  FOR UPDATE USING (public.is_admin());

CREATE POLICY rls_lesson_feedbacks_select ON lesson_feedbacks
  FOR SELECT USING (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR public.owns_student(student_id)
  );
CREATE POLICY rls_lesson_feedbacks_mutate ON lesson_feedbacks
  FOR ALL
  USING (teacher_id = auth.uid() OR public.is_admin())
  WITH CHECK (teacher_id = auth.uid() OR public.is_admin());

CREATE POLICY rls_reschedule_select ON lesson_reschedule_requests
  FOR SELECT USING (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR public.owns_student(student_id)
  );
CREATE POLICY rls_reschedule_mutate ON lesson_reschedule_requests
  FOR ALL
  USING (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR public.owns_student(student_id)
  )
  WITH CHECK (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR public.owns_student(student_id)
  );

-- chat
CREATE POLICY rls_chat_rooms_select ON chat_rooms
  FOR SELECT USING (
    public.is_admin()
    OR public.owns_student(student_id)
    OR teacher_id = auth.uid()
  );
CREATE POLICY rls_chat_rooms_insert ON chat_rooms
  FOR INSERT WITH CHECK (public.is_admin() OR public.owns_student(student_id) OR teacher_id = auth.uid());
CREATE POLICY rls_chat_rooms_update ON chat_rooms
  FOR UPDATE USING (
    public.is_admin()
    OR public.owns_student(student_id)
    OR teacher_id = auth.uid()
  );

CREATE POLICY rls_chat_messages_select ON chat_messages
  FOR SELECT USING (public.can_access_chat_room(room_id));
CREATE POLICY rls_chat_messages_insert ON chat_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND public.can_access_chat_room(room_id)
  );
CREATE POLICY rls_chat_messages_update ON chat_messages
  FOR UPDATE USING (public.can_access_chat_room(room_id));

-- teacher student context
CREATE POLICY rls_teacher_student_context_select ON teacher_student_context
  FOR SELECT USING (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR public.owns_student(student_id)
  );
CREATE POLICY rls_teacher_student_context_mutate ON teacher_student_context
  FOR ALL
  USING (teacher_id = auth.uid() OR public.is_admin())
  WITH CHECK (teacher_id = auth.uid() OR public.is_admin());

-- notifications / push
CREATE POLICY rls_notifications_select ON notifications
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY rls_notifications_update ON notifications
  FOR UPDATE USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY rls_notifications_insert ON notifications
  FOR INSERT WITH CHECK (public.is_admin() OR user_id = auth.uid());

CREATE POLICY rls_push_subscriptions_own ON push_subscriptions
  FOR ALL
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- admin messaging
CREATE POLICY rls_admin_direct_threads_select ON admin_direct_threads
  FOR SELECT USING (public.is_admin() OR profile_id = auth.uid());
CREATE POLICY rls_admin_direct_threads_mutate ON admin_direct_threads
  FOR ALL
  USING (public.is_admin() OR profile_id = auth.uid())
  WITH CHECK (public.is_admin() OR profile_id = auth.uid());

CREATE POLICY rls_admin_direct_messages_select ON admin_direct_messages
  FOR SELECT USING (public.can_access_admin_direct_thread(thread_id));
CREATE POLICY rls_admin_direct_messages_insert ON admin_direct_messages
  FOR INSERT WITH CHECK (
    public.can_access_admin_direct_thread(thread_id)
    AND (sender_id = auth.uid() OR public.is_admin())
  );
CREATE POLICY rls_admin_direct_messages_update ON admin_direct_messages
  FOR UPDATE USING (public.can_access_admin_direct_thread(thread_id));

CREATE POLICY rls_admin_broadcasts_admin ON admin_broadcasts
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY rls_notification_rules_select ON system_notification_rules
  FOR SELECT USING (public.is_admin());
CREATE POLICY rls_notification_rules_admin ON system_notification_rules
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- teacher applications (public insert for signup)
CREATE POLICY rls_teacher_applications_insert ON teacher_applications
  FOR INSERT WITH CHECK (true);
CREATE POLICY rls_teacher_applications_select ON teacher_applications
  FOR SELECT USING (public.is_admin());
CREATE POLICY rls_teacher_applications_admin_mutate ON teacher_applications
  FOR UPDATE USING (public.is_admin());
CREATE POLICY rls_teacher_applications_admin_delete ON teacher_applications
  FOR DELETE USING (public.is_admin());

CREATE POLICY rls_student_registration_reviews_admin ON student_registration_reviews
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- finance / salary / admin ops (admin only)
CREATE POLICY rls_finance_transactions_admin ON finance_transactions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY rls_finance_snapshots_admin ON finance_snapshots
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY rls_salary_settings_admin ON salary_settings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY rls_teacher_bonuses_admin ON teacher_bonuses
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY rls_teacher_monthly_attendance_admin ON teacher_monthly_attendance
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY rls_quarterly_bonus_admin ON quarterly_bonus_records
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY rls_teacher_salary_statements_select ON teacher_salary_statements
  FOR SELECT USING (teacher_id = auth.uid() OR public.is_admin());
CREATE POLICY rls_teacher_salary_statements_admin ON teacher_salary_statements
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY rls_admin_lesson_operation_logs_admin ON admin_lesson_operation_logs
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY rls_admin_review_logs_admin ON admin_review_logs
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY rls_teacher_payroll_penalties_admin ON teacher_payroll_penalties
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY rls_monthly_growth_reports_select ON monthly_growth_reports
  FOR SELECT USING (public.owns_student(student_id) OR teacher_id = auth.uid() OR public.is_admin());
CREATE POLICY rls_monthly_growth_reports_mutate ON monthly_growth_reports
  FOR ALL
  USING (teacher_id = auth.uid() OR public.is_admin())
  WITH CHECK (teacher_id = auth.uid() OR public.is_admin());
