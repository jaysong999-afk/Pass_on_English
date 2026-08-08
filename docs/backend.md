# Pass on English — 백엔드 개발 명세서 (Frontend-Driven)

## 0. 문서 목적 · 범위

본 문서는 **현재 프론트엔드(MVP UI)에 존재하는 화면·플로우만** 백엔드로 구현할 수 있도록 재정의한 명세이다.

| 원칙 | 설명 |
|------|------|
| **UI First** | 화면·Route Handler·in-memory store에 없는 API·테이블은 **구현하지 않는다** |
| **계약 유지** | Supabase 이전 시 `/api/*` 요청·응답 JSON **형식을 그대로** 유지한다 |
| **DB 상세** | 컬럼·ENUM·인덱스는 [`db.md`](./db.md)를 SSOT로 따른다. 본 문서는 **UI가 실제로 쓰는 테이블·필드**만 강조한다 |
| **목표 스택** | Next.js Route Handlers + Supabase PostgreSQL + Auth + (선택) Realtime |

> **현재 (2026-08)**: Route Handler + **혼합 데이터 레이어** — `pricing_plans`는 Supabase PostgreSQL CRUD 완료, 나머지 도메인은 in-memory store. Auth·RLS·Realtime은 **미연동** (로그인 UI만 존재).

---

## 1. MVP 구현 현황

### 1.1 포털별 UI ↔ API

| 포털 | 주요 경로 | API prefix |
|------|-----------|------------|
| **학생** | `/[locale]/student/*` | `/api/student/*`, `/api/enrollments`, `/api/learning/*`, `/api/lessons/reschedule`, `/api/chat/rooms` |
| **선생님** | `/teacher/*` | `/api/teacher/*`, `/api/learning/*`, `/api/lessons/reschedule`, `/api/chat/rooms` |
| **관리자** | `/admin/*` | `/api/admin/*`, `/api/enrollments/*`, `/api/teachers/profile`, `/api/pricing-plans` |
| **공개** | `/[locale]`, `/[locale]/pricing` | `/api/teachers/public`, `/api/pricing-plans`, `/api/faq` |

### 1.2 Store → DB 이전 대상

| store / 모듈 | DB 테이블 (목표) | 연동 상태 | UI에서 쓰는 기능 |
|--------------|------------------|-----------|------------------|
| `pricing-plans/repository.ts` | `pricing_plans` | **✅ Supabase** | 랜딩·수강신청·관리자 CRUD (20/40/60분 등) |
| `pricing-plan-cache.ts` | (in-memory cache) | ✅ | scheduler·enrollment sync 읽기 |
| `pricing-plan-display.ts` | — | ✅ | 클라이언트 표시 유틸 (DB 미참조) |
| `account-store.ts` | `profiles`, `students` | ⏳ | 가입, learner 전환, 설문, 체험 예약 |
| `enrollment-store.ts` | `enrollments`, `payments` | ⏳ | 수강·입금·재수강·회차 조정 |
| `teacher-profile-store.ts` | `teachers` | ⏳ | 공개 목록·관리자 프로필·가입 Step2 |
| `teacher-lesson-store.ts` | `lessons` | ⏳ | My Lessons, Schedule, 상세, 완료 |
| `teacher-availability-store.ts` | `teachers_weekly_availability` | ⏳ | Availability 그리드 |
| `teacher-booked-slots.ts` | (lessons + reservations) | ⏳ | 슬롯 마감·연속 블록 |
| `lesson-scheduler.ts` | (lessons 생성 로직) | ⏳ | 결제 확정·회차 조정 시 스케줄 |
| `lesson-scheduler-bootstrap.ts` | — | ✅ | 서버: pricing cache warm → schedule sync |
| `slot-continuity.ts` | (로직 only) | ✅ | 20분 그리드·연속 N블록 검증 |
| `reschedule-store.ts` | `lesson_reschedule_requests` | ⏳ | 보강 요청·승인·거절·취소 |
| `learning-store.ts` | `lesson_feedbacks`, `monthly_growth_reports` | ⏳ | Learning 탭·피드백·레포트 |
| `teacher-student-context-store.ts` | `teacher_student_context` | ⏳ | 교재·Special Notes·ZOOM/VOOV |
| `teacher-salary-store.ts` + adj/policy | `teacher_salary_statements`, … | ⏳ | 급여 명세·관리자 정산 |
| `teacher-payroll-penalty-store.ts` | `teacher_payroll_penalties` | ⏳ | 노쇼 패널티 |
| `chat-store.ts` | `chat_rooms` (+ `chat_messages` Phase 2) | ⏳ | 방 목록·unread·ensure room |
| `faq-store.ts` | `faq_items` | ⏳ | FAQ CRUD·공개 조회 |
| `admin/lesson-operations-store.ts` | `lessons`, `enrollments` | ⏳ | 운영 센터 조치 |
| `admin/admin-lesson-operation-log-store.ts` | `admin_lesson_operation_logs` | ⏳ | 주간 로그·undo |
| `admin/admin-review-store.ts` | (여러 큐) | ⏳ | 검토 센터 4탭 |
| `admin/admin-review-log-store.ts` | `admin_review_logs` | ⏳ | 검토 처리 로그 |
| `admin/teacher-application-store.ts` | `teacher_applications` | ⏳ | 선생님 가입 검토 |
| `admin/student-registration-store.ts` | `student_registration_reviews` | ⏳ | 학생 가입 검토 |
| `admin/dashboard-settings-store.ts` | `dashboard_settings` | ⏳ | 대시보드 슬로건 |
| `finance/payroll-finance-store.ts` | `finance_transactions`* | ⏳ | 급여 확정 시 지출 기록 |

