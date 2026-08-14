-- Demo admin auth user for local QA
-- Login: demo-admin@example.org — password: DemoPass123!

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

DO $seed$
DECLARE
  v_admin_id uuid := 'a0000004-0000-4000-8000-000000000004';
  v_admin_email text := 'demo-admin@example.org';
  v_password text := 'DemoPass123!';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_admin_id) THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_admin_id, 'authenticated', 'authenticated', v_admin_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"role":"admin","full_name":"Demo Admin"}'::jsonb,
      now(), now()
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_admin_id, v_admin_id,
      jsonb_build_object('sub', v_admin_id::text, 'email', v_admin_email),
      'email', v_admin_id::text, now(), now(), now()
    );
  END IF;

  INSERT INTO profiles (id, role, full_name, locale)
  VALUES (v_admin_id, 'admin', 'Demo Admin', 'ko')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name;
END
$seed$;
