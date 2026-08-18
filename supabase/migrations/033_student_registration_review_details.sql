ALTER TABLE public.student_registration_reviews
  ALTER COLUMN country TYPE text USING country::text;

ALTER TABLE public.student_registration_reviews
  DROP CONSTRAINT IF EXISTS student_registration_reviews_country_valid;
ALTER TABLE public.student_registration_reviews
  ADD CONSTRAINT student_registration_reviews_country_valid
  CHECK (country IN ('KR', 'CN', 'PH', 'OTHER'));

ALTER TABLE public.student_registration_reviews
  ADD COLUMN IF NOT EXISTS learner_gender text,
  ADD COLUMN IF NOT EXISTS video_platforms public.video_platform[] NOT NULL
    DEFAULT ARRAY['ZOOM'::public.video_platform],
  ADD COLUMN IF NOT EXISTS survey_notes text;

ALTER TABLE public.student_registration_reviews
  DROP CONSTRAINT IF EXISTS student_registration_reviews_gender_valid;
ALTER TABLE public.student_registration_reviews
  ADD CONSTRAINT student_registration_reviews_gender_valid
  CHECK (learner_gender IS NULL OR learner_gender IN ('male', 'female'));

ALTER TABLE public.student_registration_reviews
  DROP CONSTRAINT IF EXISTS student_registration_reviews_video_platforms_nonempty;
ALTER TABLE public.student_registration_reviews
  ADD CONSTRAINT student_registration_reviews_video_platforms_nonempty
  CHECK (cardinality(video_platforms) BETWEEN 1 AND 2);

UPDATE public.student_registration_reviews AS review
SET learner_gender = student.gender,
    video_platforms = student.video_platforms,
    english_level = student.english_level,
    purposes = student.purposes,
    survey_notes = student.onboarding_note
FROM public.students AS student
WHERE student.id = review.id;
