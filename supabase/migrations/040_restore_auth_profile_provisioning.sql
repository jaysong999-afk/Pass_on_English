-- Restore the auth.users -> public.profiles provisioning path after a database
-- migration. Supabase Auth can create users without this trigger, but every
-- student/teacher row depends on profiles(id), so the omission surfaces later
-- as a foreign-key failure.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  normalized_role public.user_role;
  normalized_account_type public.account_type;
  normalized_country text;
BEGIN
  normalized_role := CASE NEW.raw_user_meta_data->>'role'
    WHEN 'teacher' THEN 'teacher'::public.user_role
    WHEN 'admin' THEN 'admin'::public.user_role
    ELSE 'student'::public.user_role
  END;

  normalized_account_type := CASE NEW.raw_user_meta_data->>'account_type'
    WHEN 'self' THEN 'self'::public.account_type
    WHEN 'guardian' THEN 'guardian'::public.account_type
    ELSE NULL
  END;

  normalized_country := CASE NEW.raw_user_meta_data->>'country'
    WHEN 'KR' THEN 'KR'
    WHEN 'CN' THEN 'CN'
    WHEN 'PH' THEN 'PH'
    WHEN 'OTHER' THEN 'OTHER'
    ELSE NULL
  END;

  INSERT INTO public.profiles (
    id,
    role,
    full_name,
    phone,
    locale,
    account_type,
    country,
    timezone,
    created_at
  )
  VALUES (
    NEW.id,
    normalized_role,
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'phone'), ''),
    COALESCE(NULLIF(BTRIM(NEW.raw_user_meta_data->>'locale'), ''), 'ko'),
    normalized_account_type,
    normalized_country,
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'timezone'), ''),
    NEW.created_at
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Hosted Supabase grants postgres TRIGGER privilege on auth.users but keeps
-- table ownership with supabase_auth_admin. Consequently CREATE TRIGGER is
-- allowed while DROP/ALTER TRIGGER is not. Replacing the function above updates
-- existing trigger behavior; create the trigger only when it is missing.
DO $create_profile_trigger$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND tgname = 'on_auth_user_created'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END
$create_profile_trigger$;

-- A trigger is not retroactive. Restore only missing profiles and preserve all
-- existing profile records unchanged.
INSERT INTO public.profiles (
  id,
  role,
  full_name,
  phone,
  locale,
  account_type,
  country,
  timezone,
  created_at
)
SELECT
  u.id,
  CASE u.raw_user_meta_data->>'role'
    WHEN 'teacher' THEN 'teacher'::public.user_role
    WHEN 'admin' THEN 'admin'::public.user_role
    ELSE 'student'::public.user_role
  END,
  NULLIF(BTRIM(u.raw_user_meta_data->>'full_name'), ''),
  NULLIF(BTRIM(u.raw_user_meta_data->>'phone'), ''),
  COALESCE(NULLIF(BTRIM(u.raw_user_meta_data->>'locale'), ''), 'ko'),
  CASE u.raw_user_meta_data->>'account_type'
    WHEN 'self' THEN 'self'::public.account_type
    WHEN 'guardian' THEN 'guardian'::public.account_type
    ELSE NULL
  END,
  CASE u.raw_user_meta_data->>'country'
    WHEN 'KR' THEN 'KR'
    WHEN 'CN' THEN 'CN'
    WHEN 'PH' THEN 'PH'
    WHEN 'OTHER' THEN 'OTHER'
    ELSE NULL
  END,
  NULLIF(BTRIM(u.raw_user_meta_data->>'timezone'), ''),
  u.created_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Profile backfill incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND tgname = 'on_auth_user_created'
      AND tgenabled = 'O'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'on_auth_user_created trigger is not enabled';
  END IF;
END
$verify$;

COMMIT;
