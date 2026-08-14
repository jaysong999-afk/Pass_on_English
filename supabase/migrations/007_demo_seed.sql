-- Optional demo seed users + idempotent relational demo data.
-- Login: demo-student@example.org / demo-teacher@example.org — password: DemoPass123!
-- Apply: supabase db push  OR run in SQL Editor

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

-- Fixed demo UUIDs (stable across re-seeds)
-- Teacher auth/profile: a0000001-0000-4000-8000-000000000001
-- Student account:       a0000002-0000-4000-8000-000000000002
-- Learner (students):    a0000003-0000-4000-8000-000000000003

DO $seed$
DECLARE
  v_teacher_id uuid := 'a0000001-0000-4000-8000-000000000001';
  v_student_user_id uuid := 'a0000002-0000-4000-8000-000000000002';
  v_learner_id uuid := 'a0000003-0000-4000-8000-000000000003';
  v_teacher_email text := 'demo-teacher@example.org';
  v_student_email text := 'demo-student@example.org';
  v_password text := 'DemoPass123!';
  v_plan_id uuid;
  v_active_enrollment_id uuid := 'a0000010-0000-4000-8000-000000000010';
  v_pending_enrollment_id uuid := 'a0000011-0000-4000-8000-000000000011';
  v_completed_lesson_id uuid := 'a0000020-0000-4000-8000-000000000020';
  v_scheduled_lesson_id uuid := 'a0000021-0000-4000-8000-000000000021';
  v_chat_room_id uuid := 'a0000030-0000-4000-8000-000000000030';
