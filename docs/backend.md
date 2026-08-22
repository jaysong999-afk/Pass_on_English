# Pass on English — 백엔드 개발 명세서 (Frontend-Driven)

## 0. 문서 목적 · 범위

본 문서는 **현재 프론트엔드(MVP UI)에 존재하는 화면·플로우만** 백엔드로 구현할 수 있도록 재정의한 명세이다.

| 원칙 | 설명 |
|------|------|
| **UI First** | 화면·Route Handler·in-memory store에 없는 API·테이블은 **구현하지 않는다** |
| **계약 유지** | Supabase 이전 시 `/api/*` 요청·응답 JSON **형식을 그대로** 유지한다 |
| **DB 상세** | 컬럼·ENUM·인덱스는 [`db.md`](./db.md)를 SSOT로 따른다. 본 문서는 **UI가 실제로 쓰는 테이블·필드**만 강조한다 |
| **목표 스택** | Next.js Route Handlers + Supabase PostgreSQL + Auth + (선택) Realtime |

> **현재 (2026-08-17)**: Route Handler **60+**개 + Supabase PostgreSQL 데이터 레이어. 세 역할의 세션 UUID 바인딩, API **기본 거부(default deny)**, 열 단위 DTO 제한, RLS·트랜잭션 보강을 완료했다. 운영 migration은 `001`~`035`이며 E2E 시드는 `supabase/seeds/`로 분리한다.

---

## 1. MVP 구현 현황

### 1.1 포털별 UI ↔ API

| 포털 | 주요 경로 | API prefix |
|------|-----------|------------|
| **학생** | `/[locale]/student/*` | `/api/student/*`, `/api/enrollments`, `/api/learning/*`, `/api/lessons/reschedule`, `/api/chat/rooms` |
| **선생님** | `/teacher/*` | `/api/teacher/*`, `/api/learning/*`, `/api/lessons/reschedule`, `/api/chat/rooms` |
| **관리자** | `/admin/*` | `/api/admin/*`, `/api/enrollments/*`, `/api/teachers/profile`, `/api/pricing-plans`, `/api/admin/finance/transactions` |
| **공개** | `/[locale]`, `/[locale]/pricing` | `/api/teachers/public`, `/api/pricing-plans`, `/api/faq` |

### 1.2 데이터 계층 현황

**패턴**: 상태 변경은 Route Handler → server-only `*/repository.ts` → Supabase로 직접 흐른다. cache/store-sync는 기존 동기 도메인 계산과 bootstrap 읽기를 위한 호환 계층으로 제한하며, 삭제된 legacy `*-store.ts`에 새 write 로직을 추가하지 않는다. 읽기 bootstrap과 상태 변경 작업은 분리한다.

