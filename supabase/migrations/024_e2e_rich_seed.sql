-- Rich E2E seed for enrollment → 15h hold → payment confirm → schedule
-- generation → makeup/reschedule → feedback → renewal.
-- Password for every e2e-*@example.org account: DemoPass123!
-- Idempotent. Does not replace demo users from 007/016 (a0000001–a0000004).
-- All availability / preferred slots / lesson starts snap to KST :00/:20/:40.

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

CREATE OR REPLACE FUNCTION public.e2e_id(p_n int)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ('b0000001-0000-4000-8000-' || lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION public.e2e_assert_grid_time(p_time time)
RETURNS time
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF EXTRACT(MINUTE FROM p_time)::int NOT IN (0, 20, 40)
     OR EXTRACT(SECOND FROM p_time) <> 0 THEN
    RAISE EXCEPTION 'e2e seed: time % is not on the 20-minute grid', p_time;
  END IF;
  RETURN p_time;
END;
$$;

CREATE OR REPLACE FUNCTION public.e2e_kst(p_date date, p_time time)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_date + public.e2e_assert_grid_time(p_time)) AT TIME ZONE 'Asia/Seoul';
$$;

CREATE OR REPLACE FUNCTION public.e2e_grid_slots(p_from time, p_to time)
RETURNS SETOF time
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.e2e_assert_grid_time(gs::time)
  FROM generate_series(
    (DATE '2000-01-01' + p_from)::timestamp,
    (DATE '2000-01-01' + p_to)::timestamp,
    interval '20 minutes'
  ) AS gs;
$$;

CREATE OR REPLACE FUNCTION public.e2e_match_dates(
  p_origin date,
  p_days text[],
  p_count int,
  p_step int
)
RETURNS TABLE (n int, dt date, day text)
LANGUAGE sql
STABLE
AS $$
  WITH series AS (
    SELECT (p_origin + (p_step * g) * interval '1 day')::date AS dt
    FROM generate_series(0, 420) AS g
  ),
  labeled AS (
    SELECT
      dt,
      CASE EXTRACT(ISODOW FROM dt)::int
        WHEN 1 THEN 'Mon'
        WHEN 2 THEN 'Tue'
        WHEN 3 THEN 'Wed'
        WHEN 4 THEN 'Thu'
        WHEN 5 THEN 'Fri'
        WHEN 6 THEN 'Sat'
        WHEN 7 THEN 'Sun'
      END AS day
    FROM series
  ),
  filtered AS (
    SELECT dt, day
    FROM labeled
    WHERE day = ANY (p_days)
    ORDER BY
      CASE WHEN p_step >= 0 THEN dt END ASC,
      CASE WHEN p_step < 0 THEN dt END DESC
    LIMIT p_count
  )
  SELECT
    row_number() OVER (ORDER BY dt)::int,
    dt,
    day
  FROM filtered;
$$;

CREATE OR REPLACE FUNCTION public.e2e_upsert_auth_user(
  p_id uuid,
  p_email text,
  p_password text,
  p_meta jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = p_id) THEN
    UPDATE auth.users
    SET
      email = p_email,
      encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      confirmation_token = COALESCE(confirmation_token, ''),
      recovery_token = COALESCE(recovery_token, ''),
      email_change_token_new = COALESCE(email_change_token_new, ''),
      email_change = COALESCE(email_change, ''),
      raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
      raw_user_meta_data = p_meta,
      updated_at = now()
    WHERE id = p_id;
  ELSIF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RAISE EXCEPTION 'e2e seed: email % already used by a different user id', p_email;
  ELSE
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      p_id, 'authenticated', 'authenticated', p_email,
      extensions.crypt(p_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      p_meta,
      now(), now(),
      '', '', '', ''
    );
  END IF;

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  )
  SELECT
    p_id, p_id,
    jsonb_build_object('sub', p_id::text, 'email', p_email),
    'email', p_id::text,
    now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM auth.identities i WHERE i.user_id = p_id AND i.provider = 'email'
  );
END;
$$;

DO $seed$
DECLARE
  v_password text := 'DemoPass123!';
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_admin uuid := 'a0000004-0000-4000-8000-000000000004';
  v_sarah uuid := 'a0000001-0000-4000-8000-000000000001';
  v_james uuid := public.e2e_id(1);
  v_emily uuid := public.e2e_id(2);
  v_carlos uuid := public.e2e_id(3);
  v_fresh uuid := public.e2e_id(101);
  v_hold uuid := public.e2e_id(102);
  v_pay uuid := public.e2e_id(103);
  v_active uuid := public.e2e_id(104);
  v_renew uuid := public.e2e_id(105);
  v_cn uuid := public.e2e_id(106);
  v_guardian uuid := public.e2e_id(107);
  v_l_fresh uuid := public.e2e_id(201);
  v_l_hold uuid := public.e2e_id(202);
  v_l_pay uuid := public.e2e_id(203);
  v_l_active uuid := public.e2e_id(204);
  v_l_renew uuid := public.e2e_id(205);
  v_l_cn uuid := public.e2e_id(206);
  v_l_sib1 uuid := public.e2e_id(207);
  v_l_sib2 uuid := public.e2e_id(208);
  v_l_pending uuid := public.e2e_id(209);
  v_en_hold uuid := public.e2e_id(301);
  v_en_pay uuid := public.e2e_id(302);
  v_en_active uuid := public.e2e_id(303);
  v_en_renew uuid := public.e2e_id(304);
  v_en_cn uuid := public.e2e_id(305);
  v_en_sib1 uuid := public.e2e_id(306);
  v_app_james uuid := public.e2e_id(601);
  v_app_emily uuid := public.e2e_id(602);
  v_app_carlos uuid := public.e2e_id(603);
  v_plan_wd5 uuid;
  v_plan_mwf uuid;
  v_plan_tuth uuid;
  v_plan_weekend uuid;
  v_reschedule_lesson uuid;
  v_missing_feedback_lesson uuid;
  v_makeup_original uuid;
  v_makeup_new uuid;
  v_renew_last date;
