-- Admin lesson operations may remove an unpaid lesson. The route handler
-- performs the admin authentication check; this policy protects the
-- request-scoped database path used by that handler.
DROP POLICY IF EXISTS rls_lessons_delete ON public.lessons;
CREATE POLICY rls_lessons_delete ON public.lessons
  FOR DELETE
  USING (public.is_admin());
