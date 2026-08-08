# Pass on English — 데이터베이스 설계 명세서

## 0. MVP 구현 현황 (2026-08)

Supabase migration 전, 아래 스키마는 **TypeScript 타입 + in-memory store** 로 검증 중이다. store → DB 이전 시 본 문서의 컬럼·ENUM을 migration 기준으로 사용한다.

| store 모듈 | 대응 테이블 (목표) |
|------------|-------------------|
| `teacher-lesson-store.ts` | `lessons` |
| `teacher-student-context-store.ts` | `teacher_student_context` |
| `reschedule-store.ts` | `lesson_reschedule_requests` |
| `learning-store.ts` | `lesson_feedbacks`, `monthly_growth_reports` |
| `teacher-salary-store.ts` | `teacher_salary_statements` |
| `teacher-availability-store.ts` | `teachers_weekly_availability` |
| `admin-lesson-operation-log-store.ts` | `admin_lesson_operation_logs` |
| `admin-review-log-store.ts` | `admin_review_logs` |
| `teacher-payroll-penalty-store.ts` | `teacher_payroll_penalties` |
| `lesson-scheduler.ts` | (lessons 생성 로직) |
| `lesson-operations-store.ts` | (lessons·enrollments 조치 로직) |

---

## 1. 개요

| 항목 | 내용 |
|------|------|
| DBMS | PostgreSQL 15+ (Supabase) |
| ORM (선택) | Supabase client + SQL migrations |
| 타임존 | UTC 저장, UI에서 KST/CST/PHT 변환 |
| 다국어 데이터 | UI 문자열은 i18n JSON, DB는 코드값 + JSONB description |

---

## 2. ER 다이어그램 (개념)

```
auth.users
  └── profiles (role=student)  ← account_holder: 로그인·결제·연락
        └── students (learners)  ← 실제 수강생 (1 account : N students)
              ├── enrollments
              ├── lessons
              ├── lesson_feedbacks
              ├── monthly_growth_reports
              └── chat_rooms (student_id = learner)

auth.users ── profiles (role=teacher) ── teachers ── ...
auth.users ── profiles (role=admin)

payments.depositor → account_holder.full_name
lessons.student_id → students.id (learner)
```

> **핵심 분리**: `profiles.id` ≠ `students.id`. 한 부모 계정이 형제·자매 여러 `students` 레코드를 소유한다.

---

## 3. ENUM 타입

```sql
CREATE TYPE account_type AS ENUM ('self', 'guardian');
CREATE TYPE country_code AS ENUM ('KR', 'CN');
CREATE TYPE teacher_status AS ENUM ('pending', 'active', 'inactive');
CREATE TYPE enrollment_status AS ENUM ('pending_payment', 'active', 'completed', 'cancelled');
CREATE TYPE lesson_status AS ENUM (
  'pending_payment', 'scheduled', 'reschedule_pending', 'completed', 'cancelled', 'no_show'
);
CREATE TYPE payment_status AS ENUM ('pending', 'reported', 'confirmed', 'rejected');
CREATE TYPE reschedule_status AS ENUM (
  'pending_student_approval', 'pending_teacher_approval',
  'approved', 'rejected', 'cancelled'
);
CREATE TYPE reschedule_initiator AS ENUM ('student', 'teacher');
CREATE TYPE salary_payout_status AS ENUM ('estimated', 'processing', 'paid');
CREATE TYPE video_platform AS ENUM ('ZOOM', 'VOOV');
CREATE TYPE plan_type AS ENUM (
  'weekday5_20min', 'mwf_20min', 'tuth_20min', 'weekend_20min'
);
CREATE TYPE currency_code AS ENUM ('KRW', 'CNY', 'PHP');
CREATE TYPE notification_type AS ENUM (
  'payment_request', 'payment_confirmed', 'reschedule_request',
  'reschedule_result', 'chat_message', 'admin_broadcast', 'lesson_reminder'
);
```

---

## 4. 테이블 정의

### 4.1 profiles (account_holder)

Supabase `auth.users` 확장. **학생 역할(`role=student`)은 로그인 계정(학부모 또는 성인 본인)** 이다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | auth.users.id FK |
| role | user_role | NOT NULL |
| full_name | text | **계정 소유자** 실명 (입금자명) |
| phone | text | nullable |
| avatar_url | text | nullable |
| locale | text | ko, zh-CN |
| account_type | account_type | `self` \| `guardian` — 본인 수강 vs 자녀 관리 |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | |

---

### 4.2 students (learners)

**실제 수업 대상**. `profiles` 와 1:N.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| account_holder_id | uuid FK → profiles.id | NOT NULL |
| full_name | text | 한글/中文 실명 |
| english_name | text | NOT NULL — 수업·채팅 표시 |
| date_of_birth | date | NOT NULL |
| country | country_code | KR / CN (account에서 상속 가능) |
| english_level | text | CEFR 등 |
| purposes | text[] | |
| age_group | text | nullable |
| onboarding_note | text | nullable |
| trial_used | boolean | default false — **learner 단위** |
| reschedule_count_month | int | default 0 |
| reschedule_month_key | text | YYYY-MM |
| is_active | boolean | default true |
| created_at | timestamptz | |

**인덱스**: `(account_holder_id)`, `trial_used`

**RLS**: `account_holder_id = auth.uid()` OR admin

> ~~students.id = profiles.id~~ — **폐기** (2026-08)

---

### 4.3 teachers

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | profiles.id FK |
| display_name | text | NOT NULL |
| bio | text | |
| specialties | text[] | |
| experience_years | int | nullable |
| status | teacher_status | default pending |
| hourly_rate_php | numeric(10,2) | 관리자 설정 시급 (페소) |
| timezone | text | default 'Asia/Manila' |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**인덱스**: `status`

---

### 4.4 teachers_weekly_availability (MVP store)

주간 반복 **20분 슬롯** (KST). MVP는 `WeeklySlotMap` JSON 형태 in-memory.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| teacher_id | uuid FK | |
| day | text | Mon–Sun |
| start_time | time | HH:mm — **:00, :20, :40** only |
| updated_at | timestamptz | |

**UNIQUE**: (teacher_id, day, start_time)

> 레거시 `teacher_availability`(start/end range) 테이블은 목표 스키마에서 본 그리드 모델로 대체.

### 4.5 teacher_availability_exceptions

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| teacher_id | uuid FK | |
| exception_date | date | 휴무일 |
| reason | text | nullable |

---

### 4.6 pricing_plans

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| plan_type | plan_type | UNIQUE |
| sessions_count | int | 20, 12, 8 |
| session_minutes | int | **20** (기본 플랜; UI·관리자 CRUD로 20/25/30/40 등 가변) |
| slot_block_minutes | int | **20** (:00·:20·:40 그리드; 시스템 휴식 블록 없음) |
| price_krw | int | |
| price_cny | int | |
| description | jsonb | i18n labels |
| is_active | boolean | default true |

**시드 데이터**

| plan_type | sessions | minutes | slot | KRW | CNY |
|-----------|----------|---------|------|-----|-----|
| weekday5_20min | 20 | 20 | 20 | 87000 | 480 |
| mwf_20min | 12 | 20 | 20 | 90000 | 490 |
| tuth_20min | 8 | 20 | 20 | 64000 | 340 |
| weekend_20min | 8 | 20 | 20 | 64000 | 340 |

---

### 4.7 enrollments

학생-선생님-플랜 매칭 단위.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| student_id | uuid FK → students | |
| teacher_id | uuid FK → teachers | |
| plan_id | uuid FK → pricing_plans | |
| status | enrollment_status | |
| is_trial | boolean | default false |
| payment_status | payment_status | |
| currency | currency_code | KRW / CNY |
| total_amount | int | |
| sessions_total | int | |
| sessions_completed | int | default 0 |
| preferred_slot_time | text | nullable — HH:mm (KST), 주간 통일 시간 |
| preferred_slot_day | text | nullable — legacy; plan scheduleDays 사용 |
| renewed_from_enrollment_id | uuid FK | nullable — 재수강 출처 |
| started_at | timestamptz | nullable |
| ended_at | timestamptz | nullable |
| created_at | timestamptz | |

**인덱스**: (student_id), (teacher_id), (status)

---

