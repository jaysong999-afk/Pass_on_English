# Pass on English — 백엔드 개발 요청 명세서

## 0. MVP 구현 현황 (2026-08)

현재 프로덕션 DB(Supabase) 연동 전 **Next.js Route Handlers + in-memory store** 로 UI·플로우를 검증 중이다.

| 영역 | store / 모듈 | API prefix | 비고 |
|------|--------------|------------|------|
| 선생님 수업 | `teacher-lesson-store.ts` | `/api/teacher/lessons` | 완료·스케줄·Live demo 날짜 |
| 학생 컨텍스트 | `teacher-student-context-store.ts` | `/api/teacher/student-context` | 교재·Special Notes |
| 보강(일정 변경) | `reschedule-store.ts` | `/api/lessons/reschedule` | 승인·거절·취소 |
| 수업 피드백 | `learning-store.ts` | `/api/learning/feedback` | progressPages, 완료 연동 |
| 월 성장 레포트 | `learning-store.ts` | `/api/learning/reports` | 필드 구조 변경 (§5.9) |
| 선생님 급여 | `teacher-salary-store.ts` | `/api/teacher/salary`, `/api/admin/teacher-salary` | 월별 명세서 |
| 가능 시간 | `teacher-availability-store.ts` | `/api/teacher/availability` | KST 저장, PHT 표시 |
| 선생님 프로필 | `teacher-profile-store.ts` | `/api/teachers/profile` | 관리자 CRUD |
| 요금제 | `pricing-plan-store.ts` | `/api/pricing-plans` | 관리자 CRUD |
| 수강 | `enrollment-store.ts` | `/api/enrollments` | |
| 채팅 | `chat-store.ts` | `/api/chat/rooms` | learner별 room |
| **계정·수강생** | `account-store.ts` | `/api/student/account`, `/api/student/learners` | account_holder + learners |
| **수업 운영** | `lesson-operations-store.ts` | `/api/admin/lessons/[id]`, `bulk-reassign` | 대체·노쇼·무급취소·일정변경 |
| **수업 조치 로그** | `admin-lesson-operation-log-store.ts` | `/api/admin/lessons/operation-logs` | 주간 로그·undo |
| **관리자 검토** | `admin-review-store.ts`, `admin-review-log-store.ts` | `/api/admin/reviews` | 4카테고리 승인·로그 |
| **급여 패널티** | `teacher-payroll-penalty-store.ts` | (lesson-operations 내부) | 노쇼 시 만근/분기 보너스 리셋 |
| **스케줄 생성** | `lesson-scheduler.ts` | enrollment confirm 시 | 잔여 회차 lesson 생성 |

> Supabase 마이그레이션 시 위 store 로직을 RPC/RLS로 이전한다.

---

## 1. 개요

| 항목 | 내용 |
|------|------|
| 아키텍처 | Next.js Route Handlers + Supabase (BaaS) |
| DB | Supabase PostgreSQL |
| Auth | Supabase Auth |
| Realtime | Supabase Realtime |
| Storage | Supabase Storage (프로필 이미지) |
| 배포 | Tencent Cloud 홍콩 리전 |

본 문서는 API, 비즈니스 로직, Edge Functions, 알림, 권한, 배치 작업을 정의한다. 별도 Express/Nest 서버 없이 **Supabase + Next.js API** 를 기본으로 한다.

---

## 2. 아키텍처

```
[Client PWA]
    ↓ HTTPS
[Next.js App (Tencent Cloud HK)]
    ├── Route Handlers (/api/*)
    ├── Server Actions (선택)
    └── Middleware (auth, locale)
    ↓
[Supabase]
    ├── PostgreSQL + RLS
    ├── Auth
    ├── Realtime
    ├── Storage
    └── Edge Functions (선택: 급여 계산, Push 발송)
```

---

## 3. 인증·역할

### 3.1 Supabase Auth

- 가입 시 `raw_user_meta_data.role`: `student` | `teacher` | `admin`
- 학생: `country` (KR | CN), `locale`, 설문 결과
- 선생님: **자가 회원가입** → `teachers.status = pending` → **관리자 승인 후 `active`** (아래 §3.5)

### 3.5 선생님 자가 회원가입 · 관리자 승인 (Teacher Self-Registration)

#### 플로우