\* `session_adjustments`, `finance_transactions` 등은 [`db.md`](./db.md) §4 또는 JSONB(`enrollments.adjustments`)로 흡수 가능.

---

## 2. 구현 범위 밖 (명시적 제외)

프론트에 **UI가 없거나 stub만** 있는 기능 — **DB/API 구현 금지** (UI 추가 전까지).

| 항목 | 현재 상태 | 비고 |
|------|-----------|------|
| Zoom / VOOV / 화상 SDK | `videoPlatform` 필드만 | URL·미팅 생성 없음 |
| PG·카드·위챗페이 | 입금 **신고** + 관리자 **수동 확인**만 | |
| SMS OTP | 없음 | 이메일 Auth만 (연동 전) |
| 채팅 **메시지 전송** | 스레드 UI + mock `chatMessages` | rooms/unread만 API ✅ |
| 채팅 Realtime | 없음 | |
| Web Push **발송** | `/api/push/send` stub | subscribe API만 존재, **UI 미연동** (TODO) |
| 관리자 **메시지 방송** | `/admin/messages` UI shell | 버튼 미연동 |
| `GET /api/admin/finance/summary` | Finance 페이지 client 집계 | 별도 API 없음 |
| 선생님 **자기 프로필 수정** | `/teacher/profile` → redirect | 관리자만 CRUD |
| `teacher_availability_exceptions` | UI 없음 | 휴무는 슬롯 Off로 대체 |
| Edge Function cron (급여 자동 정산 등) | UI 수동 확정 | cron은 Phase 3 |

---

## 3. 아키텍처

```
[Client PWA — student / teacher / admin]
        ↓ HTTPS
[Next.js App Router]
  ├── Pages (프론트 — front.md 참조)
  └── Route Handlers (/api/*)  ← 본 명세 SSOT
        ↓
[Supabase]
  ├── PostgreSQL (+ migration 001·002 적용)
  ├── `@supabase/ssr` createClient (Route Handler CRUD)
  ├── Auth (profiles.role) — 미연동
  └── (선택) Realtime — chat Phase 2
```

- 별도 Express/Nest 서버 **없음**
- `pricing_plans` CRUD: Route Handler → `pricing-plans/repository.ts` → Supabase (anon key, **RLS 미적용 시 주의**)
- Service Role Key: 향후 admin-only mutation·RLS bypass용 (현재 pricing CRUD는 `@supabase/ssr` 사용)

---

## 4. 인증 · 역할

### 4.1 UI 진입점 (front.md와 동일)

| prefix | role | 비고 |
|--------|------|------|
| `/[locale]/*`, `/student/*` | `student` | ko / zh-CN |
| `/teacher/*` | `teacher` + `teachers.status=active` | en |
| `/admin/*` | `admin` | ko |

### 4.2 Supabase Auth (연동 시)