### 4.8 lessons

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| enrollment_id | uuid FK → enrollments | |
| teacher_id | uuid FK → teachers | |
| student_id | uuid FK → students | |
| scheduled_at | timestamptz | NOT NULL |
| duration_minutes | int | NOT NULL — **20** (기본; 플랜 `session_minutes`·가변) |
| status | lesson_status | |
| is_trial | boolean | default false |
| student_absent | boolean | default false |
| teacher_no_show | boolean | default false — 관리자 노쇼 처리 |
| unpaid_for_teacher | boolean | default false — 노쇼·보강 무급 등 |
| cancel_reason | text | nullable — e.g. `teacher_no_show` |
| original_teacher_id | uuid FK | nullable — 대체·노쇼 추적 |
| related_lesson_id | uuid FK | nullable — 노쇼↔보강 연결 |
| enrollment_id | uuid FK | nullable |
| operation_note | text | nullable — 관리자 조치 메모 |
| completed_at | timestamptz | nullable |
| created_at | timestamptz | |

**인덱스**: (teacher_id, scheduled_at), (student_id, scheduled_at), (status)

---

### 4.9 lesson_feedbacks

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| lesson_id | uuid FK → lessons | UNIQUE |
| teacher_id | uuid FK | |
| student_id | uuid FK | nullable (조회용) |
| content | text | NOT NULL |
| homework | text | nullable |
| progress_pages | text | nullable — 교재 진도 페이지 |
| read_at | timestamptz | nullable — 학생 읽음 |
| created_at | timestamptz | |

---

### 4.10 lesson_reschedule_requests

> 기존 `reschedule_requests` 명칭을 **`lesson_reschedule_requests`** 로 통일 (MVP 코드: `LessonRescheduleRequest`).

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| lesson_id | uuid FK → lessons | |
| teacher_id | uuid FK | |
| student_id | uuid FK | |
| initiator | reschedule_initiator | |
| original_scheduled_at | timestamptz | |
| proposed_scheduled_at | timestamptz | |
| status | reschedule_status | default `pending_*_approval` |
| reason | text | nullable |
| request_month | text | YYYY-MM — 학생 월 2회 제한 (cancelled 제외) |
| responded_at | timestamptz | nullable |
| created_at | timestamptz | |

**인덱스**: (lesson_id, status), (student_id, request_month), (teacher_id, status)

---

### 4.11 payments

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| enrollment_id | uuid FK | |
| student_id | uuid FK | |
| amount | int | |
| currency | currency_code | |
| status | payment_status | |
| depositor_name | text | nullable |
| reported_at | timestamptz | nullable |
| confirmed_at | timestamptz | nullable |
| confirmed_by | uuid FK → profiles | admin |
| note | text | nullable |
| created_at | timestamptz | |

---

### 4.12 chat_rooms

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| enrollment_id | uuid FK | UNIQUE |
| student_id | uuid FK | |
| teacher_id | uuid FK | |
| last_message_at | timestamptz | nullable |
| created_at | timestamptz | |

---

### 4.13 chat_messages

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| room_id | uuid FK → chat_rooms | |
| sender_id | uuid FK → profiles | |
| sender_role | user_role | |
| body | text | NOT NULL |
| read_at | timestamptz | nullable |
| created_at | timestamptz | |

**인덱스**: (room_id, created_at DESC)

---

### 4.14 salary_settings

전역 급여 정책 (관리자 수정).

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| monthly_bonus_per_hour_php | numeric | default 25 |
| quarter_bonus_tier1_hours | int | default 300 |
| quarter_bonus_tier1_php | numeric | default 2000 |
| quarter_bonus_tier2_hours | int | default 150 |
| quarter_bonus_tier2_php | numeric | default 1300 |
| quarter_bonus_tier3_php | numeric | default 700 |
| updated_at | timestamptz | |
| updated_by | uuid FK | |

---

### 4.15 teacher_bonuses

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| teacher_id | uuid FK | |
| amount_php | numeric | |
| reason | text | |
| month_key | text | YYYY-MM |
| created_by | uuid FK | admin |
| created_at | timestamptz | |

---

### 4.16 teacher_monthly_attendance

만근 판정 캐시.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| teacher_id | uuid FK | |
| month_key | text | YYYY-MM |
| total_hours | numeric | |
| is_perfect_attendance | boolean | |
| monthly_bonus_php | numeric | |
| calculated_at | timestamptz | |