```
[선생님] /teacher/signup — Step 1: Registration 폼 제출
    → POST /api/teacher/signup (또는 dev: localStorage)
    → applicationId 발급

[선생님] /teacher/signup/profile?applicationId=… — Step 2: 공개 프로필 작성
    → POST /api/teachers/profile { applicationId, displayName, bio, specialties[], experienceYears }
    → teachers 레코드 생성 (status=pending, profile_completed=true)
    → /teacher/signup/complete 안내

[관리자] /admin/teachers 에서 pending 신청 목록 조회
    → PATCH /api/admin/teachers/applications/[id]/approve
        → teachers.status = active
        → 승인 이메일 / Push (선택)
    → PATCH .../reject
        → status = rejected

[관리자] /admin/teacher-profiles — 공개 프로필 CRUD (랜딩·수강신청 연동)
    → GET/PUT /api/teachers/profile/[id]
```

선생님 포탈에는 **Profile 탭 없음**. 프로필 수정은 관리자만 `/admin/teacher-profiles`에서 수행.
랜딩·수강신청에는 `status=active` **且** `profile_completed=true` 인 선생님만 노출 (`GET /api/teachers/public`).

#### 회원가입 입력 필드 (프론트 `/teacher/signup`)

| 필드 | JSON key | 필수 | 검증 | 비고 |
|------|----------|------|------|------|
| 이름 | `fullName` | ✅ | 2~100자 | teachers.display_name 초기값 |
| 생년월일 | `dateOfBirth` | ✅ | ISO date `YYYY-MM-DD`, 만 18세 이상 권장 | |
| 전화번호 | `phone` | ✅ | E.164 또는 지역 형식 | |
| 계좌번호 | `bankAccount` | ✅ | 숫자·하이픈, 8~30자 | 급여 지급용, RLS로 본인·admin만 |
| Facebook Messenger ID | `facebookMessengerId` | ✅ | 1~200자 | URL 또는 프로필 ID |
| 주소 | `address` | ✅ | 1~500자 | |
| 이메일 | `email` | ✅ | email 형식, unique | Supabase Auth login |
| 비밀번호 | `password` | ✅ | min 8자 | Auth에만 저장, DB 평문 금지 |

#### API (추후 구현)

| Method | Path | Auth | 설명 |
|--------|------|------|------|
| POST | `/api/teacher/signup` | public | 가입 신청. Auth user + pending teacher 생성 |
| GET | `/api/teacher/signup/status` | teacher | 본인 신청 상태 (`pending` / `approved` / `rejected`) |
| GET | `/api/admin/teachers/applications` | admin | pending 포함 전체 신청 목록 |
| GET | `/api/admin/teachers/applications/[id]` | admin | 신청 상세 |
| PATCH | `/api/admin/teachers/applications/[id]/approve` | admin | 승인 → `teachers.status=active`, 시급 등 설정 body 허용 |
| PATCH | `/api/admin/teachers/applications/[id]/reject` | admin | 거절. body: `{ reason?: string }` |

#### Step 2 — 공개 프로필 (회원가입 직후 `/teacher/signup/profile`)

| 필드 | JSON key | 필수 | 비고 |
|------|----------|------|------|
| 표시 이름 | `displayName` | ✅ | 랜딩·수강신청에 노출 |
| 소개 | `bio` | ✅ | |
| 전문 분야 | `specialties` | ✅ | 복수 선택. 아래 고정 목록 |
| 경력(년) | `experienceYears` | ✅ | ≥ 0 |

**Specialties (multi-select, 고정 목록)**

`Beginners`, `Adult`, `Phonics`, `Business`, `Debate`, `IELTS Speeking`, `Storytelling`, `Patient`, `Energetic`, `Encouraging`, `Friendly`, `Interactive`, `Detail-Oriented`, `Academic`, `Interview Prep`

| Method | Path | Auth | 설명 |
|--------|------|------|------|
| POST | `/api/teachers/profile` | public (applicationId) | 가입 Step 2 프로필 저장 |
| GET | `/api/teachers/profile` | admin | 전체 선생님 프로필 목록 |
| GET | `/api/teachers/profile?scope=public` | public | active + profile_completed 목록 |
| GET | `/api/teachers/profile/[id]` | admin | 단일 프로필 |
| PUT | `/api/teachers/profile/[id]` | admin | 프로필 수정 (status, hourlyRatePhp 포함) |

**POST `/api/teachers/profile` 요청 예시**

