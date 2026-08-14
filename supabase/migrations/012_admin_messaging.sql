-- Admin messaging: direct CS threads, broadcast campaigns, system notification rules

CREATE TABLE IF NOT EXISTS admin_direct_threads (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('student', 'teacher')),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES teachers(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_message_at timestamptz,
  last_message_preview text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_direct_threads_target_check CHECK (
    (target_type = 'student' AND student_id IS NOT NULL AND teacher_id IS NULL)
    OR (target_type = 'teacher' AND teacher_id IS NOT NULL AND student_id IS NULL)
  ),
  UNIQUE (profile_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_direct_threads_last_message
  ON admin_direct_threads (last_message_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS admin_direct_messages (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES admin_direct_threads(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('admin', 'student', 'teacher')),
  sender_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_direct_messages_thread_created
  ON admin_direct_messages (thread_id, created_at ASC);

ALTER TABLE admin_broadcasts
  ADD COLUMN IF NOT EXISTS audience text,
  ADD COLUMN IF NOT EXISTS enrollment_filters text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'push_only'
    CHECK (channel IN ('push_chat', 'push_only', 'chat_only')),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS recipient_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivered_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicked_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS segment_label text;

CREATE INDEX IF NOT EXISTS idx_admin_broadcasts_sent_at
  ON admin_broadcasts (sent_at DESC);

CREATE TABLE IF NOT EXISTS system_notification_rules (
  rule_key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  channels text[] NOT NULL DEFAULT ARRAY['push', 'in_app']::text[],
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO system_notification_rules (rule_key, label, description, enabled, channels)
VALUES
  (
    'lesson-reminder-10m',
    '수업 10분 전 리마인더',
    '예정 수업 10분 전 학생·선생님에게 Push + 앱 알림',
    true,
    ARRAY['push', 'in_app']
  ),
  (
    'payment-confirmed',
    '입금 확인 완료',
    '관리자 입금 확인 후 학부모에게 활성화 안내',
    true,
    ARRAY['push', 'in_app']
  ),
  (
    'reschedule-request',
    '보강/일정 변경 요청',
    '학생·선생님 일정 변경 요청 시 상대방 및 관리자 알림',
    true,
    ARRAY['push', 'in_app']
  ),
  (
    'reschedule-approved',
    '보강/일정 변경 승인',
    '승인 완료 시 요청자에게 결과 알림',
    true,
    ARRAY['in_app']
  ),
  (
    'chat-unread-digest',
    '미확인 채팅 요약 (1일 1회)',
    '24시간 미확인 채팅이 있을 때 저녁 7시 요약 Push',
    false,
    ARRAY['push']
  ),
  (
    'enrollment-expiring',
    '수강 만료 7일 전',
    '만료 임박 학생·학부모에게 연장 안내',
    true,
    ARRAY['push', 'in_app']
  )
ON CONFLICT (rule_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description;

-- Realtime for admin direct messages (optional inbox refresh)
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'admin_direct_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE admin_direct_messages;
  END IF;
END
$do$;

-- Demo RLS (when enabled)
DO $policies$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'admin_direct_threads',
    'admin_direct_messages',
    'admin_broadcasts',
    'system_notification_rules'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = tbl AND rowsecurity = true
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS demo_read_%I ON %I', tbl, tbl);
      EXECUTE format('CREATE POLICY demo_read_%I ON %I FOR SELECT USING (true)', tbl, tbl);
      EXECUTE format('DROP POLICY IF EXISTS demo_write_%I ON %I', tbl, tbl);
      EXECUTE format(
        'CREATE POLICY demo_write_%I ON %I FOR ALL USING (true) WITH CHECK (true)',
        tbl,
        tbl
      );
    END IF;
  END LOOP;
END
$policies$;
