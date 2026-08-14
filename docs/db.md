# Pass on English — 데이터베이스 설계 명세서

## 0. MVP 구현 현황 (2026-08)

| 단계 | 상태 | 비고 |
|------|------|------|
| 스키마 설계 | ✅ | 본 문서 + `supabase/migrations/` |
| 통합 DDL | ✅ | `001_initial_schema.sql` — ENUM·테이블 27개·인덱스·FK·트리거·시드 |
| 추가 migration | ✅ | `002`~`024` — plan_type, FAQ, finance, chat Realtime, **production RLS**, demo seed, **teacher applicant RLS**, **E2E rich seed** |
| `pricing_plans` 런타임 | ✅ | `@supabase/ssr` + `pricing-plans/repository.ts` |
| **핵심 도메인 store → Supabase** | **✅** | repository + sync cache 패턴 — **MVP store 전부 이전 완료** (§0.1) |
| Auth · RLS | ⚠️ **1차** | migration 017~021 production RLS; middleware + login API; bootstrap service role |
| Realtime (채팅) | ✅ | `chat_messages` INSERT 구독 — migration 006 |

### 0.1 Supabase 연동 완료 (repository + cache)

| repository / 모듈 | sync store | DB 테이블 |
|-------------------|------------|-----------|
| `pricing-plans/repository.ts` | `pricing-plan-cache.ts` | `pricing_plans` |
| `accounts/repository.ts` | `account-store-sync.ts` | `profiles`, `students` |
| `enrollments/repository.ts` | `enrollment-store-sync.ts` | `enrollments`, `payments` |
| `lessons/repository.ts` | `teacher-lesson-store-sync.ts` | `lessons` |
| `teacher-availability/repository.ts` | `teacher-availability-store-sync.ts` | `teachers_weekly_availability` |
| `reschedule/repository.ts` | `reschedule-store-sync.ts` | `lesson_reschedule_requests` |
| `learning/repository.ts` | `learning-store-sync.ts` | `lesson_feedbacks`, `monthly_growth_reports` |
| `teacher-salary/repository.ts` | `teacher-salary-store-sync.ts` | `teacher_salary_statements` |
| `teacher-salary-policy-repository.ts` | `teacher-salary-policy-store-sync.ts` | `salary_settings` |
| `teacher-salary-adjustment-repository.ts` | `teacher-salary-adjustment-store-sync.ts` | `teacher_bonuses` (음수=패널티) |
| `teacher-payroll-penalty-repository.ts` | `teacher-payroll-penalty-store-sync.ts` | `teacher_payroll_penalties` |
| `teachers/repository.ts` | `teacher-profile-store-sync.ts` | `teachers`, `profiles.avatar_url` |
| `teacher-student-context-repository.ts` | `teacher-student-context-store-sync.ts` | `teacher_student_context` |
| `faq/repository.ts` | `faq-store-sync.ts` | `faq_items` |
| `admin/dashboard-settings/repository.ts` | `dashboard-settings-store-sync.ts` | `dashboard_settings` |
| `teacher-applications/repository.ts` | `teacher-application-store-sync.ts` | `teacher_applications` |
| `admin/admin-review-log-repository.ts` | `admin-review-log-store-sync.ts` | `admin_review_logs` |
| `admin/admin-lesson-operation-log-repository.ts` | `admin-lesson-operation-log-store-sync.ts` | `admin_lesson_operation_logs` |
| `student-registrations/repository.ts` | `student-registration-store-sync.ts` | `student_registration_reviews` |
| `chat/repository.ts` | `chat-store-sync.ts` | `chat_rooms`, `chat_messages` |
| `finance/repository.ts` | `finance-store-sync.ts` | `finance_transactions`, `finance_snapshots` |

- **Bootstrap**: `ensureSchedulesBootstrapped()` — API Route 진입 시 `warm*Cache()` 일괄 호출 후 sync store 읽기
- **공개 페이지**: `ensurePublicContentBootstrapped()` — FAQ·선생님·availability·pricing cache만 warm

