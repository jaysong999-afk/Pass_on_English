ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS gender text;

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_gender_valid;
ALTER TABLE public.students ADD CONSTRAINT students_gender_valid
  CHECK (gender IS NULL OR gender IN ('male', 'female'));

COMMENT ON COLUMN public.students.gender IS
  'Gender of the learner who attends lessons: male or female.';