BEGIN
  -- Demo teacher auth user
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_teacher_id) THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_teacher_id, 'authenticated', 'authenticated', v_teacher_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"role":"teacher","full_name":"Sarah Mitchell"}'::jsonb,
      now(), now()
    );
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_teacher_id, v_teacher_id,
      jsonb_build_object('sub', v_teacher_id::text, 'email', v_teacher_email),
      'email', v_teacher_id::text, now(), now(), now()
    );
  END IF;

  -- Demo student auth user
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_student_user_id) THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_student_user_id, 'authenticated', 'authenticated', v_student_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"role":"student","full_name":"김민준","country":"KR","account_type":"guardian"}'::jsonb,
      now(), now()
    );
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_student_user_id, v_student_user_id,
      jsonb_build_object('sub', v_student_user_id::text, 'email', v_student_email),
      'email', v_student_user_id::text, now(), now(), now()
    );
  END IF;

  INSERT INTO profiles (id, role, full_name, phone, account_type, locale, active_student_id)
  VALUES (v_teacher_id, 'teacher', 'Sarah Mitchell', NULL, NULL, 'ko', NULL)
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name;

  INSERT INTO profiles (id, role, full_name, phone, account_type, locale)
  VALUES (v_student_user_id, 'student', '김민준', '010-1234-5678', 'guardian', 'ko')
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    account_type = EXCLUDED.account_type;

  INSERT INTO teachers (id, display_name, bio, specialties, experience_years, status, hourly_rate_php, timezone)
  VALUES (
    v_teacher_id,
    'Sarah Mitchell',
    'Demo teacher — native English speaker with 8 years experience.',
    ARRAY['Phonics', 'Friendly', 'Encouraging'],
    8,
    'active',
    150,
    'Asia/Manila'
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    bio = EXCLUDED.bio,
    status = 'active';

  INSERT INTO students (
    id, account_holder_id, full_name, english_name, date_of_birth, country,
    english_level, purposes, trial_used, is_active
  ) VALUES (
    v_learner_id, v_student_user_id, '김민준', 'Minjun Kim', '2015-03-15', 'KR',
    'A1', ARRAY['daily_conversation', 'phonics'], true, true
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    english_name = EXCLUDED.english_name,
    country = EXCLUDED.country;

  UPDATE profiles SET active_student_id = v_learner_id WHERE id = v_student_user_id;

  SELECT id INTO v_plan_id FROM pricing_plans WHERE is_active = true ORDER BY plan_type LIMIT 1;
  IF v_plan_id IS NULL THEN
    RAISE NOTICE 'No pricing_plans found — skip enrollment seed';
    RETURN;
  END IF;

  DELETE FROM chat_messages WHERE room_id = v_chat_room_id;
  DELETE FROM chat_rooms WHERE id = v_chat_room_id;
  DELETE FROM lesson_feedbacks WHERE lesson_id IN (v_completed_lesson_id, v_scheduled_lesson_id);
  DELETE FROM lessons WHERE id IN (v_completed_lesson_id, v_scheduled_lesson_id);
  DELETE FROM payments WHERE enrollment_id IN (v_active_enrollment_id, v_pending_enrollment_id);
  DELETE FROM enrollments WHERE id IN (v_active_enrollment_id, v_pending_enrollment_id);

  DELETE FROM teachers_weekly_availability WHERE teacher_id = v_teacher_id;
  INSERT INTO teachers_weekly_availability (teacher_id, day, start_time)
  SELECT v_teacher_id, d.day, t.start_time::time
  FROM (VALUES ('Mon'), ('Tue'), ('Wed'), ('Thu'), ('Fri')) AS d(day)
  CROSS JOIN (VALUES ('09:00:00'), ('10:00:00'), ('11:00:00')) AS t(start_time);

  INSERT INTO enrollments (
    id, student_id, teacher_id, plan_id, status, payment_status, currency,
    total_amount, sessions_total, sessions_completed, sessions_remaining,
    curriculum, preferred_slot_time, preferred_slot_day, started_at, ended_at
  )
  SELECT
    v_active_enrollment_id, v_learner_id, v_teacher_id, v_plan_id,
    'active', 'confirmed', 'KRW', pp.price_krw, pp.sessions_count, 2, pp.sessions_count - 2,
    'Oxford Phonics 3', '10:00', 'Mon',
    now() - interval '14 days', now() + interval '46 days'
  FROM pricing_plans pp WHERE pp.id = v_plan_id;

  INSERT INTO enrollments (
    id, student_id, teacher_id, plan_id, status, payment_status, currency,
    total_amount, sessions_total, sessions_completed, curriculum,
    preferred_slot_time, preferred_slot_day
  )
  SELECT
    v_pending_enrollment_id, v_learner_id, v_teacher_id, v_plan_id,
    'pending_payment', 'reported', 'KRW', pp.price_krw, pp.sessions_count, 0,
    'Renewal demo', '10:00', 'Mon'
  FROM pricing_plans pp WHERE pp.id = v_plan_id;

  INSERT INTO payments (enrollment_id, student_id, amount, currency, status, depositor_name, reported_at)
  SELECT v_pending_enrollment_id, v_learner_id, pp.price_krw, 'KRW', 'reported', '김민준', now()
  FROM pricing_plans pp WHERE pp.id = v_plan_id;

  INSERT INTO lessons (
    id, enrollment_id, teacher_id, student_id, scheduled_at, duration_minutes,
    status, is_trial, completed_at
  ) VALUES (
    v_completed_lesson_id, v_active_enrollment_id, v_teacher_id, v_learner_id,
    ((CURRENT_DATE - 3) + TIME '10:00') AT TIME ZONE 'Asia/Seoul',
    20, 'completed', false,
    ((CURRENT_DATE - 3) + TIME '10:20') AT TIME ZONE 'Asia/Seoul'
  );

  INSERT INTO lessons (
    id, enrollment_id, teacher_id, student_id, scheduled_at, duration_minutes, status, is_trial
  ) VALUES (
    v_scheduled_lesson_id, v_active_enrollment_id, v_teacher_id, v_learner_id,
    ((CURRENT_DATE + 1) + TIME '10:00') AT TIME ZONE 'Asia/Seoul',
    20, 'scheduled', false
  );

  INSERT INTO chat_rooms (id, enrollment_id, student_id, teacher_id, last_message_at)
  VALUES (v_chat_room_id, v_active_enrollment_id, v_learner_id, v_teacher_id, now());

  INSERT INTO chat_messages (room_id, sender_id, sender_role, body, created_at) VALUES
    (v_chat_room_id, v_teacher_id, 'teacher', 'Welcome to Pass on English! See you in class.', now() - interval '1 day'),
    (v_chat_room_id, v_student_user_id, 'student', 'Thank you, teacher!', now());

  INSERT INTO teacher_student_context (teacher_id, student_id, textbook, video_platform, special_notes)
  VALUES (v_teacher_id, v_learner_id, 'Oxford Phonics 3', 'ZOOM', 'Demo seed — prefers visual learning')
  ON CONFLICT (teacher_id, student_id) DO UPDATE SET
    textbook = EXCLUDED.textbook,
    special_notes = EXCLUDED.special_notes;

  INSERT INTO lesson_feedbacks (lesson_id, teacher_id, student_id, content, homework, progress_pages)
  VALUES (
    v_completed_lesson_id, v_teacher_id, v_learner_id,
    'Great progress on short vowels today.', 'Workbook p.12-13', 'p.10-11'
  )
  ON CONFLICT (lesson_id) DO UPDATE SET content = EXCLUDED.content;
END
$seed$;
