-- Fix demo admin auth user (password + identity) — mirrors 010_demo_auth_fix.sql

UPDATE auth.users
SET
  encrypted_password = extensions.crypt('DemoPass123!', extensions.gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  raw_app_meta_data = COALESCE(raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb),
  raw_user_meta_data = COALESCE(
    raw_user_meta_data,
    '{"role":"admin","full_name":"Demo Admin"}'::jsonb
  )
WHERE email = 'demo-admin@example.org';

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
WHERE u.email = 'demo-admin@example.org'
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id);

INSERT INTO profiles (id, role, full_name, locale)
SELECT u.id, 'admin', 'Demo Admin', 'ko'
FROM auth.users u
WHERE u.email = 'demo-admin@example.org'
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name;