**UNIQUE**: (teacher_id, month_key)

---

### 4.17 quarterly_bonus_records

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| teacher_id | uuid FK | |
| quarter_key | text | e.g. 2026-Q1 |
| total_hours | numeric | |
| bonus_php | numeric | |
| created_at | timestamptz | |

---

### 4.18 finance_snapshots

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| period_type | text | month, quarter, year |
| period_key | text | 2026-07, 2026-Q3, 2026 |
| revenue_krw | numeric | |
| revenue_cny | numeric | |
| expense_php | numeric | |
| expense_krw | numeric | nullable |
| snapshot_data | jsonb | 차트 raw |
| created_at | timestamptz | |

---

### 4.19 push_subscriptions

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| user_id | uuid FK → profiles | |
| endpoint | text | UNIQUE |
| p256dh | text | |
| auth | text | |
| user_agent | text | nullable |
| created_at | timestamptz | |

---

### 4.20 notifications

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| user_id | uuid FK | |
| type | notification_type | |
| title | text | |
| body | text | |
| payload | jsonb | |
| read_at | timestamptz | nullable |
| created_at | timestamptz | |

---

### 4.21 admin_broadcasts

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| sent_by | uuid FK | |
| target_role | user_role | nullable |
| target_country | country_code | nullable |
| title | text | |
| body | text | |
| sent_at | timestamptz | |

---

### 4.22 teacher_student_context

선생님이 학생별로 유지하는 수업 컨텍스트 (교재는 변경 전까지 유지).

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| teacher_id | uuid FK → teachers | |
| student_id | uuid FK → students | |
| textbook | text | default '' |
| video_platform | video_platform | default 'ZOOM' |
| special_notes | text | nullable |
| updated_at | timestamptz | |

**UNIQUE**: (teacher_id, student_id)

---

### 4.23 monthly_growth_reports

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| student_id | uuid FK | |
| teacher_id | uuid FK | |
| month | text | YYYY-MM |
| title | text | |
| lessons_covered | text | NOT NULL |
| progress_made | text | NOT NULL |
| areas_to_work_on | text | NOT NULL |
| next_month_goals | text | NOT NULL |
| overall_comment | text | NOT NULL |
| published_at | timestamptz | |
| read_at | timestamptz | nullable |
| created_at | timestamptz | |

**UNIQUE**: (student_id, teacher_id, month)

> ~~summary, strengths, improvements, goals, sessions_completed~~ — **폐기** (2026-08)

---

### 4.24 teacher_salary_statements

월별 급여 명세서 (payroll slip).

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| teacher_id | uuid FK | |
| month | text | YYYY-MM |
| status | salary_payout_status | default 'estimated' |
| completed_classes | int | |
| total_hours | numeric | |
| hourly_rate | numeric | PHP |
| base_salary | numeric | |
| perfect_attendance_bonus | numeric | default 0 |
| quarterly_bonus | numeric | default 0 |
| other_incentives | numeric | default 0 |
| deductions | numeric | default 0 |
| payment_date | date | nullable |
| payout_account | jsonb | `{ type, label, accountNumber, accountName? }` |
| is_live_estimate | boolean | default false — 당월 추정치 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**UNIQUE**: (teacher_id, month)

---

### 4.25 admin_lesson_operation_logs

관리자 **수업 조치** 이력 (운영 센터 로그 패널).

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| at | timestamptz | 조치 시각 |
| teacher_id | uuid FK | |
| lesson_id | uuid FK | |
| student_name | text | nullable |
| scheduled_at | timestamptz | 수업 예정 시각 (로그 그룹핑 기준) |
| week_start_key | date | 수업 주 월요일 (KST) |
| action | text | assign_substitute \| teacher_no_show \| cancel_unpaid \| reschedule |
| summary | text | |
| note | text | nullable |
| admin_name | text | |
| undone_at | timestamptz | nullable — undo 시각 |
| undoable | boolean | |
| undo_payload | jsonb | nullable — 복구용 스냅샷 |

**인덱스**: (teacher_id, week_start_key, at DESC)

---

### 4.26 admin_review_logs

