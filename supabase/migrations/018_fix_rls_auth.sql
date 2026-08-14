-- Fix RLS helper recursion / auth sign-in failures after 017

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result user_role;
BEGIN
  SELECT role INTO result FROM public.profiles WHERE id = auth.uid();
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
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
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) INTO result;
  RETURN COALESCE(result, false);
END;
$$;

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

CREATE OR REPLACE FUNCTION public.teacher_can_access_student(p_student_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result boolean;
BEGIN
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
    )
  INTO result;
  RETURN COALESCE(result, false);
END;
$$;

ALTER FUNCTION public.current_user_role() OWNER TO postgres;
ALTER FUNCTION public.is_admin() OWNER TO postgres;
ALTER FUNCTION public.owns_student(uuid) OWNER TO postgres;
ALTER FUNCTION public.teacher_can_access_student(uuid) OWNER TO postgres;
ALTER FUNCTION public.can_access_enrollment(uuid) OWNER TO postgres;
ALTER FUNCTION public.can_access_chat_room(uuid) OWNER TO postgres;
ALTER FUNCTION public.can_access_admin_direct_thread(uuid) OWNER TO postgres;
ALTER FUNCTION public.reserve_teacher_availability_slots(uuid, jsonb) OWNER TO postgres;

-- profiles: avoid self-referential policy evaluation
DROP POLICY IF EXISTS rls_profiles_select ON profiles;
CREATE POLICY rls_profiles_select_own ON profiles
  FOR SELECT USING (id = auth.uid());
CREATE POLICY rls_profiles_select_admin ON profiles
  FOR SELECT USING (public.is_admin());

GRANT EXECUTE ON FUNCTION public.current_user_role() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
