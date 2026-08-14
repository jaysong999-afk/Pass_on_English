-- Fix demo auth passwords without deleting users (FK-safe)

UPDATE auth.users
SET
  encrypted_password = extensions.crypt('DemoPass123!', extensions.gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  raw_app_meta_data = COALESCE(raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb)
WHERE email IN ('demo-student@example.org', 'demo-teacher@example.org');

INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
SELECT
  u.id,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email',
  u.id::text,
  now(),
  now(),
  now()
FROM auth.users u
WHERE u.email IN ('demo-student@example.org', 'demo-teacher@example.org')
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id);
