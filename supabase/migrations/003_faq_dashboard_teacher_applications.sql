-- Pass on English — FAQ, dashboard settings, teacher applications
-- Spec: docs/backend.md §7.2, docs/db.md §8.4
-- Run after 001_initial_schema.sql, 002_pricing_plans_plan_type_text.sql

-- ---------------------------------------------------------------------------
-- 1. ENUM
-- ---------------------------------------------------------------------------

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'teacher_application_status') THEN
    CREATE TYPE teacher_application_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- 2. faq_items
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS faq_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_ko text NOT NULL,
  category_zh text NOT NULL,
  question_ko text NOT NULL,
  question_zh text NOT NULL,
  answer_ko text NOT NULL,
  answer_zh text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faq_items_published_sort
  ON faq_items (published, sort_order);

DROP TRIGGER IF EXISTS faq_items_set_updated_at ON faq_items;
CREATE TRIGGER faq_items_set_updated_at
  BEFORE UPDATE ON faq_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. dashboard_settings (singleton row)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dashboard_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slogan text NOT NULL DEFAULT '배워서 남주자!!!',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS dashboard_settings_set_updated_at ON dashboard_settings;
CREATE TRIGGER dashboard_settings_set_updated_at
  BEFORE UPDATE ON dashboard_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. teacher_applications
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS teacher_applications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name text NOT NULL,
  date_of_birth date NOT NULL,
  phone text NOT NULL,
  bank_account text NOT NULL DEFAULT '',
  facebook_messenger_id text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  email text NOT NULL,
  status teacher_application_status NOT NULL DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  teacher_id uuid REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_teacher_applications_status
  ON teacher_applications (status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_teacher_applications_email
  ON teacher_applications (email);

-- Link teachers → application (optional; profile step 2)
ALTER TABLE teachers
  ADD COLUMN IF NOT EXISTS application_id uuid REFERENCES teacher_applications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_teachers_application_id ON teachers (application_id);

-- ---------------------------------------------------------------------------
-- 5. Seed data
-- ---------------------------------------------------------------------------

INSERT INTO dashboard_settings (id, slogan, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000002'::uuid,
  '배워서 남주자!!!',
  now()
)
ON CONFLICT (id) DO UPDATE SET
  slogan = EXCLUDED.slogan,
  updated_at = EXCLUDED.updated_at;

INSERT INTO teacher_applications (
  id,
  full_name,
  date_of_birth,
  phone,
  bank_account,
  facebook_messenger_id,
  address,
  email,
  status,
  submitted_at
)
VALUES (
  '00000000-0000-0000-0000-000000000101'::uuid,
  'David Kim',
  '1992-04-12'::date,
  '+63-912-555-0101',
  'BDO **** 4821',
  'david.kim.pe',
  'Quezon City, Metro Manila',
  'david.kim@example.com',
  'pending',
  '2026-08-01T09:00:00+00:00'::timestamptz
)
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  date_of_birth = EXCLUDED.date_of_birth,
  phone = EXCLUDED.phone,
  bank_account = EXCLUDED.bank_account,
  facebook_messenger_id = EXCLUDED.facebook_messenger_id,
  address = EXCLUDED.address,
  email = EXCLUDED.email,
  status = EXCLUDED.status,
  submitted_at = EXCLUDED.submitted_at;

INSERT INTO faq_items (
  id,
  category_ko,
  category_zh,
  question_ko,
  question_zh,
  answer_ko,
  answer_zh,
  sort_order,
  published,
  updated_at
)
VALUES
  (
    '00000000-0000-0000-0001-000000000001'::uuid,
    '무료 체험',
    '免费体验',
    '무료 체험은 어떻게 신청하나요?',
    '如何申请免费体验？',
    '회원가입 후 간단한 설문을 작성하고, 신규 수강신청에서 요금제·선생님·수업 시간을 선택하면 첫 1회 수업이 무료 체험으로 예약됩니다. 체험 후 만족하시면 입금 신고를 통해 본 수강을 시작할 수 있습니다.',
    '注册并完成简短问卷后，在「新选课」中选择套餐、老师和上课时间，第一节课将作为免费体验预约。体验满意后，可通过提交付款通知开始正式课程。',
    10,
    true,
    '2026-08-01T00:00:00+00:00'::timestamptz
  ),
  (
    '00000000-0000-0000-0001-000000000002'::uuid,
    '수강신청·결제',
    '选课与支付',
    '결제(입금)는 언제 하면 되나요?',
    '什么时候需要付款？',
    '무료 체험 전에는 결제가 필요 없습니다. 체험 수업 후 수강을 결정하시면, 수강신청 단계에서 안내된 계좌로 입금하신 뒤 포털에서 「입금 신고」를 해 주세요. 관리자 확인 후 수업이 활성화됩니다.',
    '免费体验前无需付款。体验课结束后若决定继续学习，请按选课页面提示的账户汇款，并在门户中「提交付款通知」。管理员确认后课程将激活。',
    20,
    true,
    '2026-08-01T00:00:00+00:00'::timestamptz
  ),
  (
    '00000000-0000-0000-0001-000000000003'::uuid,
    '수강신청·결제',
    '选课与支付',
    '입금 확인은 얼마나 걸리나요?',
    '付款确认需要多久？',
    '입금 신고 후 영업일 기준 1~2일 내 관리자가 확인합니다. 확인이 완료되면 선택하신 요금제에 따라 수업 일정이 자동 등록되며, 「내 수업」에서 확인할 수 있습니다.',
    '提交付款通知后，管理员将在 1–2 个工作日内确认。确认完成后，系统将根据所选套餐自动安排课表，可在「我的课程」中查看。',
    30,
    true,
    '2026-08-01T00:00:00+00:00'::timestamptz
  ),
  (
    '00000000-0000-0000-0001-000000000004'::uuid,
    '수업 일정',
    '上课安排',
    '수업 시간은 어떻게 정하나요?',
    '上课时间如何确定？',
    '수강신청 시 선생님이 가능한 시간 중 하나를 선택합니다. 선택한 시간은 요금제의 모든 수업 요일(예: 월~금)에 동일하게 적용됩니다. 예를 들어 주 5회 요금제에서 오전 10:00을 선택하면, 월·화·수·목·금 모두 10:00(KST)에 수업이 진행됩니다.',
    '选课时从老师可用时间中选择一项。所选时间将统一应用于套餐的所有上课日（例如周一至周五）。例如每周 5 次套餐选择上午 10:00，则周一至周五均在 10:00（KST）上课。',
    40,
    true,
    '2026-08-01T00:00:00+00:00'::timestamptz
  ),
  (
    '00000000-0000-0000-0001-000000000005'::uuid,
    '수업 일정',
    '上课安排',
    '수업 시간 변경은 가능한가요?',
    '可以更改上课时间吗？',
    '학생은 월 2회까지 수업 시간 변경을 요청할 수 있습니다(선생님 승인 필요). 급한 일정 변경이나 선생님 사정으로 인한 변경은 채팅 또는 운영팀을 통해 협의할 수 있습니다. 관리자·선생님 승인 후 일정에 반영됩니다.',
    '学生每月最多可申请 2 次改期（需老师确认）。紧急变更或因老师原因的调整，可通过聊天或联系运营团队协商。经管理员或老师确认后将更新课表。',
    50,
    true,
    '2026-08-01T00:00:00+00:00'::timestamptz
  ),
  (
    '00000000-0000-0000-0001-000000000006'::uuid,
    '수업 안내',
    '课程说明',
    '한 수업은 몇 분인가요?',
    '每节课多长时间？',
    '본 수업은 20분이며, 20분 단위 타임슬롯(:00·:20·:40)으로 운영됩니다. 휴식은 선생님이 Availability에서 슬롯을 비워 자율 관리합니다. 요금제의 「N회」는 실제 수업 횟수를 의미합니다.',
    '每节正式课程为 20 分钟，采用 20 分钟时段（:00、:20、:40）。休息由老师在可用时间里关闭时段自行安排。套餐中的「N 次」指实际上课次数。',
    60,
    true,
    '2026-08-01T00:00:00+00:00'::timestamptz
  ),
  (
    '00000000-0000-0000-0001-000000000007'::uuid,
    '계정·가족',
    '账户与家庭',
    '한 계정에 자녀를 여러 명 등록할 수 있나요?',
    '一个账户可以注册多个孩子吗？',
    '네. 보호자 계정으로 가입하시면 자녀(수강생)를 추가할 수 있으며, 포털 상단에서 수강생을 전환하며 각각 수강신청·수업·학습 결과를 관리할 수 있습니다.',
    '可以。以家长账户注册后可添加多名学员，在门户顶部切换学员，分别管理选课、课程和学习成果。',
    70,
    true,
    '2026-08-01T00:00:00+00:00'::timestamptz
  ),
  (
    '00000000-0000-0000-0001-000000000008'::uuid,
    '소통',
    '沟通',
    '선생님과 어떻게 소통하나요?',
    '如何与老师沟通？',
    '포털의 「채팅」 메뉴에서 배정된 선생님과 1:1 메시지를 주고받을 수 있습니다. 수업 일정, 숙제, 학습 피드백 등은 채팅과 「학습결과」 탭에서 확인하세요.',
    '可在门户「聊天」菜单中与分配的老师一对一留言。课表、作业和学习反馈可在聊天及「学习成果」中查看。',
    80,
    true,
    '2026-08-01T00:00:00+00:00'::timestamptz
  ),
  (
    '00000000-0000-0000-0001-000000000009'::uuid,
    '환불·변경',
    '退款与变更',
    '중도 환불이 가능한가요?',
    '可以中途退款吗？',
    '잔여 수업 회차 기준으로 환불이 가능합니다. 환불 요청은 채팅 또는 고객센터 이메일로 접수해 주시면, 이용 약관에 따라 미진행 회차 금액을 정산해 드립니다. (체험 수업은 무료이므로 환불 대상이 아닙니다.)',
    '可按剩余课时申请退款。请通过聊天或客服邮箱提交申请，我们将按使用条款结算未上课程费用。（免费体验课不属于退款范围。）',
    90,
    true,
    '2026-08-01T00:00:00+00:00'::timestamptz
  ),
  (
    '00000000-0000-0000-0001-000000000010'::uuid,
    '기타',
    '其他',
    '수업 시간대(타임존)는 어떻게 되나요?',
    '课程使用什么时区？',
    '수업 일정은 한국 표준시(KST, UTC+9)를 기준으로 표시·운영됩니다. 중국 거주 학생 포털에서는 현지 시간으로 함께 표시될 수 있습니다. 해외 체류 중이시라면 수강신청 전 시간대를 꼭 확인해 주세요.',
    '课表以韩国标准时间（KST，UTC+9）为准显示和安排。中国学生门户可能同时显示当地时间。如在海外，请在选课前确认时差。',
    100,
    true,
    '2026-08-01T00:00:00+00:00'::timestamptz
  )
ON CONFLICT (id) DO UPDATE SET
  category_ko = EXCLUDED.category_ko,
  category_zh = EXCLUDED.category_zh,
  question_ko = EXCLUDED.question_ko,
  question_zh = EXCLUDED.question_zh,
  answer_ko = EXCLUDED.answer_ko,
  answer_zh = EXCLUDED.answer_zh,
  sort_order = EXCLUDED.sort_order,
  published = EXCLUDED.published,
  updated_at = EXCLUDED.updated_at;