```json
{
  "applicationId": "uuid",
  "displayName": "Maria Santos",
  "bio": "10 years ESL with kids and adults…",
  "specialties": ["Beginners", "Phonics", "Friendly"],
  "experienceYears": 10,
  "email": "maria@email.com",
  "fullName": "Maria Santos"
}
```

**POST `/api/teacher/signup` 요청 예시**

```json
{
  "fullName": "Maria Santos",
  "dateOfBirth": "1990-05-12",
  "phone": "+639171234567",
  "bankAccount": "1234-5678-9012",
  "facebookMessengerId": "maria.santos.fb",
  "address": "Quezon City, Metro Manila, Philippines",
  "email": "maria@email.com",
  "password": "securePass123"
}
```

**성공 응답 (201)**

```json
{
  "applicationId": "uuid",
  "status": "pending",
  "message": "Application submitted. Admin will review within 1-2 business days."
}
```

**에러 코드**

| code | HTTP | 설명 |
|------|------|------|
| `email_taken` | 409 | 이미 등록된 이메일 |
| `validation_error` | 400 | Zod 검증 실패 |
| `signup_disabled` | 503 | 관리자가 가입 중단 설정 시 |

#### DB 스키마 (추가)

```sql
-- teachers 테이블 확장 (또는 teacher_profiles)
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS
  date_of_birth date,
  phone text,
  bank_account text,          -- 암호화 컬럼 권장 (pgsodium)
  facebook_messenger_id text,
  address text,
  application_status text DEFAULT 'pending'
    CHECK (application_status IN ('pending','approved','rejected'));

-- 선택: 신청 이력 분리
CREATE TABLE teacher_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  full_name text NOT NULL,
  date_of_birth date NOT NULL,
  phone text NOT NULL,
  bank_account text NOT NULL,
  facebook_messenger_id text NOT NULL,
  address text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  rejected_reason text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
```

#### 로그인 제한

- `teachers.status !== 'active'` (pending / rejected / inactive) 인 계정은 **POST /auth/login 후에도** `/teacher/*` 접근 차단
- middleware: session role=teacher 이면서 `teachers.status=pending` → `/teacher/signup/complete` 또는 "승인 대기" 전용 페이지로 리다이렉트

#### 프론트엔드 (현재 MVP)

| 경로 | 상태 |
|------|------|
| `/teacher/signup` | UI 완료. 제출 시 **localStorage** 임시 저장 (API 연동 전) |
| `/teacher/signup/complete` | 승인 대기 안내 |
| `/admin/teachers` | localStorage 기반 pending 목록·승인/거절 UI (mock) |
| `/admin/teachers/applications/[id]` | 신청 상세 |

> API 구현 시 localStorage 로직 제거하고 위 엔드포인트로 교체.

### 3.2 JWT Custom Claims (선택)

- `app_metadata.role` 로 RLS 정책과 middleware 역할 검증 통일

### 3.3 API 인증

- 모든 `/api/*` (public 제외): Supabase session 또는 service role (내부 cron만)
- `createServerClient` (@supabase/ssr) 로 쿠키 기반 세션

### 3.4 역할별 진입점·미들웨어

| 경로 prefix | 필수 role | 미인증 시 리다이렉트 |
|-------------|-----------|---------------------|
| `/[locale]/*`, `/student/*` | `student` (portal만) | `/[locale]/login` |
| `/teacher/login` | — (public) | — |
| `/teacher/signup` | — (public) | — |
| `/teacher/signup/complete` | — (public) | — |
| `/teacher/*` | `teacher` + **status=active** | `/teacher/login` 또는 승인 대기 페이지 |
| `/admin/login` | — (public) | — |
| `/admin/*` | `admin` | `/admin/login` |

- `next-intl` middleware: **`ko`, `zh-CN`만** — `/teacher`, `/admin`, `/student`, `/api`는 제외
- `/` 접속: `Accept-Language`에 `zh` 포함 → `/zh-CN`, 그 외 `/ko`
- **`/en` 및 영문 랜딩 미제공** — 잘못된 locale → 404
- 선생님·관리자 계정은 Supabase Auth `role` claim으로 구분; 학생 가입 플로우와 **분리**

---

## 4. API 엔드포인트

> **MVP (2026-08)**: 아래 ✅ 표시는 Route Handler + in-memory store로 **구현 완료**된 항목이다. Supabase 연동 시 동일 계약(contract)을 유지한다.