- `profiles.role`: `student` | `teacher` | `admin`
- **학생**: `account_type` (`self` | `guardian`) — 1 account : N `students`(learners)
- **선생님 가입**: UI 2단계 → `POST /api/teacher/applications` → `POST /api/teachers/profile` → 검토 센터 `teacher_signup`
- **pending 선생님**: `/teacher/*` 차단, `/teacher/signup/complete` 안내

### 4.3 API 인증 (연동 시)

- Public: `/api/health`, `/api/teachers/public`, `/api/pricing-plans`(GET), `/api/faq`, teacher signup Step1·2
- 그 외: session 필수 + role 검증 (Route Handler에서 `profiles.role` 확인)

---

## 5. API 명세 (UI 검증 반영 · 2026-08)

> **범례**: ✅ Route Handler 구현 · 🗄️ Supabase 연동 · ⚠️ DDL 001 미포함(in-memory) · 🔇 UI 미호출

**집계**: Route Handler **39**개 · 프론트 `fetch('/api/…')` **고유 경로 ~35** · DDL 001 테이블 **27**개 중 API 직접 매핑 **24** (+ in-memory 전용 3)

### 5.1 Public · 공통

| Method | Path | UI | DB | Query / Response |
|--------|------|-----|-----|------------------|
| GET | `/api/health` | — | — | `{ ok }` — §5.7 |
| GET | `/api/teachers/public` | 🔇 SSR 대체 | `teachers` | `{ teachers[] }` — 랜딩은 RSC `getPublicTeachers()` |
| GET | `/api/pricing-plans` | `PricingSection`, `usePricingPlans` | 🗄️ `pricing_plans` | `active=true?` → `{ plans[] }` |
| POST | `/api/pricing-plans` | `/admin/pricing` | 🗄️ | Upsert fields → `{ plan }` |
| GET/PATCH/DELETE | `/api/pricing-plans/[id]` | admin pricing | 🗄️ | PATCH/DELETE; GET 🔇 |
| GET | `/api/faq` | `StudentFaqPage` | ⚠️ `faq_items` | `{ items[] }` published |
| POST | `/api/push/subscribe` | 🔇 TODO | `push_subscriptions` | stub — §5.7 |

> **제거·통합 후보** (프론트 미사용)
>
> | Path | 사유 |
> |------|------|
> | `GET /api/teachers/profile?scope=public` | `/api/teachers/public` 중복 |
> | `GET /api/teacher/applications` (목록) | 검토는 `/api/admin/reviews` |
> | `GET /api/pricing-plans/[id]` | 목록 API만 사용 |
> | `GET /api/enrollments/[id]` | `?studentId=` 목록으로 대체 |

### 5.2 학생 · 계정

| Method | Path | UI | DB (목표) | Body / Query |
|--------|------|-----|-----------|--------------|
| POST | `/api/student/account` | signup | `profiles`, `students` | `accountType`, `fullName`, `email`, `phone`, `country`, learner fields |
| GET | `/api/student/account` | 전역 `ActiveLearnerContext` | ↑ | `{ account, learners[], activeLearnerId }` |
| PATCH | `/api/student/account` | `switch_learner`, **book_trial** | ↑ + `lessons` | `action` 또는 survey fields |
| POST | `/api/student/learners` | `/student/learners/new` | `students` | `fullName`, `englishName`, `dateOfBirth` |
| PATCH | `/api/student/profile` | onboarding, `EnrollmentFlow` trial | ↑ | **deprecated** — `account`와 동일 계약, 신규 코드는 `account` 사용 |

**`book_trial` (PATCH account 또는 profile)**

```json
{
  "action": "book_trial",
  "scheduledAt": "2026-08-08T10:00:00+09:00",
  "teacherId": "uuid",
  "teacherName": "Sarah Mitchell",
  "planId": "uuid",
  "sessionMinutes": 20
}
```

> `planId` = Supabase `pricing_plans.id`. in-memory enrollment 시드 `plan-1` 등과 **불일치**.

- DB: `lessons` 1건 (`is_trial`, `duration_minutes`, `student_id`, `teacher_id`, `scheduled_at`)
- 슬롯: `teachers_weekly_availability` + in-memory reserve (`teacher-booked-slots`)

### 5.3 수강 · 결제

