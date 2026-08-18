-- Restore the reschedule request table when a partially applied database
-- contains the RPCs but is missing the table created by the initial schema.
CREATE TABLE IF NOT EXISTS public.lesson_reschedule_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  initiator public.reschedule_initiator NOT NULL,
  original_scheduled_at timestamptz NOT NULL,
  proposed_scheduled_at timestamptz NOT NULL,
  status public.reschedule_status NOT NULL DEFAULT 'pending_student_approval',
  reason text,
  request_month text NOT NULL,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_reschedule_lesson_status
  ON public.lesson_reschedule_requests (lesson_id, status);
CREATE INDEX IF NOT EXISTS idx_lesson_reschedule_student_month
  ON public.lesson_reschedule_requests (student_id, request_month);
CREATE INDEX IF NOT EXISTS idx_lesson_reschedule_teacher_status
  ON public.lesson_reschedule_requests (teacher_id, status);

ALTER TABLE public.lesson_reschedule_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_reschedule_select ON public.lesson_reschedule_requests;
CREATE POLICY rls_reschedule_select ON public.lesson_reschedule_requests
  FOR SELECT USING (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR public.owns_student(student_id)
  );

DROP POLICY IF EXISTS rls_reschedule_mutate ON public.lesson_reschedule_requests;
CREATE POLICY rls_reschedule_mutate ON public.lesson_reschedule_requests
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

CREATE OR REPLACE FUNCTION public.check_student_reschedule_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  request_count int;
BEGIN
  IF NEW.initiator = 'student' THEN
    SELECT COUNT(*) INTO request_count
    FROM public.lesson_reschedule_requests
    WHERE student_id = NEW.student_id
      AND request_month = NEW.request_month
      AND status <> 'cancelled'
      AND (TG_OP = 'INSERT' OR id <> NEW.id);
    IF request_count >= 2 THEN
      RAISE EXCEPTION 'Student reschedule limit exceeded for month %', NEW.request_month;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_student_reschedule_limit
  ON public.lesson_reschedule_requests;
CREATE TRIGGER trg_check_student_reschedule_limit
  BEFORE INSERT OR UPDATE ON public.lesson_reschedule_requests
  FOR EACH ROW EXECUTE FUNCTION public.check_student_reschedule_limit();

-- Keep the original approval side effect when the table is restored independently
-- from the initial schema migration.
CREATE OR REPLACE FUNCTION public.on_reschedule_approved()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE public.lessons
    SET scheduled_at = NEW.proposed_scheduled_at,
        status = CASE
          WHEN status = 'reschedule_pending' THEN 'scheduled'::public.lesson_status
          ELSE status
        END
    WHERE id = NEW.lesson_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_reschedule_approved
  ON public.lesson_reschedule_requests;
CREATE TRIGGER trg_on_reschedule_approved
  AFTER UPDATE OF status ON public.lesson_reschedule_requests
  FOR EACH ROW EXECUTE FUNCTION public.on_reschedule_approved();
