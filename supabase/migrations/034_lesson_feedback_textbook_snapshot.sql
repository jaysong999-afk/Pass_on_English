ALTER TABLE public.lesson_feedbacks
  ADD COLUMN IF NOT EXISTS textbook text;

COMMENT ON COLUMN public.lesson_feedbacks.textbook IS
  'Textbook snapshot captured when the lesson feedback is recorded.';

UPDATE public.lesson_feedbacks AS feedback
SET textbook = context.textbook
FROM public.teacher_student_context AS context
WHERE context.teacher_id = feedback.teacher_id
  AND context.student_id = feedback.student_id
  AND feedback.textbook IS NULL
  AND btrim(context.textbook) <> '';