| store / 모듈 | DB 테이블 (목표) | 연동 상태 | UI에서 쓰는 기능 |
|--------------|------------------|-----------|------------------|
| `pricing-plans/repository.ts` | `pricing_plans` | **✅ Supabase** | 랜딩·수강신청·관리자 CRUD (20/40/60분 등) |
| `pricing-plan-cache.ts` | (in-memory cache) | ✅ | scheduler·enrollment sync 읽기 |
| `pricing-plan-display.ts` | — | ✅ | 클라이언트 표시 유틸 (DB 미참조) |
| `accounts/repository.ts` | `profiles`, `students` | **✅ Supabase** | 가입, learner 전환, 설문, 체험 예약 |
| `account-store-sync.ts` | ↑ (cache) | ✅ | 클라이언트·RSC sync 읽기 |
| `enrollments/repository.ts` | `enrollments`, `payments` | **✅ Supabase** | 수강·입금·재수강·회차 조정 |
| `enrollment-store-sync.ts` | ↑ (cache) | ✅ | |
| `teachers/repository.ts` | `teachers`, `profiles` | **✅ Supabase** | 공개 목록·관리자 프로필·가입 Step2 |
| `teacher-profile-store-sync.ts` | ↑ (cache) | ✅ | `teacher-pending-*`는 Auth 전 임시 overlay |
| `lessons/repository.ts` | `lessons` | **✅ Supabase** | My Lessons, Schedule, 상세, 완료 |
| `teacher-lesson-store-sync.ts` | ↑ (cache) | ✅ | |
| `teacher-availability/repository.ts` | `teachers_weekly_availability` | **✅ Supabase** | Availability 그리드 |
| `teacher-booked-slots.ts` | (lessons + reservations) | ✅ | 슬롯 마감·연속 블록 (cache 기반) |
| `lesson-scheduler.ts` | (lessons 생성 로직) | **✅ Supabase** | 결제 확정·회차 조정 시 스케줄 |
| `lesson-scheduler-bootstrap.ts` | — | ✅ | 서버: 전 도메인 cache warm → schedule sync |
| `slot-continuity.ts` | (로직 only) | ✅ | 20분 그리드·연속 N블록 검증 |
| `reschedule/repository.ts` | `lesson_reschedule_requests` | **✅ Supabase** | 보강 요청·승인·거절·취소 |
| `learning/repository.ts` | `lesson_feedbacks`, `monthly_growth_reports` | **✅ Supabase** | Learning 탭·피드백·레포트 |
| `teacher-student-context-repository.ts` | `teacher_student_context` | **✅ Supabase** | 교재·Special Notes·ZOOM/VOOV |
| `teacher-salary/repository.ts` + adj/policy | `teacher_salary_statements`, `salary_settings`, `teacher_bonuses`, `teacher_payroll_penalties` | **✅ Supabase** | 급여 명세·관리자 정산 |
| `faq/repository.ts` | `faq_items` | **✅ Supabase** | FAQ CRUD·공개 조회 |
| `admin/dashboard-settings/repository.ts` | `dashboard_settings` | **✅ Supabase** | 대시보드 슬로건 |
| `teacher-applications/repository.ts` | `teacher_applications` | **✅ Supabase** | 선생님 가입 검토 |
| `admin/lesson-operations-store.ts` | `lessons`, `enrollments` | **✅ Supabase** | 운영 센터 조치 (repository writes) |
| `admin/admin-lesson-operation-log-repository.ts` | `admin_lesson_operation_logs` | **✅ Supabase** | 주간 로그·undo |
| `admin/admin-review-store.ts` | (여러 큐) | **✅ Supabase** | 검토 센터 4탭 (reschedule·teacher_signup·student_signup·payment_activation) |
| `admin/admin-review-log-repository.ts` | `admin_review_logs` | **✅ Supabase** | 검토 처리 로그 |
| `student-registrations/repository.ts` | `student_registration_reviews` | **✅ Supabase** | 학생 가입 검토 큐·confirm/reject |
| `admin/student-registration-store-sync.ts` | ↑ (cache) | ✅ | 클라이언트·API sync 읽기 |
| `chat/repository.ts` | `chat_rooms`, `chat_messages` | **✅ Supabase** | 방 목록·unread·ensure room·메시지 CRUD |
| `chat-store-sync.ts` | ↑ (cache) | ✅ | sync 읽기 |
| `chat-store.ts` | — | ✅ | href helpers (클라이언트 안전) |
| `finance/repository.ts` | `finance_transactions`, `finance_snapshots` | **✅ Supabase** | 급여 paid·입금 확인 시 정산 기록 |
| `finance-store-sync.ts` | ↑ (cache) | ✅ | 재무 대시보드 sync 읽기 |

---

## 2. 구현 범위 밖 (명시적 제외)

프론트에 **UI가 없거나 stub만** 있는 기능 — **DB/API 구현 금지** (UI 추가 전까지).

| 항목 | 현재 상태 | 비고 |
|------|-----------|------|
| Zoom / VOOV / 화상 SDK | 학생·교사 복수 선호와 매칭은 구현; 외부 SDK·미팅 생성 없음 |
| PG·카드·위챗페이 | 입금 **신고** + 관리자 **수동 확인**만 | |
| SMS OTP | 없음 | 이메일 Auth만 (연동 전) |
| 채팅 Realtime | ✅ (migration 006) | `useChatRealtime` — `chat_messages` INSERT |
| Web Push | subscribe ✅ · VAPID `/api/push/send` ✅ · SW `/public/sw.js` | CRON_SECRET · VAPID env |
| **인앱 알림** | `/api/notifications` ✅ | GET·PATCH·click tracking |
| 관리자 **메시지 · CS** | `/api/admin/messages/*` ✅ | direct·broadcast·campaigns·notification-rules(저장만) |
| 관리자 **자동 시스템 알림** | 규칙 DB 저장 ✅ · **발송 엔진 제외** | cron/Edge 자동 발송 미구현 |
| `GET /api/admin/finance/summary` | — | `/api/admin/finance/transactions` 사용 |
| 선생님 **자기 프로필 수정** | ✅ `/teacher/profile`, `/api/teacher/settings*` | 허용 DTO만 수정; 시급·법적 정보 제외 |
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
  ├── PostgreSQL (migration 001~035)
  ├── `@supabase/ssr` request client + service/bootstrap client 분리
  ├── repository writes + 제한된 bootstrap/cache reads
  ├── Auth (profiles.role) + middleware default-deny + RLS
  └── Realtime — `chat_messages` ✅