### 4.1 Public · 공통

| Method | Path | 설명 | MVP |
|--------|------|------|-----|
| GET | `/api/health` | 헬스체크 | ✅ |
| GET | `/api/teachers/public` | 랜딩용 공개 선생님 목록 | ✅ |
| GET/POST | `/api/teachers/profile` | Step2 프로필·관리자 목록 | ✅ |
| GET/PUT | `/api/teachers/profile/[id]` | 관리자 프로필 CRUD | ✅ |
| GET | `/api/pricing-plans` | 요금제 목록 | ✅ |
| POST/PUT/DELETE | `/api/pricing-plans/[id]` | 요금제 CRUD (admin) | ✅ |
| GET/PATCH | `/api/chat/rooms` | 채팅방 목록·읽음·`studentId`로 room ensure | ✅ |
| POST | `/api/push/subscribe` | Web Push 구독 | ✅ |
| POST | `/api/push/send` | Push 발송 (내부) | ✅ |

### 4.2 학생 (role: student)

| Method | Path | 설명 | MVP |
|--------|------|------|-----|
| POST | `/api/student/account` | 계정·첫 learner 등록 | ✅ |
| GET | `/api/student/account` | account + learners + activeLearner | ✅ |
| PATCH | `/api/student/account` | switch_learner, book_trial, survey | ✅ |
| POST | `/api/student/learners` | 자녀(learner) 추가 | ✅ |
| GET/PATCH | `/api/student/profile` | (legacy) active learner 프로필 | ✅ |
| GET | `/api/enrollments` | 수강 목록 | ✅ |
| POST | `/api/enrollments` | 입금 신고 → pending enrollment | ✅ |
| PATCH | `/api/enrollments/[id]` | 관리자 입금 확인·거절 | ✅ |
| PATCH | `/api/enrollments/[id]/sessions` | 잔여 회차 조정 (admin) | ✅ |
| GET | `/api/teacher/lessons?scope=student&studentId=` | 내 수업 목록 | ✅ |
| GET/POST/PATCH | `/api/learning/feedback?studentId=` | 피드백 조회·읽음 | ✅ |
| GET/POST/PATCH | `/api/learning/reports?studentId=` | 월 성장 레포트 | ✅ |
| GET/POST/PATCH | `/api/lessons/reschedule?studentId=` | 보강 요청·승인·취소 | ✅ |

### 4.3 선생님 (role: teacher)

| Method | Path | 설명 | MVP |
|--------|------|------|-----|
| GET/PUT | `/api/teacher/availability` | 가능 시간 (toggle/copy/reserve) | ✅ |
| GET | `/api/teacher/lessons` | My Lessons 허브 (next/today/action) | ✅ |
| GET | `/api/teacher/lessons?scope=all` | 전체 수업 (Schedule 캘린더) | ✅ |
| GET | `/api/teacher/lessons/[id]` | 수업 상세 + display context | ✅ |
| GET/PUT | `/api/teacher/student-context` | 교재·Special Notes·ZOOM/VOOV | ✅ |
| GET | `/api/teacher/salary?month=YYYY-MM` | 월별 급여 명세서 | ✅ |
| POST | `/api/learning/feedback` | 피드백 작성 → `completeLesson` | ✅ |
| GET/POST | `/api/learning/reports?teacherId=` | 월 성장 레포트 작성·조회 | ✅ |
| GET/POST/PATCH | `/api/lessons/reschedule?teacherId=` | 보강 요청·승인·취소 | ✅ |
| GET | `/api/chat/rooms?role=teacher&studentId=` | 학생별 채팅방 ensure | ✅ |

### 4.4 관리자 (role: admin)

| Method | Path | 설명 | MVP |
|--------|------|------|-----|
| GET/PATCH | `/api/admin/teacher-salary` | 급여 명세 조회·상태 변경·정산 확정 | ✅ |
| GET | `/api/lessons/reschedule?scope=all` | 전체 보강 진행 현황 | ✅ |
| GET | `/api/teachers/profile` | 선생님 프로필 목록 | ✅ |
| GET/PUT | `/api/teachers/profile/[id]` | 프로필 수정 | ✅ |
| GET/POST/PATCH | `/api/pricing-plans` | 요금제 관리 | ✅ |
| PATCH | `/api/enrollments/[id]/sessions` | 회차 가감 | ✅ |
| GET | `/api/admin/lessons` | 관리자 수업 목록 | ✅ |
| GET/PATCH | `/api/admin/lessons/[id]` | 수업 조치 (대체·노쇼·취소·변경) | ✅ |
| GET/POST | `/api/admin/lessons/bulk-reassign` | enrollment 일괄 이관 preview·실행 | ✅ |
| GET | `/api/admin/lessons/operation-logs?teacherId&weekStart` | 수업 조치 로그 (주간) | ✅ |
| POST | `/api/admin/lessons/operation-logs/[id]/undo` | 노쇼·무급취소 되돌리기 | ✅ |
| GET/PATCH | `/api/admin/reviews` | 검토 센터 snapshot·처리 | ✅ |