| Method | Path | UI | DB (목표) | Body / Query |
|--------|------|-----|-----------|--------------|
| GET | `/api/enrollments` | `EnrollmentDashboard`, admin | `enrollments` | `studentId?` |
| POST | `/api/enrollments` | `EnrollmentFlow` | ↑ + `payments` | 신규: `planId`, `teacherId`, `preferredSlotTime`, `depositorName`, `learnerId?` / 재수강: `renewFromEnrollmentId` |
| GET | `/api/enrollments/[id]` | — | `enrollments` | (미사용) `{ enrollment }` |
| PATCH | `/api/enrollments/[id]` | admin 학생상세, 검토센터 | ↑ | `confirm_payment` \| `reject_payment` |
| PATCH | `/api/enrollments/[id]/sessions` | `EnrollmentSessionEditor` | `enrollments`, `lessons`, `session_adjustments` JSONB | §6.3 |

**결제 플로우**

1. `POST /api/enrollments` → `status=pending_payment`, `payment_status=reported`
2. `PATCH confirm_payment` → `active`, `scheduleLessonsForConfirmedEnrollment()` → `lessons` N건 생성
3. 검토 센터 `payment_activation` / `activate` → 동일

### 5.4 학습 · 보강

| Method | Path | UI | DB (목표) | Query / Body |
|--------|------|-----|-----------|--------------|
| GET | `/api/learning/feedback` | `LearningResultsHub` | `lesson_feedbacks` | `studentId` (required) |
| POST | `/api/learning/feedback` | teacher feedback pages | ↑ + `lessons` | body → feedback; `lessonId` 시 `status=completed` |
| PATCH | `/api/learning/feedback` | Learning read | `lesson_feedbacks.read_at` | `?id=&action=read` |
| GET | `/api/learning/reports` | Learning, `MonthlyGrowthReportEditor` | `monthly_growth_reports` | `studentId` \| `teacherId` |
| POST | `/api/learning/reports` | teacher reports | ↑ | 5필드 + `month`, `studentId`, `teacherId` |
| PATCH | `/api/learning/reports` | Learning read | `monthly_growth_reports.read_at` | `?id=&action=read` |
| GET | `/api/lessons/reschedule` | My Lessons hubs, `RescheduleProgressPanel` | `lesson_reschedule_requests` | `studentId` \| `teacherId` (+ `makeupRemaining`) |
| POST | `/api/lessons/reschedule` | `RescheduleRequestForm` | ↑ + `lessons` | `lessonId`, `proposedScheduledAt`, `initiator`, `reason?` |
| PATCH | `/api/lessons/reschedule` | `RescheduleProgressPanel`, 검토센터 | ↑ | `{ id, action: approve\|reject\|cancel, role }` |

> `GET ?scope=all` — Route Handler에만 존재, **UI 미호출**. admin 검토는 `GET /api/admin/reviews` 스냅샷 사용.

### 5.5 선생님

| Method | Path | UI | DB (목표) | Query / Body |
|--------|------|-----|-----------|--------------|
| GET | `/api/teacher/availability` | availability page, operations, (optional) enrollment | `teachers_weekly_availability` | `teacherId`; `planDays`+`sessionMinutes` → `{ openSlots }` |
| PUT | `/api/teacher/availability` | availability, `EnrollmentFlow` reserve | ↑ | `action`: `slots`\|`toggle`\|`copy`\|`reserve` (+ `sessionMinutes`, `planDays`) |
| GET | `/api/teacher/lessons` | My Lessons, Schedule, student hub | `lessons` | default hub; `scope=all`; `scope=student&studentId=`; `timeZone` |
| GET | `/api/teacher/lessons/[id]` | lesson detail, feedback | ↑ + `lesson_feedbacks` | `{ lesson, display, needsFeedback, feedback }` |
| PATCH | `/api/teacher/lessons/[id]` | feedback page absent | `lessons` | `mark_student_absent` |
| GET/PUT | `/api/teacher/student-context` | `TeacherLessonDetailCard` | `teacher_student_context` | `studentId`, `teacherId`; PUT: textbook, videoPlatform, specialNotes |
| GET | `/api/teacher/salary` | `TeacherSalaryDashboard` | `teacher_salary_statements`, `salary_settings` | `teacherId`; `month` → 단월 명세 |
| GET | `/api/teacher/feedback` | `TeacherFeedbackHistory` | `lesson_feedbacks` | `teacherId`, `studentId?`, `month?`; `format=csv` |
| GET | `/api/teacher/applications` | signup profile, admin application detail | *(in-memory)* `teacher_applications`† | `?id=` → 단건; 목록은 UI 미사용 |
| POST | `/api/teacher/applications` | signup Step1 | ↑ | 개인정보 필드 |
| GET/PATCH | `/api/chat/rooms` | chat list, bells | `chat_rooms` | `role`; PATCH: `action=read`\|`readAll`, `id` |