**Supabase migration 파일**

| 파일 | 내용 |
|------|------|
| `supabase/migrations/001_initial_schema.sql` | 전체 스키마 + `pricing_plans`·`salary_settings` 시드 |
| `supabase/migrations/002_pricing_plans_plan_type_text.sql` | `plan_type` ENUM → `text` (관리자 커스텀 플랜 CRUD) |
| `supabase/migrations/003_faq_dashboard_teacher_applications.sql` | `faq_items`, `dashboard_settings`, `teacher_applications` + 시드 |
| `supabase/migrations/004_profiles_active_student_id.sql` | `profiles.active_student_id` FK → `students` |
| `supabase/migrations/005_student_registration_reviews.sql` | `student_registration_reviews` + `registration_status` ENUM |
| `supabase/migrations/006_finance_transactions_chat_realtime.sql` | `finance_transactions` + `chat_messages` Realtime publication |

store → DB 이전 시 본 문서의 컬럼·ENUM을 migration 기준으로 사용한다.

| store / 모듈 | 대응 테이블 | DB 연동 |
|--------------|-------------|---------|
| `pricing-plans/repository.ts` | `pricing_plans` | ✅ Supabase |
| `accounts/repository.ts` | `profiles`, `students` | ✅ Supabase |
| `enrollments/repository.ts` | `enrollments`, `payments` | ✅ Supabase |
| `lessons/repository.ts` | `lessons` | ✅ Supabase |
| `teacher-availability/repository.ts` | `teachers_weekly_availability` | ✅ Supabase |
| `reschedule/repository.ts` | `lesson_reschedule_requests` | ✅ Supabase |
| `learning/repository.ts` | `lesson_feedbacks`, `monthly_growth_reports` | ✅ Supabase |
| `teacher-salary/repository.ts` | `teacher_salary_statements` | ✅ Supabase |
| `teacher-salary-policy-repository.ts` | `salary_settings` | ✅ Supabase |
| `teacher-salary-adjustment-repository.ts` | `teacher_bonuses` | ✅ Supabase |
| `teacher-payroll-penalty-repository.ts` | `teacher_payroll_penalties` | ✅ Supabase |
| `teachers/repository.ts` | `teachers` | ✅ Supabase |
| `teacher-student-context-repository.ts` | `teacher_student_context` | ✅ Supabase |
| `faq/repository.ts` | `faq_items` | ✅ Supabase |
| `admin/dashboard-settings/repository.ts` | `dashboard_settings` | ✅ Supabase |
| `teacher-applications/repository.ts` | `teacher_applications` | ✅ Supabase |
| `admin/admin-review-log-repository.ts` | `admin_review_logs` | ✅ Supabase |
| `admin/admin-lesson-operation-log-repository.ts` | `admin_lesson_operation_logs` | ✅ Supabase |
| `student-registrations/repository.ts` | `student_registration_reviews` | ✅ Supabase |
| `chat/repository.ts` | `chat_rooms`, `chat_messages` | ✅ Supabase |
| `finance/repository.ts` | `finance_transactions`, `finance_snapshots` | ✅ Supabase |
| `chat-store.ts` | (re-export) | ✅ href helpers only |
| `finance/payroll-finance-store.ts` | (re-export) | ✅ sync re-export |

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
CREATE TYPE user_role AS ENUM ('student', 'teacher', 'admin');
CREATE TYPE account_type AS ENUM ('self', 'guardian');
CREATE TYPE country_code AS ENUM ('KR', 'CN');
CREATE TYPE teacher_status AS ENUM ('pending', 'active', 'inactive', 'on_leave', 'terminated');
CREATE TYPE enrollment_status AS ENUM (
  'pending_payment', 'active', 'expiring_soon', 'completed', 'cancelled'
);
CREATE TYPE lesson_status AS ENUM (
  'pending_payment', 'scheduled', 'reschedule_pending', 'completed', 'cancelled', 'no_show'
);
-- ... payment_status, reschedule_*, salary_payout_status, video_platform, currency_code, notification_type
```

> **`plan_type`**: `001` migration에서는 ENUM 4종으로 생성. `002` migration에서 **`text`** 로 변경 — 관리자 `/admin/pricing` CRUD 시 `mwf_40min` 등 임의 slug 허용.

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
| plan_type | text | UNIQUE — 시드 4종 slug 또는 관리자 생성 slug (`mwf_40min` 등) |
| sessions_count | int | 20, 12, 8 |
| session_minutes | int | **20** (기본; UI·관리자 CRUD로 20/40/60 등 가변) |
| slot_block_minutes | int | **20** (:00·:20·:40 그리드) |
| price_krw | int | |
| price_cny | int | |
| description | jsonb | i18n·UI 메타 (아래 스키마) |
| is_active | boolean | default true |

**`description` JSONB 스키마** (앱 ↔ DB 매핑)

```json
{
  "ko": { "name": "주5회(월~금) 20분" },
  "zh-CN": { "name": "每周5次(周一至周五) 20分钟" },
  "schedule_days": ["Mon", "Tue", "Wed", "Thu", "Fri"],
  "sort_order": 1,
  "is_popular": true
}
```

| TS `PricingPlan` 필드 | DB 출처 |
|----------------------|---------|
| `id` | `id` |
| `name` | `description.ko.name` |
| `nameZh` | `description.zh-CN.name` |
| `scheduleDays` | `description.schedule_days` |
| `sessionsCount` | `sessions_count` |
| `sessionMinutes` | `session_minutes` |
| `priceKrw` / `priceCny` | `price_krw` / `price_cny` |
| `isPopular` | `description.is_popular` |
| `active` | `is_active` |
| `sortOrder` | `description.sort_order` |

**시드 데이터** (`001_initial_schema.sql` INSERT, `ON CONFLICT` upsert)

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
| sessions_remaining | int | nullable — 잔여 회차 (관리자 가감) |
| curriculum | text | nullable |
| session_adjustments | jsonb | default `[]` — 관리자 회차 조정 이력 |
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

### 4.18a finance_transactions (migration 006)

개별 정산·거래 원장. UI `FinanceDashboard`는 `/api/admin/finance/transactions`로 조회.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| transaction_date | date | 거래일 |
| type | text | income \| expense |
| category | text | student_payment_kr, teacher_payroll, … |
| description | text | |
| currency | text | KRW, CNY, PHP |
| amount | numeric | 원화/외화 원금 |
| amount_krw | numeric | KRW 환산 |
| supply_amount, vat_amount | numeric | 세무 분리 |
| tax_treatment | text | |
| source | text | auto \| manual |
| teacher_id | uuid FK | nullable |
| teacher_name, student_name | text | nullable |
| enrollment_id | uuid FK | 입금 확인 시 (UNIQUE per income) |
| salary_statement_id | uuid FK | 급여 paid 시 (UNIQUE) |
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

## 6. RLS (production — migration 017~022)

> §6 예시 SQL은 개발 참고용. **실제 적용 정책**은 `017_production_rls.sql` ~ `022_teacher_application_applicant_read.sql`.

| Migration | 내용 |
|-----------|------|
| `017_production_rls.sql` | 역할 기반 RLS, demo policy 제거 |
| `018_fix_rls_auth.sql` | SECURITY DEFINER helpers (`auth.uid()`, role check) |
| `019_fix_rls_recursion.sql` | students↔lessons 정책 재귀 차단 |
| `020_fix_demo_admin_auth.sql` | demo-admin auth.users 수정 |
| `021_admin_direct_notification_type.sql` | `notification_type` enum `admin_direct` |
| `022_teacher_application_applicant_read.sql` | `teacher_applications` SELECT — admin · `teacher_id=auth.uid()` · JWT email match |

**검증**: `npm run apply:rls` · `npm run test:rls`

### 6.1 예시 (개념)

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

## 8. 마이그레이션

### 8.1 적용 방법

```bash
# Supabase CLI
supabase db push