### 4.5 추후 구현 (목표 아키텍처)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/teacher/signup` | 선생님 자가 가입 (§3.5) |
| GET/PATCH | `/api/admin/teachers/applications/[id]/*` | 가입 승인·거절 |
| POST | `/api/student/payments/report` | 입금 완료 신고 |
| PATCH | `/api/admin/students/[id]/payment` | 입금 확인 |
| GET | `/api/admin/finance/summary` | 재무 집계 |
| POST | `/api/admin/messages/broadcast` | 대상별 메시지/푸시 |

---

## 5. 핵심 비즈니스 로직

### 5.0 계정(account_holder) vs 수강생(learner)

| 개념 | DB | MVP store | 설명 |
|------|-----|-----------|------|
| 로그인 계정 | `profiles` | `AccountHolder` | email, phone, full_name(입금자) |
| 수강생 | `students` | `Learner` | english_name, trial_used, 설문 |
| 관계 | 1:N | `account-store` | guardian → 자녀 여러 명 |

- **본인 수강** (`account_type=self`): account 1명 = learner 1명 (동일 이름 가능)
- **자녀 수강** (`account_type=guardian`): 부모 account + learner(들)
- API·UI는 **`activeLearnerId`** 로 My Lessons / Learning / Chat / Enrollment 스코프
- `POST /api/enrollments`: `studentId`=learner.id, `depositorName`=account.full_name

---

**플로우 (MVP 구현)**

1. 회원가입 → `trial_used = false`, `payment_status = pending`
2. 온보딩 설문 → `/student/enrollment/new`
3. 플랜·선생님·**20분 타임슬롯** 선택 → `PATCH /api/student/profile` `{ action: "book_trial" }`
   - `lessons` 에 `is_trial=true`, `duration_minutes=20` 체험 수업 생성
   - availability `reserve` 로 슬롯 마감
4. 결제 안내 화면 → 학생 입금 후 `POST /api/enrollments` (입금 신고)
   - `enrollments.status = pending_payment`, `payment_status = reported`
5. 관리자 `PATCH /api/enrollments/[id]` `{ action: "confirm_payment" }`
   - `enrollments.status = active`, `payment_status = confirmed` → **신청 완료**

### 5.2 수강 신청·결제

**수업 시간 정책 (통일)**

- 모든 수업: **20분 세션**, **20분 그리드** (`SLOT_BLOCK_MINUTES=20`, `LESSON_MINUTES=20`, `:00/:20/:40`)
- 요금제 `session_minutes` = 20 (관리자 CRUD로 20/25/30/40 등 가변; `ceil(session_minutes/20)` 슬롯 점유)

**요금제 (4종, MVP seed)**

| 이름 | 요일 | 회차 | KRW | CNY |
|------|------|------|-----|-----|
| 주5회(월~금) 20분 | Mon–Fri | 20 | 87,000 | 480 |
| 월·수·금 20분 | Mon, Wed, Fri | 12 | 90,000 | 490 |
| 화·목 20분 | Tue, Thu | 8 | 64,000 | 340 |
| 주말(토·일) 20분 | Sat, Sun | 8 | 64,000 | 340 |

1. 학생이 플랜·선생님·슬롯 선택 → (체험 시) trial lesson 생성
2. 입금 안내 → 학생 "입금 완료" 신고 → `POST /api/enrollments`
3. 관리자 입금 확인 → `confirm_payment` → enrollment `active`

**재수강 (`renewFromEnrollmentId`)**

- `POST /api/enrollments` body에 `renewFromEnrollmentId` 포함
- `createRenewalEnrollment()`: 이전 enrollment의 plan·teacher·`preferredSlotTime`·`preferredSlotDay` 유지
- 입금 확인 시 `scheduleLessonsForConfirmedEnrollment` + `reserveTeacherWeeklySlotsForPlan`

