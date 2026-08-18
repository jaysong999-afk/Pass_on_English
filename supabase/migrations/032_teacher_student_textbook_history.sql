ALTER TABLE public.teacher_student_context
  ADD COLUMN IF NOT EXISTS textbook_history jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.teacher_student_context.textbook_history IS
  'Previous textbook values, newest first. Each entry contains textbook and replacedAt.';

CREATE OR REPLACE FUNCTION public.archive_teacher_student_textbook()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF btrim(COALESCE(NEW.textbook, '')) IS DISTINCT FROM btrim(COALESCE(OLD.textbook, ''))
     AND btrim(COALESCE(OLD.textbook, '')) <> '' THEN
    NEW.textbook_history := jsonb_build_array(
      jsonb_build_object(
        'textbook', OLD.textbook,
        'replacedAt', now()
      )
    ) || COALESCE(OLD.textbook_history, '[]'::jsonb);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_archive_teacher_student_textbook
  ON public.teacher_student_context;
CREATE TRIGGER trg_archive_teacher_student_textbook
  BEFORE UPDATE OF textbook ON public.teacher_student_context
  FOR EACH ROW
  EXECUTE FUNCTION public.archive_teacher_student_textbook();
