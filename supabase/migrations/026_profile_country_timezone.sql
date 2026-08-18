-- Account-level locale settings. Students keep country for compatibility with
-- enrollment/teacher-context queries, while profiles are the source of truth.
ALTER TYPE country_code ADD VALUE IF NOT EXISTS 'PH';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS timezone text;

UPDATE profiles p
SET country = COALESCE(
  p.country,
  (SELECT s.country::text FROM students s
   WHERE s.account_holder_id = p.id AND s.country IS NOT NULL
   ORDER BY s.created_at ASC LIMIT 1),
  'KR'
)
WHERE p.role = 'student';

UPDATE profiles
SET timezone = CASE country
  WHEN 'CN' THEN 'Asia/Shanghai'
  WHEN 'PH' THEN 'Asia/Manila'
  ELSE 'Asia/Seoul'
END
WHERE role = 'student' AND timezone IS NULL;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_country_check
  CHECK (country IS NULL OR country IN ('KR', 'CN', 'PH', 'OTHER'));

ALTER TABLE profiles
  ADD CONSTRAINT profiles_timezone_nonempty_check
  CHECK (timezone IS NULL OR length(trim(timezone)) > 0);