```

- 별도 Express/Nest 서버 **없음**
- 핵심 도메인 CRUD: Route Handler → 역할/소유권 검증 → `*/repository.ts` → Supabase
- request client는 사용자 JWT와 RLS를 적용하고, service/bootstrap client는 명시된 서버 작업에만 제한한다.

---

## 4. 인증 · 역할

### 4.1 UI 진입점 (front.md와 동일)

| prefix | role | 비고 |
|--------|------|------|
| `/[locale]/*`, `/student/*` | `student` | ko / zh-CN |
| `/teacher/*` | `teacher` + `teachers.status=active` | en |
| `/admin/*` | `admin` | ko |

### 4.2 Supabase Auth (연동 완료)

| 항목 | 구현 |
|------|------|
| 로그인 API | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session` |
| OAuth callback | `GET /auth/callback` (`src/app/auth/callback/route.ts`) |
| Middleware | `src/middleware.ts` — Supabase 세션 refresh + `/teacher/*`, `/admin/*` role 가드 |
| Auth lib | `src/lib/auth/` — `session.ts`, `api-guard.ts`, `errors.ts`, `constants.ts` |
| Demo 계정 | `demo-student@example.org`, `demo-teacher@example.org`, `demo-admin@example.org` / `DemoPass123!` (migration 016, 020) |

- `profiles.role`: `student` | `teacher` | `admin`
- **학생**: `account_type` (`self` | `guardian`) — 1 account : N `students`(learners)
- **선생님 가입**: Step1 `POST /api/teacher/applications` (signUp) → Step2 `POST /api/teachers/profile` (teacher auth) → 검토 센터 `teacher_signup`
- **pending 선생님**: `/teacher/*` 차단, login `teacher_not_active`, `/teacher/signup/complete` 안내

### 4.3 API 인증 (기본 거부 + route ownership)

| 구분 | 경로 / 동작 |
|------|-------------|
| Public | `/api/health`, `/api/teachers/public`, `/api/pricing-plans`(GET), `/api/faq`, `POST /api/teacher/applications`, `/api/auth/login` |
| Teacher signup step2 | `POST /api/teachers/profile` — teacher role Bearer |
| Teacher application read | `GET /api/teacher/applications?id=` — teacher (본인) 또는 admin |
| Middleware 보호 | 공개 allowlist 외 모든 `/api/*`; admin/teacher/student·공용 도메인별 허용 역할 명시 |
| Route Handler 검증 | `guardApiRole`/`requireRole` + learner·teacher·room·lesson 소유권 확인 |
| 기본 거부 | `requiredRolesForApi()`에 분류되지 않은 API는 `[]`을 반환해 인증 여부와 무관하게 거부 |
| 공개 예외 | health, auth, 공개 FAQ/교사/요금 GET, 가입 POST, teacher-slots GET, cron-secret 경로 등 명시 allowlist |

> **DB 클라이언트**: 요청 컨텍스트는 `createRequestDbClient()` (RLS 적용). bootstrap cache warm·admin mutation은 `createBootstrapDbClient()` / `createServiceDbClient()` (`src/lib/supabase/db-client.ts`).

---

## 5. API 명세 (UI 검증 반영 · 2026-08)

> **범례**: ✅ Route Handler 구현 · 🗄️ Supabase 연동 · ⚠️ DDL 미포함(in-memory) · 🔇 UI 미호출

**집계**: Route Handler **60+**개 · DDL migration **001~035** · 핵심 도메인 Supabase 연동 · API 기본 거부 적용

### 5.1 Public · 공통

| Method | Path | UI | DB | Query / Response |
|--------|------|-----|-----|------------------|
| GET | `/api/health` | — | — | `{ ok }` — §5.7 |
| GET | `/api/teachers/public` | 🔇 SSR 대체 | 🗄️ `teachers` | `{ teachers[] }` — 랜딩은 RSC + `ensurePublicContentBootstrapped()` |
| GET | `/api/pricing-plans` | `PricingSection`, `usePricingPlans` | 🗄️ `pricing_plans` | `active=true?` → `{ plans[] }` |
| POST | `/api/pricing-plans` | `/admin/pricing` | 🗄️ | Upsert fields → `{ plan }` |
| GET/PATCH/DELETE | `/api/pricing-plans/[id]` | admin pricing | 🗄️ | PATCH/DELETE; GET 🔇 |
| GET | `/api/faq` | `StudentFaqPage` | 🗄️ `faq_items` | `{ items[] }` published |
| POST | `/api/push/subscribe` | PWA | `push_subscriptions` | VAPID + `/public/sw.js` |
| GET/PATCH | `/api/notifications` | student/teacher | `notifications` | Bearer/cookie session |
| POST | `/api/notifications/[id]/click` | SW·client | `notifications`, `admin_broadcasts` | CTR 집계 |

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
| POST | `/api/student/account` | signup | `profiles`, `students`, registration review | account holder + learner 이름/생년월일/성별, `country`, `videoPlatforms`, 설문·기타메모; password는 Auth에만 전달 |
| GET | `/api/student/account` | 전역 `ActiveLearnerContext` | ↑ | `{ account, learners[], activeLearnerId }` |
| PATCH | `/api/student/account` | `switch_learner`, **book_trial** | ↑ + `lessons` | `action` 또는 survey fields |
| POST | `/api/student/learners` | `/student/learners/new` | `students` | `fullName`, `englishName`, `dateOfBirth`, `gender`, `videoPlatforms` |
| PATCH | `/api/student/profile` | onboarding, `EnrollmentFlow` trial | ↑ | **deprecated** — `account`와 동일 계약, 신규 코드는 `account` 사용 |
| PATCH | `/api/student/settings/profile` | 내 정보 관리 | `profiles`, `students` | 변경된 phone/country 및 learner English Name·videoPlatforms만 수정 |
| POST | `/api/student/settings/password` | 계정 보안 | Supabase Auth | 현재 비밀번호 재인증 후 새 비밀번호 변경 |

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

> `planId` = Supabase `pricing_plans.id`. API·DB 연동 후 mock ID(`plan-1` 등)와 **불일치** — 시드/Auth 연동 시 정리.

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
| GET/PUT | `/api/teacher/student-context` | `TeacherLessonDetailCard` | `teacher_student_context` | 본인 teacherId로 강제; textbook 변경 이력·videoPlatform·specialNotes |
| GET | `/api/teacher/salary` | `TeacherSalaryDashboard` | `teacher_salary_statements`, `salary_settings` | 세션 교사 단월 명세; live estimate는 완료 수업만 계산 |
| GET/PATCH | `/api/teacher/settings` | My Profile | `profiles`, `teachers`, application contact | 공개 프로필·연락처·플랫폼 허용 DTO만 |
| POST | `/api/teacher/settings/password` | My Profile 보안 | Supabase Auth | 현재 비밀번호 재인증 후 변경 |
| GET | `/api/teacher/feedback` | `TeacherFeedbackHistory` | `lesson_feedbacks` | `teacherId`, `studentId?`, `month?`; `format=csv` |
| GET | `/api/teacher/applications` | signup profile, admin | 🗄️ `teacher_applications` | `?id=` → teacher/admin; 목록 admin only |
| POST | `/api/teacher/applications` | signup Step1 | 🗄️ | signUp + application |
| GET/PATCH | `/api/chat/rooms` | chat list, bells | 🗄️ `chat_rooms` | `role`; PATCH: `action=read`\|`readAll`, `id` |
| GET/POST | `/api/chat/messages` | `ChatThread` | 🗄️ `chat_messages` | GET: `roomId`; POST: body, senderRole |

**신규 수업 배정 알림**: 무료체험 lesson 생성 시 `trial:{lessonId}`, 정규 수강 첫 스케줄 생성 시 `enrollment:{enrollmentId}` 키로 teacher notification을 중복 없이 생성한다. payload에는 첫 lesson, 학생명, 수강목적, trial 여부를 포함한다. My Lessons는 unread `teacher_lesson_assignment`만 반환하며 확인 버튼은 기존 `PATCH /api/notifications?role=teacher`로 `read_at`을 기록한다.

**EnrollmentFlow 슬롯**: 학생과 `teachers.video_platforms`의 교집합이 있는 교사만 후보이며 `/api/enrollment/teacher-slots`가 공통 가능 시간을 정렬한다. 후보 배열은 memoize하여 effect 무한 재요청을 방지하고, 확정 API에서도 호환성을 재검증한다.

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
| GET/PATCH | `/api/admin/dashboard-settings` | `AdminDashboardSlogan` | 🗄️ `dashboard_settings` | `{ slogan }` |
| GET/POST | `/api/admin/faq` | `AdminFaqManager` | 🗄️ `faq_items` | CRUD fields |
| PATCH/DELETE | `/api/admin/faq/[id]` | FAQ edit/delete | 🗄️ | — |
| GET/POST | `/api/admin/messages/direct` | CS 1:1 thread list/create | 🗄️ `admin_direct_threads` | POST: `{ targetType, targetId }` |
| GET/POST/PATCH | `/api/admin/messages/direct/[threadId]` | CS messages | 🗄️ `admin_direct_messages` | POST send; PATCH mark read |
| GET | `/api/admin/messages/broadcast/preview` | BroadcastPanel | DB segment query | `audience`, `filter[]` |
| POST | `/api/admin/messages/broadcast` | BroadcastPanel | 🗄️ `admin_broadcasts`, `notifications` | `{ title, body, audience, filters, channel }` |
| GET | `/api/admin/messages/campaigns` | Push tab history | 🗄️ `admin_broadcasts` | `{ campaigns, totals }` |
| GET/PATCH | `/api/admin/messages/notification-rules` | Push tab rules | 🗄️ `system_notification_rules` | PATCH: `{ rules: [{ id, enabled }] }` |
| GET | `/api/admin/messages/quick-replies` | Quick reply templates | constants | — |
| GET/POST | `/api/cron/process-scheduled-broadcasts` | Lighthouse 내부 scheduler | 🗄️ `admin_broadcasts` | CRON_SECRET · 예약 발송 처리 |
| GET/POST/PUT | `/api/teachers/profile`, `[id]` | teacher-profiles | 🗄️ `teachers` | GET public list; **POST signup step2 (teacher auth)**; `[id]` PUT |

**PATCH `/api/admin/reviews`**

| category | action | UI | DB side-effects |
|----------|--------|-----|-----------------|
| `reschedule` | 정상 UI에서는 처리하지 않음 | 학생↔교사 진행상태 모니터링 | 장기 미응답·수업 임박만 관리자 `처리 필요`; 예외 조치는 operations로 이동 |
| `teacher_signup` | `approve` / `reject` | 선생님 가입 | `teacher_applications.teacher_id` → `teachers.status` active/inactive |
| `student_signup` | `confirm` / `reject` | 학생 가입 | `student_registration_reviews` status update |
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
| POST | `/api/push/subscribe` | PWA 설치 안내/알림 구독 UI |
| POST | `/api/push/send` | cron/내부 | `push_subscriptions` | CRON_SECRET · VAPID 필수 |

---

## 5.8 API ↔ DB 매핑 검증 (2026-08)

| API 영역 | Primary tables | DDL | 런타임 |
|----------|----------------|-----|--------|
| pricing-plans | `pricing_plans` | ✅ 001 | **Supabase** |
| student/account | `profiles`, `students` | ✅ 001·004 | **Supabase** |
| enrollments | `enrollments`, `payments` | ✅ 001 | **Supabase** |
| lessons (all portals) | `lessons` | ✅ 001 | **Supabase** |
| availability | `teachers_weekly_availability` | ✅ 001 | **Supabase** |
| student-context | `teacher_student_context` | ✅ 001 | **Supabase** |
| learning | `lesson_feedbacks`, `monthly_growth_reports` | ✅ 001 | **Supabase** |
| reschedule | `lesson_reschedule_requests` | ✅ 001 | **Supabase** |
| salary | `teacher_salary_statements`, `salary_settings`, `teacher_bonuses`, `teacher_payroll_penalties` | ✅ 001 | **Supabase** |
| chat | `chat_rooms`, `chat_messages` | ✅ 001·006 | **Supabase** + Realtime |
| finance | `finance_transactions`, `finance_snapshots` | ✅ 001·006 | **Supabase** |
| admin ops logs | `admin_lesson_operation_logs` | ✅ 001 | **Supabase** |
| admin reviews | `admin_review_logs` | ✅ 001 | **Supabase** |
| teachers profile | `teachers` | ✅ 001 | **Supabase** |
| **faq** | `faq_items` | ✅ 003 | **Supabase** |
| **dashboard slogan** | `dashboard_settings` | ✅ 003 | **Supabase** |
| **teacher applications** | `teacher_applications` | ✅ 003 | **Supabase** |
| **student registration review** | `student_registration_reviews` | ✅ 005 | **Supabase** |

**공개 선생님 목록**: 랜딩·수강신청·`/teachers` 페이지는 **Server Component**에서 `ensurePublicContentBootstrapped()` → `getPublicTeachers()` 호출. `GET /api/teachers/public`은 Route Handler로 존재하나 **클라이언트 fetch 미사용** — 모바일/PWA 전환 시 사용.

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

- **보강**: 학생 월 2회 (`cancelled` 제외), pending 중복 불가. 생성·승인/거절/취소와 lesson 상태 변경은 migration 029 RPC 트랜잭션으로 원자 처리
- **피드백 POST** → `completeLesson` → `status=completed` → 급여 `duration_minutes` 반영
- **mark_student_absent** → `student_absent=true`, completed, 피드백 생략
- **급여**: `estimated` → `processing` → `paid`/`completed`; 정산 상태·재무 원장 연결은 migration 027~029 RPC로 원자 처리
- **분기 보너스**: 종료 월 + 가입일부터 3개 전체 월 충족 + 기간 내 리셋 없음 + 누적 수업시간 > 0일 때만 지급. live estimate에는 항상 0(migration 035 기존 오류 데이터 정리)

### 6.6 선생님 가입 (UI 2단계 · E2E 완료)

1. `POST /api/teacher/applications` — 개인정보 + **password** → Supabase `signUp(role=teacher)` + `teacher_applications` insert
2. `POST /api/teachers/profile` — **teacher Bearer 세션** 필수; `teachers.id = auth.uid()`, `status=pending`, `teacher_applications.teacher_id` 연결
3. 승인 전 `POST /api/auth/login` → `403 teacher_not_active`
4. 검토 센터 `teacher_signup` → `approve` — `teacher_applications.teacher_id` 기준 `teachers.status=active` (프로필 미완료 시 `profile_incomplete`)
5. 거절 시 `teachers.status=inactive` (연결된 경우) + application `rejected`

자동 검증: `npm run test:api:e2e` teacher signup 블록 · `npm run test:rls` migration 022

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
| `chat_rooms`, `chat_messages` | Chat list, thread | `/api/chat/rooms`, `/api/chat/messages` |

### 7.2 UI 사용 · DDL 003 포함 (✅ migration 003)

| 테이블 | UI | API |
|--------|-----|-----|
| `faq_items` | FAQ student/admin | `/api/faq`, `/api/admin/faq*` |
| `dashboard_settings` | Admin slogan | `/api/admin/dashboard-settings` |
| `teacher_applications` | Signup, review | `/api/teacher/applications`, reviews |

### 7.3 UI 사용 · DDL 005 포함 (✅ migration 005)

| 테이블 | UI | API |
|--------|-----|-----|
| `student_registration_reviews` | Review center student_signup | `/api/admin/reviews` student_signup |

### 7.4 UI 사용 · DDL 006 포함 (✅ migration 006)

| 테이블 / API | UI | API |
|--------------|-----|-----|
| `finance_transactions` | Finance dashboard | `/api/admin/finance/transactions` |
| `chat_messages` (+ Realtime) | Chat thread | `/api/chat/messages`, `useChatRealtime` |

### 7.5 Push · 알림 (✅)

| 테이블 | UI | API |
|--------|-----|-----|
| `push_subscriptions` | PWA subscribe | `/api/push/subscribe`, `/api/push/send` |
| `notifications` | (in-app, SW) | `/api/notifications`, click tracking |
| `admin_broadcasts` | `/admin/messages` | broadcast + cron + CTR |

### 7.6 구현하지 않음

- `teacher_availability_exceptions` — UI 없음
- `admin_broadcasts` — `/admin/messages` ✅
- `GET /api/admin/finance/summary` — `/api/admin/finance/transactions`로 대체
- **자동 시스템 알림 발송 엔진** — 규칙 저장만 (`system_notification_rules`)

---

## 8. RLS·트랜잭션 보안 (production — migration 017~035)

| Migration | 내용 |
|-----------|------|
| `017_production_rls.sql` | 역할 기반 RLS, demo policy 제거 |
| `018_fix_rls_auth.sql` | SECURITY DEFINER helpers, profiles 정책 |
| `019_fix_rls_recursion.sql` | students↔lessons 재귀 차단 |
| `020_fix_demo_admin_auth.sql` | demo-admin 로그인 수정 |
| `021_admin_direct_notification_type.sql` | `admin_direct` notification enum |
| `022_teacher_application_applicant_read.sql` | 지원자 본인 application 읽기 |
| `028_schema_rls_hardening.sql` | 스키마 무결성·누락 RLS 보강 |
| `029_transaction_and_column_security.sql` | 보강/급여 정산 RPC 원자화, profile·교사 단가 열 노출 제한 |

**적용·검증**: `npm run apply:rls` · `npm run test:rls` · `npm run test:schema-rls-boundaries` · `npm run test:transactions`

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

> bootstrap cache warm은 service role 경로 사용 — production hardening 시 최소화 검토.

---

## 9. Supabase 이전 체크리스트

| # | 작업 | 상태 | 검증 (UI) |
|---|------|------|-----------|
| 0 | 운영 DDL migration (`001`~`035`, 024는 seed로 이동) | ✅ | `npm run apply:rls` 또는 SQL Editor |
| 1 | Auth + `profiles.role` + API default deny | ✅ | `test:auth*`, `test:admin-page-auth` |
| 2 | `students` + activeLearner (`profiles.active_student_id`) | **✅** | StudentSwitcher |
| 3 | **`pricing_plans` + `session_minutes`** | **✅** | 랜딩·`/admin/pricing` CRUD·40/60분 |
| 4 | availability + slot continuity | **✅** | TeacherSlotPicker |
| 5 | enrollments + payments flow | **✅** | confirm → lessons 생성 |
| 6 | `adjust_sessions` batch | **✅** | 학생상세 수업 횟수 관리 |
| 7 | lesson operations + logs + undo | **✅** | `/admin/operations` |
| 8 | admin reviews 4 categories | **✅** | `/admin/reschedule` — 전 카테고리 Supabase |
| 9 | salary statements | **✅** | teacher + admin salary |
| 10 | FAQ | **✅** | student + admin |
| 11 | `pricing_plans` RLS + admin mutation auth | ✅ | GET public, mutation admin only |
| 12 | migration **003**: faq, dashboard_settings, teacher_applications | ✅ | `003_*.sql` |
| 12b | migration **005**: student_registration_reviews | ✅ | `005_*.sql` |
| 12c | migration **006**: finance_transactions + chat Realtime | ✅ | `006_*.sql` |
| 13 | teachers profile + student context | **✅** | 랜딩·수업 상세 |
| 14 | admin review logs + operation logs | **✅** | 검토·운영 센터 로그 |
| 15 | payroll penalties + salary adjustments | **✅** | 노쇼·수기 가감 |
| 16 | **chat** rooms + messages → Supabase | ✅ | `/api/chat/rooms`, `/api/chat/messages`, Realtime |
| 17 | **student_registration_reviews** DDL + migration | ✅ | 검토 센터 student_signup |
| 18 | **finance_transactions** + snapshots | ✅ | `/api/admin/finance/transactions`, paid·입금 확인 hook |

---

## 10. 환경 변수

```env
# Supabase (pricing_plans 연동 — anon key 필수)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # bootstrap cache warm, admin mutation, RLS 테스트 (필수)

# App
NEXT_PUBLIC_APP_URL=
BANK_ACCOUNT_KR=
BANK_ACCOUNT_CN=

# Web Push (Phase 2)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@passonenglish.com

# Cron (Vercel Cron → /api/cron/*)
CRON_SECRET=
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
| Chat pages, `ChatNotificationBell`, `ChatThread` | chat/rooms, chat/messages |
| `FinanceDashboard` | `/api/admin/finance/transactions` |
| teacher signup | teacher/applications, teachers/profile |
| `[locale]/page`, enrollment/new | **SSR** `ensurePublicContentBootstrapped()` + `getPublicTeachers()` |

---

## 12. 문서 관계

| 문서 | 역할 |
|------|------|
| **front.md** | 화면·라우팅·UX |
| **backend.md** (본 문서) | API·비즈니스·구현 범위 |
| **db.md** | DDL·ENUM·인덱스 상세 |
| **guide.md** | 로컬 실행·데모 |

변경 시 **UI → Route Handler → store 로직 → db.md** 순으로 동기화한다.