† `teacher_applications` — **DDL 001 미포함**, in-memory only. Supabase 이전 시 migration 추가 필요.

**EnrollmentFlow 슬롯**: Step 2는 클라이언트 `useTeacherOpenSlots`(in-memory). Step 3 trial 후 `PUT … action=reserve`만 API 호출.

### 5.6 관리자

| Method | Path | UI | DB (목표) | Query / Body |
|--------|------|-----|-----------|--------------|
| GET/PATCH | `/api/admin/reviews` | `AdminReviewCenter`, application detail | `admin_review_logs` + 큐 stores | PATCH: § 아래 |
| GET | `/api/admin/lessons` | operations, today, session editor | `lessons` | `teacherId?`, `studentId?`, `from?`, `to?`; **`scheduledAt`** → `{ teachers[] }` 대체 후보 |
| GET/PATCH | `/api/admin/lessons/[id]` | `useAdminLessonModal` | `lessons`, `enrollments`, logs | GET: `{ lesson, availableTeachers }`; PATCH: §6.4 |
| GET/POST | `/api/admin/lessons/bulk-reassign` | `AdminOperationsCenter` | `lessons`, `enrollments` | GET: preview; `enrollmentId`+`toTeacherId` → slots; POST: transfers |
| GET | `/api/admin/lessons/operation-logs` | log panel | `admin_lesson_operation_logs` | `teacherId`, `weekStart` (required) |
| POST | `/api/admin/lessons/operation-logs/[id]/undo` | undo | ↑ | — |
| GET/PATCH | `/api/admin/teacher-salary` | `AdminTeacherSalaryOverview` | `teacher_salary_statements`, `teacher_bonuses`, `salary_settings`, `teachers` | § 아래 |
| GET/PATCH | `/api/admin/teachers`, `[id]` | teachers list/detail | `teachers` | `[id]` PATCH: `status` only |
| GET | `/api/admin/students/[id]` | student detail | `students`, `enrollments`, `lessons`, … | aggregate DTO |
| GET/PATCH | `/api/admin/dashboard-settings` | `AdminDashboardSlogan` | *(in-memory)* `dashboard_settings`† | `{ slogan }` |
| GET/POST | `/api/admin/faq` | `AdminFaqManager` | *(in-memory)* `faq_items`† | CRUD fields |
| PATCH/DELETE | `/api/admin/faq/[id]` | FAQ edit/delete | ↑ | — |
| GET/POST/PUT | `/api/teachers/profile`, `[id]` | teacher-profiles | `teachers` | admin list; POST signup step2; `[id]` PUT |

† FAQ·dashboard·teacher_applications — **migration 001에 없음**. Phase 1b DDL 또는 JSONB 확장 필요.

**PATCH `/api/admin/reviews`**

| category | action | UI | DB side-effects |
|----------|--------|-----|-----------------|
| `reschedule` | `approve` / `reject` | 보강 검토 | `lesson_reschedule_requests`, `lessons.scheduled_at` |
| `teacher_signup` | `approve` / `reject` | 선생님 가입 | `teachers.status`, application store |
| `student_signup` | `confirm` / `reject` | 학생 가입 | registration review store |
| `payment_activation` | `activate` / `reject` | 입금 확인 | `enrollments`, `payments`, `lessons` schedule |

**PATCH `/api/admin/teacher-salary` actions** (UI 사용)

| action | UI |
|--------|-----|
| `confirm` / `finalize` | 월별 명세 확정 |
| `finalize_all` | 당월 일괄 확정 |
| `mark_processing` | processing 전환 |
| `mark_php_paid` | PHP 지급 완료 |
| `complete` | KRW 이체 완료 (`krwTransferAmount`) |
| `add_adjustment` | 수기 가감 |
| `update_bonus_policy` | 보너스 정책 → `salary_settings` |
| `update_hourly_rate` | `teachers.hourly_rate_php` |
| `preview_bulk_hourly_rate` / `bulk_update_hourly_rate` | 일괄 시급 |