**다중 슬롯 점유**

- `session_minutes` > 20 인 플랜: `ceil(session_minutes / SLOT_BLOCK_MINUTES)` 개의 연속 20분 블록 점유
- `occupiedSlotStarts()`, `isTeacherSlotFree()` — 예약·충돌 검사 시 전체 블록 검증

### 5.3 보강(일정 변경)

**상태 (`reschedule_status`)**

| 값 | 설명 |
|----|------|
| `pending_student_approval` | 선생님 발신 → 학생 승인 대기 |
| `pending_teacher_approval` | 학생 발신 → 선생님 승인 대기 |
| `approved` | 승인 완료, `lessons.scheduled_at` 갱신 |
| `rejected` | 거절, 수업은 원래 일정 유지 |
| `cancelled` | 요청자가 pending 중 취소, 수업 `scheduled` 복귀 |

**흐름**

| 발신 | 흐름 |
|------|------|
| 학생 | POST request → `pending_teacher_approval` → teacher approve/reject |
| 선생님 | POST request → `pending_student_approval` → student approve/reject |

**API (`/api/lessons/reschedule`)**

| action (PATCH body) | 설명 |
|---------------------|------|
| `approve` | 상대방 승인 → `scheduled_at` 갱신, status `approved` |
| `reject` | 상대방 거절 |
| `cancel` | **요청자 본인**만 pending 중 취소 |

**제한**

- 학생: `request_month` 기준 월 2회 (`cancelled` 제외)
- 선생님: 월별 제한 없음
- pending 중 동일 lesson에 중복 요청 불가

### 5.4 수업 완료·피드백

- `POST /api/learning/feedback` — 피드백 저장 시 `completeLesson(lessonId)` 호출 → `lessons.status: scheduled → completed`
- 필드: `feedback`, `homework`, `progressPages`(교재 진도 페이지), `topic`(optional)
- `PATCH /api/teacher/lessons/[id]` — `{ action: "mark_student_absent" }` → `completeLessonAsStudentAbsent` (피드백 없이 완료, `student_absent: true`, 급여 산정 포함)
- 완료 시 `lesson.duration_minutes` 로 급여 산정용 `teacher_hours` 누적

### 5.5 급여 (월별 명세서)

**MVP**: `teacher-salary-store.ts` — 현재 월은 live estimate, 과거 월은 seeded statement.

**상태 (`salary_payout_status`)**: `estimated` → `processing` → `paid`

**명세서 필드**

```
baseSalary = totalHours × hourlyRate
total = baseSalary + perfectAttendanceBonus + quarterlyBonus + otherIncentives - deductions
```

**API**

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/teacher/salary?month=YYYY-MM` | 선생님 본인 명세서 |
| GET | `/api/admin/teacher-salary` | 전체 명세 목록 |
| PATCH | `/api/admin/teacher-salary` | status 변경, live estimate → processing 확정 |

**보너스 정책 (UI Zone 1에 표시)**

- 만근: 25 PHP/시간 × 해당 월 수업 시간
- 분기: 300h↑ 2,000 / 150~299h 1,300 / ↓150h 700 PHP
- 기타: 관리자 수동 입력 (`teacher_bonuses`)

### 5.6 재무

**수입**: 학생 `payments` confirmed 금액 (KRW/CNY 통화별)  
**지출**: 선생님 급여 (PHP → 보고용 KRW 환산은 관리자 입력 환율 또는 고정값)  
**집계**: 월·분기·년 — materialized view 또는 API aggregation

### 5.7 주간 가능 시간 그리드 (Availability Sheet)

#### 규칙

- 슬롯 단위: **20분** (`:00` / `:20` / `:40` — `SLOT_BLOCK_MINUTES=20`, `normalizeSlotStart`)
- 수업 구성: **20분 세션** (기본) — 시스템 휴식 없음; 휴식은 선생님이 슬롯 Off
- **그리드 범위 (저장 기준)**: KST `06:00` ~ `24:00` (마지막 시작 `23:40`)
- 저장 형식: `teachers_weekly_availability` — `teacher_id`, `day` (Mon–Sun), `start_time` (HH:mm, **KST**)
- UI 표시:
  - 선생님 포탈: **PHT (Asia/Manila)** — 그리드 행 라벨
  - 학생 포탈 (ko): **KST (Asia/Seoul)**
  - 학생 포탈 (zh-CN): **CST (Asia/Shanghai)**
- 학생 노출: `GET /api/teacher/availability?teacherId=&planDays=` → **enabled ∧ plan 요일 ∧ NOT booked**

#### 예약(마감) 판정

```
booked(start) = EXISTS lesson WHERE teacher_id AND status IN (scheduled, reschedule_pending, pending_payment)
         AND lesson occupies grid block (day, start)
         -- duration_minutes > 20 이면 occupiedSlotStarts() 로 연속 블록 전체 마감