관리자 **검토 센터** 처리 이력.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| category | text | reschedule \| teacher_signup \| student_signup \| payment_activation |
| action | text | approved \| rejected \| confirmed \| activated |
| target_id | text | |
| target_label | text | |
| detail | text | nullable |
| admin_name | text | |
| at | timestamptz | |

---

### 4.27 teacher_payroll_penalties

선생님 노쇼 등 급여 보너스 패널티.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| teacher_id | uuid FK | |
| month | text | YYYY-MM |
| perfect_attendance_forfeited | boolean | |
| quarterly_bonus_reset | boolean | |
| reason | text | nullable |
| created_at | timestamptz | |

**UNIQUE**: (teacher_id, month) — MVP는 월당 1건 upsert

---

## 5. Views & Functions

### 5.1 v_teacher_completed_hours

```sql
-- teacher_id, month_key, total_hours
SELECT teacher_id,
       to_char(completed_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month_key,
       SUM(duration_minutes) / 60.0 AS total_hours
FROM lessons
WHERE status = 'completed'
GROUP BY 1, 2;
```

### 5.2 estimate_teacher_salary(teacher_id, month_key)

Returns: `base_salary`, `monthly_bonus`, `quarterly_bonus`, `manual_bonus`, `total_php`

Logic:

1. `base = total_hours × hourly_rate_php`
2. `monthly_bonus = IF perfect_attendance THEN total_hours × settings.monthly_bonus_per_hour_php ELSE 0`
3. `quarterly_bonus` from tier table if quarter end
4. `manual = SUM(teacher_bonuses)` for month

### 5.3 check_student_reschedule_limit()

Trigger before INSERT on `lesson_reschedule_requests`:

- IF initiator = student AND count (excluding `cancelled`) >= 2 for `request_month` → RAISE EXCEPTION

---

## 6. RLS 정책 (예시)

```sql
-- students: own row
CREATE POLICY students_select_own ON students
  FOR SELECT USING (auth.uid() = id);

-- lessons: student sees own
CREATE POLICY lessons_student ON lessons
  FOR SELECT USING (
    student_id = auth.uid()
    OR teacher_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- chat_messages: room participants only
CREATE POLICY chat_insert ON chat_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_rooms r
      WHERE r.id = room_id
        AND (r.student_id = auth.uid() OR r.teacher_id = auth.uid())
    )
  );
```

---

## 7. 트리거

| 트리거 | 이벤트 | 동작 |
|--------|--------|------|
| `on_lesson_completed` | lessons UPDATE status→completed | increment enrollment.sessions_completed; if trial → students.trial_used=true |
| `on_payment_confirmed` | payments UPDATE | enrollment.payment_status, lessons pending→scheduled |
| `on_chat_message` | chat_messages INSERT | update chat_rooms.last_message_at; insert notifications |
| `on_reschedule_approved` | reschedule_requests UPDATE | update lessons.scheduled_at |
| `reset_reschedule_monthly` | cron 1st | students.reschedule_count_month = 0 |

---

## 8. 마이그레이션 순서

1. ENUM types
2. profiles (+ auth trigger on signup)
3. students, teachers
4. pricing_plans (seed)
5. teacher_availability
6. enrollments, lessons
7. payments, lesson_feedbacks, reschedule_requests
8. chat_rooms, chat_messages
9. salary_settings (seed), teacher_bonuses, attendance tables
10. push_subscriptions, notifications, admin_broadcasts
11. views, functions, RLS, triggers

---

## 9. 시드 데이터

- `pricing_plans`: 4종 20분 플랜 (db.md §4.6 시드)
- `salary_settings`: 기본 보너스 정책 1 row
- (dev) admin user, sample teacher, sample student

---

## 10. 인덱스·성능

- 복합 인덱스: `lessons(teacher_id, scheduled_at)`, `lessons(student_id, scheduled_at)`
- Partial index: `teachers(status) WHERE status = 'active'`
- `chat_messages`: BRIN 또는 (room_id, created_at DESC) for pagination
- 월별 집계: `teacher_monthly_attendance` 캐시 테이블로 realtime 부하 감소

---

## 11. 백업·보존

- Supabase daily backup (7~30일)
- `finance_snapshots`, `quarterly_bonus_records` — soft delete 없음, 감사 추적 유지
- GDPR/개인정보: students 탈퇴 시 anonymize profiles, retain financial records hashed ID