# 또는 Supabase Dashboard → SQL Editor 에서 migration 파일 순서대로 실행
```

### 8.2 파일 목록

| 순서 | 파일 | 내용 |
|------|------|------|
| 1 | `001_initial_schema.sql` | ENUM, 테이블 27개, 인덱스, FK, auth→profiles 트리거, 비즈니스 트리거, `v_teacher_completed_hours`, 시드 |
| 2 | `002_pricing_plans_plan_type_text.sql` | `plan_type` text 변환 (커스텀 요금제) |
| 3 | `003_faq_dashboard_teacher_applications.sql` | `faq_items`, `dashboard_settings`, `teacher_applications` + 시드 |
| 4 | `004_profiles_active_student_id.sql` | `profiles.active_student_id` FK → `students` |
| 5 | `005_student_registration_reviews.sql` | `registration_status` ENUM, `student_registration_reviews` |
| 6 | `006_finance_transactions_chat_realtime.sql` | `finance_transactions`, `chat_messages` Realtime publication |
| 7 | `007_demo_seed.sql` | demo 학생·선생님·수업 시드 |
| 8 | `008_demo_seed_fix.sql` | demo 시드 수정 |
| 9 | `009_demo_rls_read_policies.sql` | demo RLS read 정책 |
| 10 | `010_demo_auth_fix.sql` | demo auth.users 수정 |
| 11 | `011_demo_rls_write_policies.sql` | demo RLS write 정책 |
| 12 | `012_admin_messaging.sql` | admin broadcasts, CS 메시징 |
| 13 | `013_scheduled_broadcasts_cron.sql` | 예약 단체 발송 cron |
| 14 | `014_notifications_rls.sql` | notifications RLS |
| 15 | `015_teacher_availability_rls.sql` | availability RLS |
| 16 | `016_demo_admin_seed.sql` | demo-admin 계정 시드 |
| 17 | `017_production_rls.sql` | production 역할 기반 RLS |
| 18 | `018_fix_rls_auth.sql` | SECURITY DEFINER helpers, profiles 정책 |
| 19 | `019_fix_rls_recursion.sql` | students↔lessons 재귀 차단 |
| 20 | `020_fix_demo_admin_auth.sql` | demo-admin 로그인 수정 |
| 21 | `021_admin_direct_notification_type.sql` | `admin_direct` notification enum |
| 22 | `022_teacher_application_applicant_read.sql` | teacher applicant own application SELECT (RLS) |
| 23 | `023_enrollment_payment_hold.sql` | enrollments `confirmed_at` · `payment_deadline_at` (15시간 홀드) |
| 24 | `024_e2e_rich_seed.sql` | E2E 통합 테스트 시드 (수강신청·홀드·입금·스케줄·보강·피드백·재수강) |

### 8.3 `001` 포함 항목 (개념적 순서)

1. ENUM types (`CREATE TYPE` — idempotent `DO` 블록)
2. `profiles` (+ `auth.users` INSERT 트리거)
3. `students`, `teachers`, availability
4. `pricing_plans` (seed 4종)
5. `enrollments`, `lessons`, feedbacks, reschedule, payments, chat
6. salary·attendance·finance·notifications·admin logs
7. views, functions, triggers

> RLS 정책은 §6 — **production migration 017~022 적용 완료** (bootstrap service role 경로 별도).

### 8.4 migration 003 (`faq_items`, `dashboard_settings`, `teacher_applications`)

| 테이블 | 주요 컬럼 |
|--------|-----------|
| `faq_items` | category_ko/zh, question/answer ko/zh, sort_order, published |
| `dashboard_settings` | slogan (singleton row, id `…0002`) |
| `teacher_applications` | full_name, date_of_birth, phone, bank_account, email, status, submitted_at |
| `teachers.application_id` | FK → `teacher_applications` (signup step 2) |

### 8.5 migration 004 (`profiles.active_student_id`)

| 컬럼 | 설명 |
|------|------|
| `profiles.active_student_id` | 보호자 계정의 현재 선택 learner (`students.id` FK, ON DELETE SET NULL) |

> `accounts/repository.ts` — 세션 warm 시 DB에서 active learner 복원.

### 8.6 migration 005 (`student_registration_reviews`)

| 테이블 / ENUM | 주요 컬럼 |
|---------------|-----------|
| `registration_status` | `pending`, `confirmed`, `rejected` |
| `student_registration_reviews` | `id` (= `students.id` FK), account_holder_name/email/phone, account_type, country, learner_* fields, english_level, purposes[], status, submitted_at, reviewed_at/by |

> `student-registrations/repository.ts` — 회원가입·learner 추가 시 `registerStudentForReviewInDb()`; 검토 센터 `student_signup` confirm/reject.

### 8.7 migration 006 (`finance_transactions` + chat Realtime)

| 테이블 / 설정 | 주요 컬럼 · 동작 |
|---------------|------------------|
| `finance_transactions` | transaction_date, type (income/expense), category, currency, amount, amount_krw, supply/vat, tax_treatment, source; FK `enrollment_id`, `salary_statement_id` |
| Realtime | `ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages` |

> `finance/repository.ts` — 급여 `paid`·KRW 이체 완료 시 payroll 지출 기록; 입금 확인(`confirmEnrollmentPaymentInDb`) 시 수강료 수입 기록; 월별 `finance_snapshots` 자동 upsert.  
> `chat/repository.ts` — `chat_rooms` CRUD·`chat_messages` 전송·읽음; 클라이언트 `useChatRealtime` 구독.

---

## 9. 시드 데이터

- `pricing_plans`: 4종 20분 플랜 (db.md §4.6 시드)
- `salary_settings`: 기본 보너스 정책 1 row
- `dashboard_settings`: 관리자 슬로건 1 row (`003`)
- `faq_items`: FAQ 10건 (`003`)
- `teacher_applications`: dev 샘플 1건 (`003`)
- demo 계정 (`007`/`016`): `demo-student@example.org` / `demo-teacher@example.org` / `demo-admin@example.org` — `DemoPass123!`
- **E2E 풍부 시드** (`024`, `npm run seed:e2e`) — 모든 레슨·availability·`preferred_slot_time`은 KST **:00/:20/:40** 그리드. 기존 demo 계정은 유지.

| 시나리오 | 로그인 | 상태 |
|----------|--------|------|
| 수강신청 | `e2e-student-fresh@example.org` | 수강권 없음, 슬롯 선택부터 |
| 15시간 홀드 | `e2e-student-hold@example.org` | `pending_payment` + James 13:00 weekday5 홀드 |
| 입금확인 → 스케줄 일괄 생성 | `e2e-student-pay@example.org` | 입금 신고됨, 관리자 confirm 시 8회 생성 |
| 보강·피드백 | `e2e-student-active@example.org` | MWF 14:00 정규 스케줄, 보강 요청 1건, 피드백 미작성 1건 |
| 재수강 | `e2e-student-renew@example.org` | weekday5 완료, James 10:00 유지 가능 |
| 형제 계정 | `e2e-student-guardian@example.org` | 수강 중 1 / 미신청 1 / 가입 검토 대기 1 |
| 선생님 | `e2e-teacher-james@example.org`, `e2e-teacher-emily@example.org` | active, 20분 그리드 availability |
| 선생님 승인 | `e2e-teacher-carlos@example.org` | `pending` |

비밀번호 공통: `DemoPass123!`

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