**GET `/api/admin/teacher-salary`**: `month`, `teacherId`, `format=csv` (CSV 다운로드)

### 5.7 인프라 (UI 비연동)

| Method | Path | 용도 |
|--------|------|------|
| GET | `/api/health` | 배포·모니터링 |
| POST | `/api/push/subscribe` | PWA (stub, UI TODO) |
| POST | `/api/push/send` | 발송 stub — **구현 범위 밖** |

---

## 5.8 API ↔ DB 매핑 검증 (2026-08)

| API 영역 | Primary tables | DDL 001 | 런타임 |
|----------|----------------|---------|--------|
| pricing-plans | `pricing_plans` | ✅ | Supabase |
| student/account | `profiles`, `students` | ✅ | in-memory |
| enrollments | `enrollments`, `payments` | ✅ | in-memory |
| lessons (all portals) | `lessons` | ✅ | in-memory |
| availability | `teachers_weekly_availability` | ✅ | in-memory |
| student-context | `teacher_student_context` | ✅ | in-memory |
| learning | `lesson_feedbacks`, `monthly_growth_reports` | ✅ | in-memory |
| reschedule | `lesson_reschedule_requests` | ✅ | in-memory |
| salary | `teacher_salary_statements`, `salary_settings`, `teacher_bonuses`, `teacher_payroll_penalties` | ✅ | in-memory |
| chat rooms | `chat_rooms` | ✅ | in-memory (messages mock) |
| admin ops logs | `admin_lesson_operation_logs` | ✅ | in-memory |
| admin reviews | `admin_review_logs` | ✅ | in-memory |
| teachers profile | `teachers` | ✅ | in-memory |
| **faq** | `faq_items` | ✅ 003 | in-memory |
| **dashboard slogan** | `dashboard_settings` | ✅ 003 | in-memory |
| **teacher applications** | `teacher_applications` | ✅ 003 | in-memory |
| **student registration review** | `student_registration_reviews` | ❌ | in-memory |

**공개 선생님 목록**: 랜딩·수강신청·`/teachers` 페이지는 **Server Component**에서 `getPublicTeachers()` 직접 호출. `GET /api/teachers/public`은 Route Handler로 존재하나 **클라이언트 fetch 미사용** — 모바일/PWA 전환 시 사용.

---

## 6. 핵심 비즈니스 로직 (UI 연동분)

### 6.1 20분 그리드 · 다중 세션 길이

| 상수 | 값 | UI |
|------|-----|-----|
| `SLOT_BLOCK_MINUTES` | 20 | Availability `:00/:20/:40` |
| `session_minutes` | 20 / 40 / 60 … | 관리자 pricing CRUD |
| `requiredBlocks` | `ceil(session_minutes / 20)` | 수강신청·예약 |

- **연속 블록**: `slot-continuity.ts` — `canBookSessionAt`, `getValidSessionStartTimes`
- **충돌 검사**: `isTeacherSlotFree(teacherId, scheduledAt, ignoreLessonId?, sessionMinutes)`
- **예약**: `reserveTeacherWeeklySlotsForPlan(teacherId, planDays, start, studentName, sessionMinutes)` — N블록 일괄

### 6.2 수강 신청 · 체험 · 재수강

```
플랜 선택 → 선생님 정렬( openSlotCount ) → TeacherSlotPicker (연속 블록)
  → (체험) book_trial → 결제 Step
  → POST enrollments → 관리자 confirm → scheduleLessonsForConfirmedEnrollment
재수강: renewFromEnrollmentId — plan/teacher/preferredSlotTime 유지
```

### 6.3 관리자 수업 횟수 조정 (`EnrollmentSessionEditor`)

**PATCH** `/api/enrollments/[id]/sessions`

```json
{
  "action": "adjust_sessions",
  "delta": 2,
  "reason": "서비스 보상 2회",
  "adminName": "관리자"
}
```

| delta | 동작 |
|-------|------|
| **+N** | `sessions_remaining/total` +N · 마지막 예정 **다음**부터 N회 `generateEnrollmentLessons` |
| **−N** | `sessions_remaining/total` −N · **마지막 N개** future lesson 삭제 |
| 0 / invalid | `400 invalid_delta` |
| 스케줄 실패 | `409` + `schedule_failed` (부분 생성 rollback) |

