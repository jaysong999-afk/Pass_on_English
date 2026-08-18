ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS video_platforms public.video_platform[] NOT NULL
  DEFAULT ARRAY['ZOOM'::public.video_platform];

ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS video_platforms public.video_platform[] NOT NULL
  DEFAULT ARRAY['ZOOM'::public.video_platform];

ALTER TABLE public.teacher_applications
  ADD COLUMN IF NOT EXISTS video_platforms public.video_platform[] NOT NULL
  DEFAULT ARRAY['ZOOM'::public.video_platform];

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_video_platforms_nonempty;
ALTER TABLE public.students ADD CONSTRAINT students_video_platforms_nonempty
  CHECK (cardinality(video_platforms) BETWEEN 1 AND 2);
ALTER TABLE public.teachers DROP CONSTRAINT IF EXISTS teachers_video_platforms_nonempty;
ALTER TABLE public.teachers ADD CONSTRAINT teachers_video_platforms_nonempty
  CHECK (cardinality(video_platforms) BETWEEN 1 AND 2);
ALTER TABLE public.teacher_applications DROP CONSTRAINT IF EXISTS teacher_applications_video_platforms_nonempty;
ALTER TABLE public.teacher_applications ADD CONSTRAINT teacher_applications_video_platforms_nonempty
  CHECK (cardinality(video_platforms) BETWEEN 1 AND 2);