BEGIN
  SELECT id INTO v_plan_wd5 FROM pricing_plans WHERE plan_type = 'weekday5_20min' LIMIT 1;
  SELECT id INTO v_plan_mwf FROM pricing_plans WHERE plan_type = 'mwf_20min' LIMIT 1;
  SELECT id INTO v_plan_tuth FROM pricing_plans WHERE plan_type = 'tuth_20min' LIMIT 1;
  SELECT id INTO v_plan_weekend FROM pricing_plans WHERE plan_type = 'weekend_20min' LIMIT 1;

  IF v_plan_wd5 IS NULL OR v_plan_mwf IS NULL OR v_plan_tuth IS NULL OR v_plan_weekend IS NULL THEN
    RAISE EXCEPTION 'e2e seed: pricing_plans 4종 시드가 필요합니다 (migration 001)';
  END IF;

  SELECT d.dt INTO v_renew_last
  FROM generate_series(0, 14) AS g
  CROSS JOIN LATERAL (SELECT (v_today - g) AS dt) d
  WHERE EXTRACT(ISODOW FROM d.dt) BETWEEN 1 AND 5
    AND public.e2e_kst(d.dt, TIME '10:20') <= now()
  ORDER BY d.dt DESC
  LIMIT 1;

  IF v_renew_last IS NULL THEN
    RAISE EXCEPTION 'e2e seed: no past weekday 10:20 for 한지호 last lesson';
  END IF;

  -- -----------------------------------------------------------------------
  -- Wipe previous e2e rows (stable b0000001-* ids)
  -- -----------------------------------------------------------------------
  DELETE FROM chat_messages WHERE room_id IN (
    SELECT id FROM chat_rooms WHERE id BETWEEN public.e2e_id(400) AND public.e2e_id(499)
  );
  DELETE FROM lesson_feedbacks WHERE teacher_id IN (v_james, v_emily);
  DELETE FROM lesson_reschedule_requests WHERE teacher_id IN (v_james, v_emily);
  DELETE FROM lessons WHERE teacher_id IN (v_james, v_emily)
     OR student_id BETWEEN public.e2e_id(200) AND public.e2e_id(299);
  DELETE FROM payments WHERE enrollment_id BETWEEN public.e2e_id(300) AND public.e2e_id(399)
    OR student_id BETWEEN public.e2e_id(200) AND public.e2e_id(299);
  DELETE FROM chat_rooms WHERE id BETWEEN public.e2e_id(400) AND public.e2e_id(499);
  DELETE FROM finance_transactions WHERE enrollment_id BETWEEN public.e2e_id(300) AND public.e2e_id(399)
    OR enrollment_id IN (
      SELECT id FROM enrollments WHERE student_id BETWEEN public.e2e_id(200) AND public.e2e_id(299)
    );
  DELETE FROM enrollments WHERE id BETWEEN public.e2e_id(300) AND public.e2e_id(399)
    OR student_id BETWEEN public.e2e_id(200) AND public.e2e_id(299);
  DELETE FROM teacher_student_context WHERE teacher_id IN (v_james, v_emily);
  DELETE FROM monthly_growth_reports WHERE teacher_id IN (v_james, v_emily);
  DELETE FROM student_registration_reviews
    WHERE id BETWEEN public.e2e_id(200) AND public.e2e_id(299);
  DELETE FROM teachers_weekly_availability WHERE teacher_id IN (v_james, v_emily, v_carlos);
  DELETE FROM notifications WHERE user_id BETWEEN public.e2e_id(1) AND public.e2e_id(199);
  DELETE FROM admin_review_logs WHERE target_id LIKE 'b0000001-%';
  DELETE FROM students WHERE id BETWEEN public.e2e_id(200) AND public.e2e_id(299);
  DELETE FROM teachers WHERE id IN (v_james, v_emily, v_carlos);
  DELETE FROM teacher_applications WHERE id IN (v_app_james, v_app_emily, v_app_carlos);
  DELETE FROM profiles WHERE id IN (
    v_james, v_emily, v_carlos,
    v_fresh, v_hold, v_pay, v_active, v_renew, v_cn, v_guardian
  );
  DELETE FROM auth.identities WHERE user_id IN (
    v_james, v_emily, v_carlos,
    v_fresh, v_hold, v_pay, v_active, v_renew, v_cn, v_guardian
  );
  DELETE FROM auth.users WHERE id IN (
    v_james, v_emily, v_carlos,
    v_fresh, v_hold, v_pay, v_active, v_renew, v_cn, v_guardian
  );

  -- -----------------------------------------------------------------------
  -- Auth users (teachers + students)
  -- -----------------------------------------------------------------------
  PERFORM public.e2e_upsert_auth_user(v_james, 'e2e-teacher-james@example.org', v_password,
    '{"role":"teacher","full_name":"James Rivera"}'::jsonb);
  PERFORM public.e2e_upsert_auth_user(v_emily, 'e2e-teacher-emily@example.org', v_password,
    '{"role":"teacher","full_name":"Emily Chen"}'::jsonb);
  PERFORM public.e2e_upsert_auth_user(v_carlos, 'e2e-teacher-carlos@example.org', v_password,
    '{"role":"teacher","full_name":"Carlos Mendoza"}'::jsonb);
  PERFORM public.e2e_upsert_auth_user(v_fresh, 'e2e-student-fresh@example.org', v_password,
    '{"role":"student","full_name":"박서연","country":"KR","account_type":"self"}'::jsonb);
  PERFORM public.e2e_upsert_auth_user(v_hold, 'e2e-student-hold@example.org', v_password,
    '{"role":"student","full_name":"이도윤","country":"KR","account_type":"guardian"}'::jsonb);
  PERFORM public.e2e_upsert_auth_user(v_pay, 'e2e-student-pay@example.org', v_password,
    '{"role":"student","full_name":"최하준","country":"KR","account_type":"self"}'::jsonb);
  PERFORM public.e2e_upsert_auth_user(v_active, 'e2e-student-active@example.org', v_password,
    '{"role":"student","full_name":"정예린","country":"KR","account_type":"self"}'::jsonb);
  PERFORM public.e2e_upsert_auth_user(v_renew, 'e2e-student-renew@example.org', v_password,
    '{"role":"student","full_name":"한지호","country":"KR","account_type":"self"}'::jsonb);
  PERFORM public.e2e_upsert_auth_user(v_cn, 'e2e-student-cn@example.org', v_password,
    '{"role":"student","full_name":"王小明","country":"CN","account_type":"guardian"}'::jsonb);
  PERFORM public.e2e_upsert_auth_user(v_guardian, 'e2e-student-guardian@example.org', v_password,
    '{"role":"student","full_name":"김수진","country":"KR","account_type":"guardian"}'::jsonb);

  INSERT INTO profiles (id, role, full_name, phone, account_type, locale) VALUES
    (v_james, 'teacher', 'James Rivera', '+63-917-100-2001', NULL, 'ko'),
    (v_emily, 'teacher', 'Emily Chen', '+63-917-100-2002', NULL, 'ko'),
    (v_carlos, 'teacher', 'Carlos Mendoza', '+63-917-100-2003', NULL, 'ko'),
    (v_fresh, 'student', '박서연', '010-2001-0001', 'self', 'ko'),
    (v_hold, 'student', '이도윤', '010-2001-0002', 'guardian', 'ko'),
    (v_pay, 'student', '최하준', '010-2001-0003', 'self', 'ko'),
    (v_active, 'student', '정예린', '010-2001-0004', 'self', 'ko'),
    (v_renew, 'student', '한지호', '010-2001-0005', 'self', 'ko'),
    (v_cn, 'student', '王小明', '138-0000-2006', 'guardian', 'zh-CN'),
    (v_guardian, 'student', '김수진', '010-2001-0007', 'guardian', 'ko')
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    account_type = EXCLUDED.account_type,
    locale = EXCLUDED.locale;

  INSERT INTO teacher_applications (
    id, full_name, date_of_birth, phone, bank_account, facebook_messenger_id,
    address, email, status, submitted_at, reviewed_at, reviewed_by
  ) VALUES
    (v_app_james, 'James Rivera', '1992-04-11', '+63-917-100-2001', 'BDO 001-2345-678',
     'james.rivera', 'Manila', 'e2e-teacher-james@example.org', 'approved',
     now() - interval '40 days', now() - interval '38 days', v_admin),
    (v_app_emily, 'Emily Chen', '1994-09-02', '+63-917-100-2002', 'BPI 009-8765-432',
     'emily.chen', 'Cebu', 'e2e-teacher-emily@example.org', 'approved',
     now() - interval '30 days', now() - interval '28 days', v_admin),
    (v_app_carlos, 'Carlos Mendoza', '1990-12-18', '+63-917-100-2003', '',
     'carlos.mendoza', 'Quezon City', 'e2e-teacher-carlos@example.org', 'pending',
     now() - interval '2 days', NULL, NULL);

  INSERT INTO teachers (
    id, display_name, bio, specialties, experience_years, status,
    hourly_rate_php, timezone, application_id
  ) VALUES
    (v_james, 'James Rivera',
     'E2E teacher — weekday afternoons. Conversation + exam prep.',
     ARRAY['Conversation', 'Exam Prep', 'Encouraging'], 6, 'active', 160, 'Asia/Manila', v_app_james),
    (v_emily, 'Emily Chen',
     'E2E teacher — weekends and weekday evenings. Kids + phonics.',
     ARRAY['Phonics', 'Kids', 'Friendly'], 5, 'active', 155, 'Asia/Manila', v_app_emily),
    (v_carlos, 'Carlos Mendoza',
     'E2E pending teacher — awaiting admin approval.',
     ARRAY['Business English'], 4, 'pending', 140, 'Asia/Manila', v_app_carlos)
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    status = EXCLUDED.status,
    application_id = EXCLUDED.application_id;

  UPDATE teacher_applications SET teacher_id = v_james WHERE id = v_app_james;
  UPDATE teacher_applications SET teacher_id = v_emily WHERE id = v_app_emily;
  UPDATE teacher_applications SET teacher_id = v_carlos WHERE id = v_app_carlos;

  INSERT INTO students (
    id, account_holder_id, full_name, english_name, date_of_birth, country,
    english_level, purposes, trial_used, is_active, reschedule_count_month, reschedule_month_key
  ) VALUES
    (v_l_fresh, v_fresh, '박서연', 'Seoyeon Park', '2008-05-21', 'KR',
     'A2', ARRAY['daily_conversation'], false, true, 0, to_char(v_today, 'YYYY-MM')),
    (v_l_hold, v_hold, '이도윤', 'Doyun Lee', '2014-11-03', 'KR',
     'A1', ARRAY['phonics', 'daily_conversation'], false, true, 0, to_char(v_today, 'YYYY-MM')),
    (v_l_pay, v_pay, '최하준', 'Hajun Choi', '2006-02-14', 'KR',
     'B1', ARRAY['exam_prep'], false, true, 0, to_char(v_today, 'YYYY-MM')),
    (v_l_active, v_active, '정예린', 'Yerin Jung', '2012-07-08', 'KR',
     'A2', ARRAY['school_english', 'phonics'], true, true, 1, to_char(v_today, 'YYYY-MM')),
    (v_l_renew, v_renew, '한지호', 'Jiho Han', '2009-01-19', 'KR',
     'B1', ARRAY['daily_conversation', 'exam_prep'], true, true, 2, to_char(v_today, 'YYYY-MM')),
    (v_l_cn, v_cn, '王小明', 'Xiaoming Wang', '2013-08-26', 'CN',
     'A1', ARRAY['phonics'], true, true, 0, to_char(v_today, 'YYYY-MM')),
    (v_l_sib1, v_guardian, '김하은', 'Haeun Kim', '2016-03-02', 'KR',
     'A1', ARRAY['phonics'], true, true, 0, to_char(v_today, 'YYYY-MM')),
    (v_l_sib2, v_guardian, '김하준', 'Hajun Kim', '2018-09-15', 'KR',
     'Pre-A1', ARRAY['phonics'], false, true, 0, to_char(v_today, 'YYYY-MM')),
    (v_l_pending, v_guardian, '김하린', 'Harin Kim', '2020-04-30', 'KR',
     'Pre-A1', ARRAY['daily_conversation'], false, true, 0, to_char(v_today, 'YYYY-MM'));

  UPDATE profiles SET active_student_id = v_l_fresh WHERE id = v_fresh;
  UPDATE profiles SET active_student_id = v_l_hold WHERE id = v_hold;
  UPDATE profiles SET active_student_id = v_l_pay WHERE id = v_pay;
  UPDATE profiles SET active_student_id = v_l_active WHERE id = v_active;
  UPDATE profiles SET active_student_id = v_l_renew WHERE id = v_renew;
  UPDATE profiles SET active_student_id = v_l_cn WHERE id = v_cn;
  UPDATE profiles SET active_student_id = v_l_sib1 WHERE id = v_guardian;

  INSERT INTO student_registration_reviews (
    id, account_holder_name, account_email, account_phone, account_type, country,
    learner_full_name, learner_english_name, learner_date_of_birth,
    english_level, purposes, status, submitted_at, reviewed_at, reviewed_by
  ) VALUES
    (v_l_fresh, '박서연', 'e2e-student-fresh@example.org', '010-2001-0001', 'self', 'KR',
     '박서연', 'Seoyeon Park', '2008-05-21', 'A2', ARRAY['daily_conversation'],
     'confirmed', now() - interval '10 days', now() - interval '9 days', v_admin),
    (v_l_hold, '이도윤', 'e2e-student-hold@example.org', '010-2001-0002', 'guardian', 'KR',
     '이도윤', 'Doyun Lee', '2014-11-03', 'A1', ARRAY['phonics', 'daily_conversation'],
     'confirmed', now() - interval '8 days', now() - interval '7 days', v_admin),
    (v_l_pay, '최하준', 'e2e-student-pay@example.org', '010-2001-0003', 'self', 'KR',
     '최하준', 'Hajun Choi', '2006-02-14', 'B1', ARRAY['exam_prep'],
     'confirmed', now() - interval '6 days', now() - interval '5 days', v_admin),
    (v_l_active, '정예린', 'e2e-student-active@example.org', '010-2001-0004', 'self', 'KR',
     '정예린', 'Yerin Jung', '2012-07-08', 'A2', ARRAY['school_english', 'phonics'],
     'confirmed', now() - interval '45 days', now() - interval '44 days', v_admin),
    (v_l_renew, '한지호', 'e2e-student-renew@example.org', '010-2001-0005', 'self', 'KR',
     '한지호', 'Jiho Han', '2009-01-19', 'B1', ARRAY['daily_conversation', 'exam_prep'],
     'confirmed', now() - interval '90 days', now() - interval '89 days', v_admin),
    (v_l_cn, '王小明', 'e2e-student-cn@example.org', '138-0000-2006', 'guardian', 'CN',
     '王小明', 'Xiaoming Wang', '2013-08-26', 'A1', ARRAY['phonics'],
     'confirmed', now() - interval '20 days', now() - interval '19 days', v_admin),
    (v_l_sib1, '김수진', 'e2e-student-guardian@example.org', '010-2001-0007', 'guardian', 'KR',
     '김하은', 'Haeun Kim', '2016-03-02', 'A1', ARRAY['phonics'],
     'confirmed', now() - interval '25 days', now() - interval '24 days', v_admin),
    (v_l_sib2, '김수진', 'e2e-student-guardian@example.org', '010-2001-0007', 'guardian', 'KR',
     '김하준', 'Hajun Kim', '2018-09-15', 'Pre-A1', ARRAY['phonics'],
     'confirmed', now() - interval '25 days', now() - interval '24 days', v_admin),
    (v_l_pending, '김수진', 'e2e-student-guardian@example.org', '010-2001-0007', 'guardian', 'KR',
     '김하린', 'Harin Kim', '2020-04-30', 'Pre-A1', ARRAY['daily_conversation'],
     'pending', now() - interval '1 day', NULL, NULL);

  -- -----------------------------------------------------------------------
  -- Availability: 20-min grid. Held slots are deleted after insert.
  -- Sarah (007): expand Mon–Fri 08:00–11:40 so slot picker has :20/:40 options.
  -- -----------------------------------------------------------------------
  INSERT INTO teachers_weekly_availability (teacher_id, day, start_time)
  SELECT v_sarah, d.day, s.slot
  FROM (VALUES ('Mon'), ('Tue'), ('Wed'), ('Thu'), ('Fri')) AS d(day)
  CROSS JOIN public.e2e_grid_slots(TIME '08:00', TIME '11:40') AS s(slot)
  ON CONFLICT DO NOTHING;

  INSERT INTO teachers_weekly_availability (teacher_id, day, start_time)
  SELECT v_james, d.day, s.slot
  FROM (VALUES ('Mon'), ('Tue'), ('Wed'), ('Thu'), ('Fri')) AS d(day)
  CROSS JOIN public.e2e_grid_slots(TIME '10:00', TIME '11:40') AS s(slot);

  INSERT INTO teachers_weekly_availability (teacher_id, day, start_time)
  SELECT v_james, d.day, s.slot
  FROM (VALUES ('Mon'), ('Tue'), ('Wed'), ('Thu'), ('Fri')) AS d(day)
  CROSS JOIN public.e2e_grid_slots(TIME '13:00', TIME '17:40') AS s(slot);

  INSERT INTO teachers_weekly_availability (teacher_id, day, start_time)
  SELECT v_emily, d.day, s.slot
  FROM (VALUES ('Sat'), ('Sun')) AS d(day)
  CROSS JOIN public.e2e_grid_slots(TIME '09:00', TIME '11:40') AS s(slot);

  INSERT INTO teachers_weekly_availability (teacher_id, day, start_time)
  SELECT v_emily, d.day, s.slot
  FROM (VALUES ('Mon'), ('Tue'), ('Wed'), ('Thu'), ('Fri')) AS d(day)
  CROSS JOIN public.e2e_grid_slots(TIME '19:00', TIME '20:40') AS s(slot);

  -- Working hours stay listed. Occupied times are enrollments/lessons, not deletions.

  -- -----------------------------------------------------------------------
  -- Enrollments covering each E2E stage
  -- -----------------------------------------------------------------------
  -- 1) 15-hour hold, payment not yet reported (입금 전)
  INSERT INTO enrollments (
    id, student_id, teacher_id, plan_id, status, payment_status, currency,
    total_amount, sessions_total, sessions_completed, sessions_remaining,
    curriculum, preferred_slot_time, preferred_slot_day,
    started_at, ended_at, confirmed_at, payment_deadline_at
  )
  SELECT
    v_en_hold, v_l_hold, v_james, v_plan_wd5,
    'pending_payment', 'pending', 'KRW', pp.price_krw, pp.sessions_count, 0, pp.sessions_count,
    'Phonics starters', '13:00', 'Mon',
    v_today::timestamptz, (v_today + 28)::timestamptz,
    now() - interval '1 hour',
    now() + interval '14 hours'
  FROM pricing_plans pp WHERE pp.id = v_plan_wd5;

  -- 2) Hold + 입금 신고 완료 → 관리자 입금확인 / 스케줄 일괄 생성
  INSERT INTO enrollments (
    id, student_id, teacher_id, plan_id, status, payment_status, currency,
    total_amount, sessions_total, sessions_completed, sessions_remaining,
    curriculum, preferred_slot_time, preferred_slot_day,
    started_at, ended_at, confirmed_at, payment_deadline_at
  )
  SELECT
    v_en_pay, v_l_pay, v_james, v_plan_tuth,
    'pending_payment', 'reported', 'KRW', pp.price_krw, pp.sessions_count, 0, pp.sessions_count,
    'Exam prep Tue/Thu', '15:00', 'Tue',
    v_today::timestamptz, (v_today + 35)::timestamptz,
    now() - interval '3 hours',
    now() + interval '12 hours'
  FROM pricing_plans pp WHERE pp.id = v_plan_tuth;

  INSERT INTO payments (id, enrollment_id, student_id, amount, currency, status, depositor_name, reported_at)
  SELECT public.e2e_id(501), v_en_pay, v_l_pay, pp.price_krw, 'KRW', 'reported', '최하준', now() - interval '40 minutes'
  FROM pricing_plans pp WHERE pp.id = v_plan_tuth;

  -- 3) Active MWF 14:00 with generated schedule (보강·피드백)
  INSERT INTO enrollments (
    id, student_id, teacher_id, plan_id, status, payment_status, currency,
    total_amount, sessions_total, sessions_completed, sessions_remaining,
    curriculum, preferred_slot_time, preferred_slot_day,
    started_at, ended_at, confirmed_at
  )
  SELECT
    v_en_active, v_l_active, v_james, v_plan_mwf,
    'active', 'confirmed', 'KRW', pp.price_krw, pp.sessions_count, 4, 8,
    'Oxford Discover 2', '14:00', 'Mon',
    (v_today - 21)::timestamptz, (v_today + 28)::timestamptz,
    now() - interval '21 days'
  FROM pricing_plans pp WHERE pp.id = v_plan_mwf;

  INSERT INTO payments (id, enrollment_id, student_id, amount, currency, status, depositor_name, reported_at, confirmed_at, confirmed_by)
  SELECT public.e2e_id(502), v_en_active, v_l_active, pp.price_krw, 'KRW', 'confirmed', '정예린',
         now() - interval '21 days', now() - interval '21 days', v_admin
  FROM pricing_plans pp WHERE pp.id = v_plan_mwf;

  -- 4) Completed weekday5 @ 10:00 → 재수강
  INSERT INTO enrollments (
    id, student_id, teacher_id, plan_id, status, payment_status, currency,
    total_amount, sessions_total, sessions_completed, sessions_remaining,
    curriculum, preferred_slot_time, preferred_slot_day,
    started_at, ended_at, confirmed_at
  )
  SELECT
    v_en_renew, v_l_renew, v_james, v_plan_wd5,
    'completed', 'confirmed', 'KRW', pp.price_krw, pp.sessions_count, pp.sessions_count, 0,
    'General English (completed)', '10:00', 'Mon',
    (v_today - 56)::timestamptz, (v_renew_last)::timestamptz,
    now() - interval '56 days'
  FROM pricing_plans pp WHERE pp.id = v_plan_wd5;

  INSERT INTO payments (id, enrollment_id, student_id, amount, currency, status, depositor_name, reported_at, confirmed_at, confirmed_by)
  SELECT public.e2e_id(503), v_en_renew, v_l_renew, pp.price_krw, 'KRW', 'confirmed', '한지호',
         now() - interval '56 days', now() - interval '56 days', v_admin
  FROM pricing_plans pp WHERE pp.id = v_plan_wd5;

  -- 5) CN weekend active @ 09:00
  INSERT INTO enrollments (
    id, student_id, teacher_id, plan_id, status, payment_status, currency,
    total_amount, sessions_total, sessions_completed, sessions_remaining,
    curriculum, preferred_slot_time, preferred_slot_day,
    started_at, ended_at, confirmed_at
  )
  SELECT
    v_en_cn, v_l_cn, v_emily, v_plan_weekend,
    'active', 'confirmed', 'CNY', pp.price_cny, pp.sessions_count, 3, 5,
    'Phonics World', '09:00', 'Sat',
    (v_today - 21)::timestamptz, (v_today + 21)::timestamptz,
    now() - interval '21 days'
  FROM pricing_plans pp WHERE pp.id = v_plan_weekend;

  INSERT INTO payments (id, enrollment_id, student_id, amount, currency, status, depositor_name, reported_at, confirmed_at, confirmed_by)
  SELECT public.e2e_id(504), v_en_cn, v_l_cn, pp.price_cny, 'CNY', 'confirmed', '王小明',
         now() - interval '21 days', now() - interval '21 days', v_admin
  FROM pricing_plans pp WHERE pp.id = v_plan_weekend;

  -- 6) Guardian sibling 1 — Emily weekday evening 19:00 MWF (형제 수강 중)
  INSERT INTO enrollments (
    id, student_id, teacher_id, plan_id, status, payment_status, currency,
    total_amount, sessions_total, sessions_completed, sessions_remaining,
    curriculum, preferred_slot_time, preferred_slot_day,
    started_at, ended_at, confirmed_at
  )
  SELECT
    v_en_sib1, v_l_sib1, v_emily, v_plan_mwf,
    'active', 'confirmed', 'KRW', pp.price_krw, pp.sessions_count, 2, 10,
    'Kids phonics', '19:00', 'Mon',
    (v_today - 14)::timestamptz, (v_today + 28)::timestamptz,
    now() - interval '14 days'
  FROM pricing_plans pp WHERE pp.id = v_plan_mwf;

  INSERT INTO payments (id, enrollment_id, student_id, amount, currency, status, depositor_name, reported_at, confirmed_at, confirmed_by)
  SELECT public.e2e_id(505), v_en_sib1, v_l_sib1, pp.price_krw, 'KRW', 'confirmed', '김수진',
         now() - interval '14 days', now() - interval '14 days', v_admin
  FROM pricing_plans pp WHERE pp.id = v_plan_mwf;

  -- -----------------------------------------------------------------------
  -- Lessons (KST 20-min grid)
  -- -----------------------------------------------------------------------
  -- Active MWF 14:00: 4 past completed + 8 future (1 reschedule_pending)
  INSERT INTO lessons (
    id, enrollment_id, teacher_id, student_id, scheduled_at, duration_minutes,
    status, is_trial, completed_at, operation_note
  )
  SELECT
    public.e2e_id(1000 + d.n),
    v_en_active, v_james, v_l_active,
    public.e2e_kst(d.dt, TIME '14:00'),
    20,
    'completed',
    false,
    public.e2e_kst(d.dt, TIME '14:20'),
    'E2E seed — completed MWF 14:00'
  FROM public.e2e_match_dates(v_today - 1, ARRAY['Mon', 'Wed', 'Fri'], 4, -1) d;

  INSERT INTO lessons (
    id, enrollment_id, teacher_id, student_id, scheduled_at, duration_minutes,
    status, is_trial, operation_note
  )
  SELECT
    public.e2e_id(1010 + d.n),
    v_en_active, v_james, v_l_active,
    public.e2e_kst(d.dt, TIME '14:00'),
    20,
    CASE WHEN d.n = 1 THEN 'reschedule_pending' ELSE 'scheduled' END,
    false,
    CASE WHEN d.n = 1 THEN 'E2E seed — pending makeup/reschedule'
         ELSE 'E2E seed — scheduled MWF 14:00' END
  FROM public.e2e_match_dates(v_today, ARRAY['Mon', 'Wed', 'Fri'], 8, 1) d;

  SELECT public.e2e_id(1000 + n) INTO v_missing_feedback_lesson
  FROM public.e2e_match_dates(v_today - 1, ARRAY['Mon', 'Wed', 'Fri'], 4, -1)
  WHERE n = 1;

  SELECT public.e2e_id(1010 + n) INTO v_reschedule_lesson
  FROM public.e2e_match_dates(v_today, ARRAY['Mon', 'Wed', 'Fri'], 8, 1)
  WHERE n = 1;

  SELECT public.e2e_id(1000 + n) INTO v_makeup_original
  FROM public.e2e_match_dates(v_today - 1, ARRAY['Mon', 'Wed', 'Fri'], 4, -1)
  WHERE n = 4;

  -- Teacher no-show original + makeup at 14:20 (still on grid, next block)
  UPDATE lessons
  SET status = 'cancelled',
      teacher_no_show = true,
      unpaid_for_teacher = true,
      cancel_reason = 'teacher_no_show',
      completed_at = NULL,
      operation_note = 'E2E seed — teacher no-show (makeup linked)'
  WHERE id = v_makeup_original;

  v_makeup_new := public.e2e_id(1090);
  INSERT INTO lessons (
    id, enrollment_id, teacher_id, student_id, scheduled_at, duration_minutes,
    status, is_trial, related_lesson_id, original_teacher_id, operation_note
  )
  SELECT
    v_makeup_new, v_en_active, v_james, v_l_active,
    public.e2e_kst(d.dt, TIME '14:20'),
    20, 'scheduled', false, v_makeup_original, v_james,
    'E2E seed — makeup for teacher no-show'
  FROM public.e2e_match_dates(v_today + 14, ARRAY['Mon', 'Wed', 'Fri'], 1, 1) d;

  UPDATE lessons SET related_lesson_id = v_makeup_new WHERE id = v_makeup_original;

  -- Recalculate active enrollment counts after converting 1 completed → cancelled + makeup
  UPDATE enrollments
  SET sessions_completed = 3,
      sessions_remaining = 9,
      session_adjustments = jsonb_build_array(
        jsonb_build_object(
          'delta', 1,
          'reason', 'teacher no-show makeup',
          'at', now()
        )
      )
  WHERE id = v_en_active;

  INSERT INTO lesson_feedbacks (lesson_id, teacher_id, student_id, content, homework, progress_pages, created_at)
  SELECT
    public.e2e_id(1000 + d.n), v_james, v_l_active,
    'Good work on today''s target language. Keep using full sentences.',
    'Workbook p.' || (10 + d.n)::text,
    'p.' || (8 + d.n)::text || '-' || (9 + d.n)::text,
    public.e2e_kst(d.dt, TIME '14:40')
  FROM public.e2e_match_dates(v_today - 1, ARRAY['Mon', 'Wed', 'Fri'], 4, -1) d
  WHERE d.n IN (2, 3);
  -- n=1 left without feedback for teacher 피드백 E2E; n=4 cancelled no-show

  INSERT INTO lesson_reschedule_requests (
    id, lesson_id, teacher_id, student_id, initiator,
    original_scheduled_at, proposed_scheduled_at, status, reason, request_month
  )
  SELECT
    public.e2e_id(701),
    v_reschedule_lesson,
    v_james,
    v_l_active,
    'student',
    l.scheduled_at,
    public.e2e_kst((l.scheduled_at AT TIME ZONE 'Asia/Seoul')::date, TIME '14:20'),
    'pending_teacher_approval',
    '학교 행사로 20분 뒤 보강 요청',
    to_char(v_today, 'YYYY-MM')
  FROM lessons l
  WHERE l.id = v_reschedule_lesson;

  -- Completed weekday5 history (20 lessons) for 재수강 student
  INSERT INTO lessons (
    id, enrollment_id, teacher_id, student_id, scheduled_at, duration_minutes,
    status, is_trial, completed_at, operation_note
  )
  SELECT
    public.e2e_id(1100 + d.n),
    v_en_renew, v_james, v_l_renew,
    public.e2e_kst(d.dt, TIME '10:00'),
    20, 'completed', false,
    public.e2e_kst(d.dt, TIME '10:20'),
    CASE
      WHEN d.dt = v_renew_last THEN 'E2E seed — last weekday 10:00 lesson (renewal hold from 10:20)'
      ELSE 'E2E seed — completed weekday5 10:00'
    END
  FROM public.e2e_match_dates(v_renew_last, ARRAY['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], 20, -1) d;

  INSERT INTO lesson_feedbacks (lesson_id, teacher_id, student_id, content, homework, created_at)
  SELECT
    public.e2e_id(1100 + d.n), v_james, v_l_renew,
    'Completed-term recap. Ready for the next course.',
    'Review unit ' || d.n::text,
    public.e2e_kst(d.dt, TIME '10:40')
  FROM public.e2e_match_dates(v_renew_last, ARRAY['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], 20, -1) d
  WHERE d.n > 16;

  -- CN weekend 09:00: 3 past + 5 future
  INSERT INTO lessons (
    id, enrollment_id, teacher_id, student_id, scheduled_at, duration_minutes,
    status, is_trial, completed_at, operation_note
  )
  SELECT
    public.e2e_id(1200 + d.n),
    v_en_cn, v_emily, v_l_cn,
    public.e2e_kst(d.dt, TIME '09:00'),
    20, 'completed', false,
    public.e2e_kst(d.dt, TIME '09:20'),
    'E2E seed — completed weekend 09:00'
  FROM public.e2e_match_dates(v_today - 1, ARRAY['Sat', 'Sun'], 3, -1) d;

  INSERT INTO lessons (
    id, enrollment_id, teacher_id, student_id, scheduled_at, duration_minutes,
    status, is_trial, operation_note
  )
  SELECT
    public.e2e_id(1210 + d.n),
    v_en_cn, v_emily, v_l_cn,
    public.e2e_kst(d.dt, TIME '09:00'),
    20, 'scheduled', false,
    'E2E seed — scheduled weekend 09:00'
  FROM public.e2e_match_dates(v_today, ARRAY['Sat', 'Sun'], 5, 1) d;

  INSERT INTO lesson_feedbacks (lesson_id, teacher_id, student_id, content, homework, created_at)
  SELECT
    public.e2e_id(1200 + d.n), v_emily, v_l_cn,
    'Nice effort on short vowels. 发音很棒！',
    'Phonics workbook p.' || d.n::text,
    public.e2e_kst(d.dt, TIME '09:40')
  FROM public.e2e_match_dates(v_today - 1, ARRAY['Sat', 'Sun'], 3, -1) d;

  -- Guardian sibling MWF 19:00: 2 past + 10 future
  INSERT INTO lessons (
    id, enrollment_id, teacher_id, student_id, scheduled_at, duration_minutes,
    status, is_trial, completed_at, operation_note
  )
  SELECT
    public.e2e_id(1300 + d.n),
    v_en_sib1, v_emily, v_l_sib1,
    public.e2e_kst(d.dt, TIME '19:00'),
    20, 'completed', false,
    public.e2e_kst(d.dt, TIME '19:20'),
    'E2E seed — completed MWF 19:00'
  FROM public.e2e_match_dates(v_today - 1, ARRAY['Mon', 'Wed', 'Fri'], 2, -1) d;

  INSERT INTO lessons (
    id, enrollment_id, teacher_id, student_id, scheduled_at, duration_minutes,
    status, is_trial, operation_note
  )
  SELECT
    public.e2e_id(1310 + d.n),
    v_en_sib1, v_emily, v_l_sib1,
    public.e2e_kst(d.dt, TIME '19:00'),
    20, 'scheduled', false,
    'E2E seed — scheduled MWF 19:00'
  FROM public.e2e_match_dates(v_today, ARRAY['Mon', 'Wed', 'Fri'], 10, 1) d;

  -- -----------------------------------------------------------------------
  -- Context, chat, growth report, finance, notifications, admin logs
  -- -----------------------------------------------------------------------
  INSERT INTO teacher_student_context (teacher_id, student_id, textbook, video_platform, special_notes)
  VALUES
    (v_james, v_l_active, 'Oxford Discover 2', 'ZOOM', 'Visual learner. Keep lessons energetic.'),
    (v_james, v_l_renew, 'General English 3', 'ZOOM', 'Completed term — ready to renew.'),
    (v_james, v_l_hold, 'Phonics starters', 'ZOOM', '15h hold — awaiting payment.'),
    (v_james, v_l_pay, 'Exam prep Tue/Thu', 'ZOOM', 'Payment reported — awaiting admin confirm.'),
    (v_emily, v_l_cn, 'Phonics World', 'VOOV', 'CN student. Use VOOV.'),
    (v_emily, v_l_sib1, 'Kids phonics', 'ZOOM', 'Younger sibling. Keep sessions playful.');

  INSERT INTO chat_rooms (id, enrollment_id, student_id, teacher_id, last_message_at) VALUES
    (public.e2e_id(401), v_en_active, v_l_active, v_james, now() - interval '2 hours'),
    (public.e2e_id(402), v_en_renew, v_l_renew, v_james, now() - interval '3 days'),
    (public.e2e_id(403), v_en_cn, v_l_cn, v_emily, now() - interval '1 day'),
    (public.e2e_id(404), v_en_sib1, v_l_sib1, v_emily, now() - interval '5 hours');

  INSERT INTO chat_messages (room_id, sender_id, sender_role, body, created_at) VALUES
    (public.e2e_id(401), v_james, 'teacher', 'See you at 14:00. Please preview unit 5.', now() - interval '1 day'),
    (public.e2e_id(401), v_active, 'student', 'Thank you! I submitted a makeup request for the next class.', now() - interval '2 hours'),
    (public.e2e_id(403), v_emily, 'teacher', '周末 09:00 见。请带 Phonics World。', now() - interval '1 day'),
    (public.e2e_id(404), v_guardian, 'student', '하은이 오늘 수업 잘 부탁드려요.', now() - interval '5 hours');

  INSERT INTO monthly_growth_reports (
    student_id, teacher_id, month, title, lessons_covered, progress_made,
    areas_to_work_on, next_month_goals, overall_comment, published_at
  ) VALUES (
    v_l_active, v_james, to_char(v_today - 15, 'YYYY-MM'),
    'Monthly growth — Yerin',
    'Oxford Discover 2 units 3–4',
    'More confident speaking in full sentences.',
    'Irregular past tense',
    'Unit 5 storytelling',
    'Great attitude in class. Ready for slightly faster pacing.',
    now() - interval '10 days'
  );

  INSERT INTO finance_transactions (
    transaction_date, type, category, description, currency, amount, amount_krw,
    supply_amount, vat_amount, tax_treatment, source, student_name, enrollment_id
  )
  SELECT
    (v_today - 21), 'income', 'student_payment_kr',
    '정예린 — 월·수·금 20분', 'KRW', pp.price_krw, pp.price_krw,
    round(pp.price_krw / 1.1), pp.price_krw - round(pp.price_krw / 1.1),
    'taxable', 'auto', '정예린', v_en_active
  FROM pricing_plans pp WHERE pp.id = v_plan_mwf;

  INSERT INTO finance_transactions (
    transaction_date, type, category, description, currency, amount, amount_krw,
    supply_amount, vat_amount, tax_treatment, source, student_name, enrollment_id
  )
  SELECT
    (v_today - 56), 'income', 'student_payment_kr',
    '한지호 — 주5회(월~금) 20분', 'KRW', pp.price_krw, pp.price_krw,
    round(pp.price_krw / 1.1), pp.price_krw - round(pp.price_krw / 1.1),
    'taxable', 'auto', '한지호', v_en_renew
  FROM pricing_plans pp WHERE pp.id = v_plan_wd5;

  INSERT INTO finance_transactions (
    transaction_date, type, category, description, currency, amount, amount_krw,
    supply_amount, vat_amount, tax_treatment, source, student_name, enrollment_id
  )
  SELECT
    (v_today - 21), 'income', 'student_payment_cn',
    '王小明 — 주말(토·일) 20분', 'CNY', pp.price_cny, pp.price_cny * 190,
    pp.price_cny * 190, 0,
    'non_taxable', 'auto', '王小明', v_en_cn
  FROM pricing_plans pp WHERE pp.id = v_plan_weekend;

  INSERT INTO notifications (user_id, type, title, body, payload) VALUES
    (v_hold, 'payment_request', '수강권 홀드 안내',
     '선택하신 13:00 슬롯이 15시간 동안 홀드됩니다. 입금 후 신고해 주세요.',
     jsonb_build_object('enrollmentId', v_en_hold)),
    (v_pay, 'payment_confirmed', '입금 신고 접수',
     '관리자 입금 확인 후 정규 스케줄이 생성됩니다.',
     jsonb_build_object('enrollmentId', v_en_pay)),
    (v_james, 'reschedule_request', '보강 요청',
     '정예린 학생이 보강을 요청했습니다.',
     jsonb_build_object('lessonId', v_reschedule_lesson)),
    (v_renew, 'lesson_reminder', '재수강 안내',
     '수강이 완료되었습니다. 같은 선생님·시간으로 재수강할 수 있습니다.',
     jsonb_build_object('enrollmentId', v_en_renew));

  INSERT INTO admin_review_logs (category, action, target_id, target_label, detail, admin_name, at) VALUES
    ('teacher_signup', 'approved', v_app_james::text, 'James Rivera', 'E2E seed', 'Demo Admin', now() - interval '38 days'),
    ('teacher_signup', 'approved', v_app_emily::text, 'Emily Chen', 'E2E seed', 'Demo Admin', now() - interval '28 days'),
    ('student_signup', 'confirmed', v_l_active::text, '정예린', 'E2E seed', 'Demo Admin', now() - interval '44 days'),
    ('payment_activation', 'confirmed', v_en_active::text, '정예린 / James Rivera', 'E2E seed MWF', 'Demo Admin', now() - interval '21 days'),
    ('payment_activation', 'confirmed', v_en_renew::text, '한지호 / James Rivera', 'E2E seed weekday5', 'Demo Admin', now() - interval '56 days');

  INSERT INTO admin_lesson_operation_logs (
    teacher_id, lesson_id, student_name, scheduled_at, week_start_key,
    action, summary, note, admin_name, undoable
  )
  SELECT
    v_james, v_makeup_original, 'Yerin Jung', l.scheduled_at,
    date_trunc('week', l.scheduled_at AT TIME ZONE 'Asia/Seoul')::date,
    'teacher_no_show',
    'Teacher no-show → makeup at 14:20',
    'E2E seed',
    'Demo Admin',
    true
  FROM lessons l WHERE l.id = v_makeup_original;
END
$seed$;

-- ---------------------------------------------------------------------------
-- Integrity: every seeded slot / lesson / preferred time is on the 20-min grid
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM teachers_weekly_availability
  WHERE (
          teacher_id IN (public.e2e_id(1), public.e2e_id(2), public.e2e_id(3))
          OR teacher_id = 'a0000001-0000-4000-8000-000000000001'
        )
    AND (
      EXTRACT(MINUTE FROM start_time)::int NOT IN (0, 20, 40)
      OR EXTRACT(SECOND FROM start_time) <> 0
    );
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'e2e seed: % availability rows are off the 20-min grid', v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM lessons
  WHERE teacher_id IN (public.e2e_id(1), public.e2e_id(2))
    AND EXTRACT(MINUTE FROM (scheduled_at AT TIME ZONE 'Asia/Seoul'))::int NOT IN (0, 20, 40);
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'e2e seed: % lessons are off the 20-min KST grid', v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM enrollments
  WHERE id BETWEEN public.e2e_id(300) AND public.e2e_id(399)
    AND (
      preferred_slot_time IS NULL
      OR split_part(preferred_slot_time, ':', 2) NOT IN ('00', '20', '40')
    );
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'e2e seed: % enrollments have a non-grid preferred_slot_time', v_bad;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM teachers_weekly_availability
    WHERE teacher_id = public.e2e_id(1) AND day = 'Mon' AND start_time = TIME '10:00'
  ) THEN
    RAISE EXCEPTION 'e2e seed: James Mon 10:00 must stay open for renewal';
  END IF;

  IF (
    SELECT count(*) FROM teachers_weekly_availability
    WHERE teacher_id = public.e2e_id(1) AND start_time = TIME '13:00'
      AND day IN ('Mon', 'Tue', 'Wed', 'Thu', 'Fri')
  ) <> 5 THEN
    RAISE EXCEPTION 'e2e seed: James 13:00 weekday working hours must stay listed';
  END IF;

  IF (
    SELECT count(*) FROM teachers_weekly_availability
    WHERE teacher_id = public.e2e_id(1) AND start_time = TIME '15:00'
      AND day IN ('Tue', 'Thu')
  ) <> 2 THEN
    RAISE EXCEPTION 'e2e seed: James Tue/Thu 15:00 working hours must stay listed';
  END IF;
END
$verify$;

DROP FUNCTION IF EXISTS public.e2e_upsert_auth_user(uuid, text, text, jsonb);
DROP FUNCTION IF EXISTS public.e2e_match_dates(date, text[], int, int);
DROP FUNCTION IF EXISTS public.e2e_grid_slots(time, time);
DROP FUNCTION IF EXISTS public.e2e_kst(date, time);
DROP FUNCTION IF EXISTS public.e2e_assert_grid_time(time);
DROP FUNCTION IF EXISTS public.e2e_id(int);
