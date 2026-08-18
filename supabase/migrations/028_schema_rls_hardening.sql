-- Consolidate schema integrity and close the remaining profile/role RLS gaps.
-- This migration is additive and keeps the existing table/API contracts intact.

-- ---------------------------------------------------------------------------
-- 1. Schema integrity for persisted salary settlements
-- ---------------------------------------------------------------------------

DO $add_salary_finance_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'teacher_salary_statements_finance_transaction_id_fkey'
      AND conrelid = 'public.teacher_salary_statements'::regclass
  ) THEN
    ALTER TABLE public.teacher_salary_statements
      ADD CONSTRAINT teacher_salary_statements_finance_transaction_id_fkey
      FOREIGN KEY (finance_transaction_id)
      REFERENCES public.finance_transactions(id)
      ON DELETE SET NULL;
  END IF;
END
$add_salary_finance_fk$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_salary_statements_finance_transaction
  ON public.teacher_salary_statements (finance_transaction_id)
  WHERE finance_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_direct_threads_profile_id
  ON public.admin_direct_threads (profile_id);

-- ---------------------------------------------------------------------------
-- 2. Profile visibility
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_read_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  result boolean;
BEGIN
  SELECT
    p_profile_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.teachers t
      WHERE t.id = p_profile_id
        AND t.status = 'active'::public.teacher_status
    )
    OR EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.account_holder_id = p_profile_id
        AND (
          EXISTS (
            SELECT 1 FROM public.lessons l
            WHERE l.student_id = s.id AND l.teacher_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.chat_rooms c
            WHERE c.student_id = s.id AND c.teacher_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.teacher_student_context tsc
            WHERE tsc.student_id = s.id AND tsc.teacher_id = auth.uid()
          )
        )
    )
  INTO result;

  RETURN COALESCE(result, false);
END;
$$;

ALTER FUNCTION public.can_read_profile(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_read_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_profile(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS rls_profiles_select ON public.profiles;
DROP POLICY IF EXISTS rls_profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS rls_profiles_select_admin ON public.profiles;
CREATE POLICY rls_profiles_select ON public.profiles
  FOR SELECT
  USING (public.can_read_profile(id));

-- Anonymous landing pages only need public teacher identity fields. Removing the
-- table-level grant prevents direct reads of phone/country/timezone by anon.
REVOKE SELECT ON TABLE public.profiles FROM anon;
GRANT SELECT (id, full_name, avatar_url) ON public.profiles TO anon;

-- ---------------------------------------------------------------------------
-- 3. Prevent self-service privilege and payroll escalation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_profile_security_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  -- Service-role maintenance has no auth.uid(); authenticated admins retain the
  -- existing administrative update contract.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.role IS DISTINCT FROM OLD.role
      OR NEW.full_name IS DISTINCT FROM OLD.full_name
      OR NEW.account_type IS DISTINCT FROM OLD.account_type
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'profile_security_fields_are_admin_only'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.protect_profile_security_fields() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.protect_profile_security_fields() FROM PUBLIC;

DROP TRIGGER IF EXISTS protect_profile_security_fields ON public.profiles;
CREATE TRIGGER protect_profile_security_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_security_fields();

DROP POLICY IF EXISTS rls_profiles_update ON public.profiles;
CREATE POLICY rls_profiles_update ON public.profiles
  FOR UPDATE
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

CREATE OR REPLACE FUNCTION public.protect_teacher_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.hourly_rate_php IS DISTINCT FROM OLD.hourly_rate_php
      OR NEW.application_id IS DISTINCT FROM OLD.application_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'teacher_admin_fields_are_admin_only'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.protect_teacher_admin_fields() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.protect_teacher_admin_fields() FROM PUBLIC;

DROP TRIGGER IF EXISTS protect_teacher_admin_fields ON public.teachers;
CREATE TRIGGER protect_teacher_admin_fields
  BEFORE UPDATE ON public.teachers
  FOR EACH ROW EXECUTE FUNCTION public.protect_teacher_admin_fields();

DROP POLICY IF EXISTS rls_teachers_update ON public.teachers;
CREATE POLICY rls_teachers_update ON public.teachers
  FOR UPDATE
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Helper execution privileges
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owns_student(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teacher_can_access_student(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_enrollment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_chat_room(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_admin_direct_thread(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_teacher_availability_slots(uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_can_access_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_enrollment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_chat_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_admin_direct_thread(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_teacher_availability_slots(uuid, jsonb) TO authenticated;