- UI: ± draft → 사유 입력 → 확인 Dialog → 적용
- 레거시: `sessionsRemaining`/`sessionsTotal` 직접 PATCH (UI 미사용, 호환만)

### 6.4 관리자 수업 운영 (`/admin/operations`)

| PATCH action | UI 효과 |
|--------------|---------|
| `assign_substitute` | 대체 선생님, `original_teacher_id` 보존 |
| `teacher_no_show` | 원 수업 cancelled · 보강 생성 · enrollment **+1** · 패널티 |
| `cancel_unpaid` | lesson 삭제 · enrollment **−1** |
| `reschedule` | `scheduled_at` 변경 (20분 그리드 snap) |

- 로그: `admin_lesson_operation_logs` (`weekStart` = KST 월요일)
- **Undo**: `teacher_no_show`, `cancel_unpaid` 만

### 6.5 보강 · 완료 · 급여

- **보강**: 학생 월 2회 (`cancelled` 제외), pending 중복 불가 — `reschedule-store`
- **피드백 POST** → `completeLesson` → `status=completed` → 급여 `duration_minutes` 반영
- **mark_student_absent** → `student_absent=true`, completed, 피드백 생략
- **급여**: `estimated` → `processing` → `paid` — 관리자 `/admin/teacher-salary`

### 6.6 선생님 가입 (UI 2단계)

1. `POST /api/teacher/applications` — 개인정보 (UI에서 password 수집, **Auth 연동 전 미저장**)
2. `POST /api/teachers/profile` — `applicationId`, 공개 프로필
3. 검토 센터 `teacher_signup` → `approve` → `teachers.status=active`

---

## 7. DB 구현 범위 (UI 필요 테이블)

[`db.md`](./db.md) migration `001` 기준. **§5.8** API↔DB 검증표 참조.

### 7.1 DDL 001 포함 (Core)

| 테이블 | UI | API |
|--------|-----|-----|
| `profiles`, `students` | account, signup | `/api/student/*` |
| `teachers` | 공개·포털·급여 | `/api/teachers/*`, `/api/teacher/*`, `/api/admin/teachers/*` |
| `pricing_plans` | 랜딩·수강·pricing | `/api/pricing-plans` 🗄️ |
| `enrollments`, `payments` | 수강 전반 | `/api/enrollments*` |
| `lessons` | Schedule·Operations | `/api/teacher/lessons`, `/api/admin/lessons*` |
| `teachers_weekly_availability` | Availability | `/api/teacher/availability` |
| `teacher_student_context` | Lesson detail | `/api/teacher/student-context` |
| `lesson_feedbacks`, `monthly_growth_reports` | Learning | `/api/learning/*` |
| `lesson_reschedule_requests` | Reschedule | `/api/lessons/reschedule` |
| `teacher_salary_statements`, `salary_settings`, `teacher_bonuses`, `teacher_payroll_penalties` | Salary | `/api/teacher/salary`, `/api/admin/teacher-salary` |
| `admin_lesson_operation_logs`, `admin_review_logs` | Operations, Review | `/api/admin/lessons/operation-logs*`, `/api/admin/reviews` |
| `chat_rooms` | Chat list | `/api/chat/rooms` (messages mock) |

### 7.2 UI 사용 · DDL 003 포함 (✅ migration 003)

| 테이블 | UI | API |
|--------|-----|-----|
| `faq_items` | FAQ student/admin | `/api/faq`, `/api/admin/faq*` |
| `dashboard_settings` | Admin slogan | `/api/admin/dashboard-settings` |
| `teacher_applications` | Signup, review | `/api/teacher/applications`, reviews |

### 7.3 UI 사용 · DDL 미포함 (⚠️ migration 후보)

| 테이블 (목표) | UI | API |
|---------------|-----|-----|
| `student_registration_reviews` | Review center | `/api/admin/reviews` student_signup |

### 7.4 선택 · Phase 2 (UI stub)

| 테이블 | 조건 |
|--------|------|
| `chat_messages` | 채팅 **전송** UI 구현 시 |
| `push_subscriptions` | Push subscribe UI 연동 시 |

### 7.4 구현하지 않음

- `teacher_availability_exceptions` — UI 없음
- `admin_broadcasts` — `/admin/messages` 미연동
- `GET /api/admin/finance/summary` — Finance client 집계
- PG·카드 결제 테이블
- `POST /api/push/send` — 발송 stub