```

- 수강 신청·체험 예약 시 해당 주간 슬롯 즉시 reserve → 다른 학생 선택 불가
- 선생님 Schedule 탭: enabled + booked 오버레이 (추후 UI 재설계)

#### PUT `/api/teacher/availability` actions

| action | body | 설명 |
|--------|------|------|
| (default) | `{ slots: { Mon: ["09:00",...], ... } }` | 전체 그리드 저장 |
| `toggle` | `{ day, startTime }` | 단일 셀 토글 |
| `copy` | `{ sourceDay, targetDays[] }` | 요일 간 일괄 복사 |
| `reserve` | `{ day, startTime, studentName?, planDays? }` | 학생 예약 시 마감 |

### 5.8 선생님–학생 컨텍스트 (TeacherStudentContext)

- `GET/PUT /api/teacher/student-context?studentId=&teacherId=`
- 필드: `textbook`, `videoPlatform` (`ZOOM` | `VOOV`), `specialNotes`
- 수업 카드·상세에 `buildLessonDisplayContext()` 로 병합 표시
- 교재·Special Notes: 선생님 UI에서 Edit/Save 패턴으로 인라인 수정

### 5.9 월 성장 레포트 (MonthlyGrowthReport)

| 필드 | UI 라벨 (en) |
|------|--------------|
| `lessonsCovered` | What We Covered This Month |
| `progressMade` | Progress Made |
| `areasToWorkOn` | Areas to Work On |
| `nextMonthGoals` | Next Month's Goals |
| `overallComment` | Teacher's Overall Comment |

- `GET/POST /api/learning/reports?teacherId=` — 선생님 작성·학생별 필터
- `GET /api/learning/reports?studentId=` — 학생 조회
- `PATCH ?id=&action=read` — 학생 읽음 처리
- ~~`sessionsCompleted`, `summary`, `strengths`, `improvements`, `goals`~~ — **폐기** (2026-08)

### 5.10 관리자 수업 운영 (`lesson-operations-store`)

**API**: `GET/PATCH /api/admin/lessons/[id]`, `GET/POST /api/admin/lessons/bulk-reassign`

| PATCH action | 설명 | 부수 효과 |
|--------------|------|-----------|
| `assign_substitute` | 대체 선생님 배정 | `originalTeacherId` 보존 |
| `teacher_no_show` | 선생님 노쇼 | 원 수업 cancelled+`teacherNoShow` · 보강 lesson 생성 · enrollment **+1회** · `applyTeacherNoShowPenalty` |
| `cancel_unpaid` | 무급 취소 | lesson **삭제** · enrollment **−1회** · 슬롯 Available |
| `reschedule` | 관리자 일정 변경 | `scheduledAt` 갱신 (20분 그리드 스냅) |

- 모든 조치는 `admin-lesson-operation-log-store`에 기록 (`weekStartKey` = 수업 예정 주 월요일 KST)
- **Undo** (`POST /api/admin/lessons/operation-logs/[id]/undo`): `teacher_no_show`, `cancel_unpaid` 만 — 보강 삭제·수업 복구·회차·패널티 되돌림

### 5.11 관리자 검토 센터 (`admin-review-store`)

**API**: `GET/PATCH /api/admin/reviews`

| category | action | 대상 |
|----------|--------|------|
| `reschedule` | `approve` / `reject` | `LessonRescheduleRequest` |
| `teacher_signup` | `approve` / `reject` | `TeacherApplication` |
| `student_signup` | `confirm` / `reject` | `StudentRegistrationReview` |
| `payment_activation` | `activate` / `reject` | reported enrollment |

- 처리 시 `admin-review-log-store`에 `AdminReviewLogEntry` append
- GET snapshot: pending 큐 4종 + 카테고리별 최근 로그

---

## 6. 채팅

### 6.1 모델

- `chat_rooms`: student_id + teacher_id (enrollment당 1 room)
- `chat_messages`: room_id, sender_id, body, created_at, read_at

### 6.2 Realtime

- Supabase Realtime `chat_messages` INSERT 구독
- 새 메시지 → 수신자 Web Push (구독 있을 때)

### 6.3 관리자 메시지

- `admin_broadcasts` + 개별 `chat_messages` (system sender) 또는 Push only
- Instagram DM 스타일: 동일 thread UI, `sender_role = admin` 표시

---

## 7. 알림 (Web Push)

### 7.1 VAPID

- 환경 변수: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- Route Handler `POST /api/push/send` — service role, 내부 호출 only

### 7.2 트리거 이벤트

| 이벤트 | 수신자 |
|--------|--------|
| payment_request | student |
| payment_confirmed | student |
| reschedule_request | teacher / student |
| reschedule_result | requester |
| new_chat_message | counterpart |
| admin_broadcast | target users |

### 7.3 구현

- DB trigger → Supabase Edge Function → web-push 라이브러리  
  또는 Next.js API + pg_net / cron polling (MVP는 API 직접 호출 허용)

---

## 8. Supabase Edge Functions (권장)

| Function | 용도 |
|----------|------|
| `calculate-monthly-salary` | cron 월말 정산 |
| `send-push-notification` | 메시지 큐 처리 |
| `reset-monthly-reschedule-count` | 매월 1일 학생 보강 카운트 리셋 |

---

## 9. Row Level Security (RLS) 요약

| 테이블 | student | teacher | admin |
|--------|---------|---------|-------|
| profiles | own | own | all |
| teachers | read active | own | all |
| enrollments | own | assigned | all |
| lessons | own enrollment | own lessons | all |
| lesson_feedbacks | read own | write own | all |
| payments | own | — | all |
| chat_messages | room member | room member | all |
| salary_settings | — | — | all |
| finance_* | — | — | all |

- Service role key는 서버 전용, 클라이언트 노출 금지

---

## 10. Storage

| Bucket | 경로 | 접근 |
|--------|------|------|
| `avatars` | `{user_id}/profile.jpg` | public read, owner write |
| `teacher-media` | `{teacher_id}/*` | public read, teacher write |

---

## 11. 환경 변수

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Web Push
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@passonenglish.com

# App
NEXT_PUBLIC_APP_URL=
BANK_ACCOUNT_KR=
BANK_ACCOUNT_CN=

# Optional
EXCHANGE_RATE_PHP_TO_KRW=
```

---

## 12. 배포·운영 (Tencent Cloud HK)

- Next.js: Docker → CVM 또는 TKE, 또는 EdgeOne + 정적/SSR
- Supabase: Self-host on Tencent HK **또는** Supabase Cloud (리전·중국 접속 latency 테스트 필수)
- 도메인: ICP 없이 HK 리전으로 한·중 접속 가능하도록 DNS
- HTTPS 필수 (PWA, Push)
- 로그: Tencent CLS 또는 Supabase logs
- 백업: Supabase daily backup

---

## 13. 보안

- RLS 모든 테이블 활성화
- Rate limiting: `/api/auth/*`, `/api/chat/*` (middleware 또는 Tencent WAF)
- Input validation: Zod on all Route Handlers
- Admin API: role double-check server-side
- CORS: same-origin only (API는 Next 동일 도메인)

---

## 14. MVP API 우선순위

| Phase | 상태 | API / 기능 |
|-------|------|------------|
| P0 | ✅ | Auth UI, onboarding, teacher list, enrollment, availability, pricing CRUD |
| P1 | ✅ | **My Lessons** hub, lesson detail, student-context, reschedule (approve/reject/cancel), feedback+complete |
| P1 | ✅ | Chat rooms, growth reports, teacher salary statements |
| P1 | ✅ | Admin: teacher-profiles, pricing, **operations center**, **review center**, teacher-salary |
| P2 | ✅ | Trial → payment report → admin confirm enrollment; **renewal enrollment** |
| P2 | ⏳ | Teacher signup + admin approve (localStorage prototype) |
| P3 | ⏳ | Supabase migration, RLS, Realtime, cron settlement |

---

## 15. 제외 사항

- Zoom / 화상 SDK 연동
- PG·카드·위챗페이 결제
- SMS OTP (이메일 인증만 MVP)