---

## 8. RLS 요약 (연동 시)

| 테이블 | student | teacher | admin |
|--------|---------|---------|-------|
| profiles | own | own | all |
| students | account의 learners | — | all |
| teachers | read active | own row | all |
| enrollments | own learners | assigned | all |
| lessons | own | own teacher_id | all |
| lesson_feedbacks | read own | write own lessons | all |
| chat_rooms | member | member | read |
| teacher_salary_statements | — | own | all |

---

## 9. Supabase 이전 체크리스트

| # | 작업 | 상태 | 검증 (UI) |
|---|------|------|-----------|
| 0 | 통합 DDL migration (`001`·`002`) | ✅ | Supabase SQL Editor / `db push` |
| 1 | Auth + `profiles.role` | ⏳ | student/teacher/admin 로그인 |
| 2 | `students` + activeLearner | ⏳ | StudentSwitcher |
| 3 | **`pricing_plans` + `session_minutes`** | **✅** | 랜딩·`/admin/pricing` CRUD·40/60분 |
| 4 | availability + slot continuity | ⏳ | TeacherSlotPicker |
| 5 | enrollments + payments flow | ⏳ | confirm → lessons 생성 |
| 6 | `adjust_sessions` batch | ⏳ | 학생상세 수업 횟수 관리 |
| 7 | lesson operations + logs + undo | ⏳ | `/admin/operations` |
| 8 | admin reviews 4 categories | ⏳ | `/admin/reschedule` |
| 9 | salary statements | ⏳ | teacher + admin salary |
| 10 | FAQ | ⏳ | student + admin |
| 11 | `pricing_plans` RLS + admin auth | ⏳ | mutation 보호 |
| 12 | migration **003**: faq, dashboard_settings, teacher_applications | ✅ | `003_*.sql` |

---

## 10. 환경 변수

```env
# Supabase (pricing_plans 연동 — anon key 필수)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # RLS·admin mutation 연동 시

# App
NEXT_PUBLIC_APP_URL=
BANK_ACCOUNT_KR=
BANK_ACCOUNT_CN=

# Web Push (Phase 2 — UI subscribe only today)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@passonenglish.com
```

---

## 11. API ↔ 프론트 파일 빠른 참조

| UI 컴포넌트 / 페이지 | API |
|----------------------|-----|
| `PricingSection`, `usePricingPlans`, `/admin/pricing` | `/api/pricing-plans` |
| `EnrollmentFlow`, `EnrollmentDashboard` | enrollments, student/account, teacher/availability (reserve) |
| `ActiveLearnerContext`, signup, learners/new | `/api/student/account`, `/api/student/learners` |
| onboarding | `/api/student/profile` (→ account 이전 권장) |
| `TeacherSlotPicker` | 클라이언트 in-memory (API: reserve only) |
| `TeacherMyLessonsHub`, `TeacherScheduleOverview` | `/api/teacher/lessons`, reschedule |
| `MyLessonsHub`, `LearningResultsHub` | teacher/lessons?scope=student, learning/*, reschedule |
| `EnrollmentSessionEditor`, admin student detail | enrollments/[id]/sessions, admin/lessons?studentId= |
| `AdminOperationsCenter`, `useAdminLessonModal` | admin/lessons*, bulk-reassign, operation-logs |
| `AdminReviewCenter`, teacher application detail | admin/reviews, teacher/applications?id= |
| `AdminTeacherSalaryOverview` | admin/teacher-salary (CSV, bulk rate) |
| `AdminFaqManager`, `StudentFaqPage` | admin/faq*, faq |
| `AdminDashboardSlogan` | admin/dashboard-settings |
| teacher-profiles pages | teachers/profile* |
| Chat pages, `ChatNotificationBell` | chat/rooms |
| teacher signup | teacher/applications, teachers/profile |
| `[locale]/page`, enrollment/new | **SSR** teachers (not `/api/teachers/public`) |

---

## 12. 문서 관계

| 문서 | 역할 |
|------|------|
| **front.md** | 화면·라우팅·UX |
| **backend.md** (본 문서) | API·비즈니스·구현 범위 |
| **db.md** | DDL·ENUM·인덱스 상세 |
| **guide.md** | 로컬 실행·데모 |

변경 시 **UI → Route Handler → store 로직 → db.md** 순으로 동기화한다.
