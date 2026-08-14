# Pass on English — 프론트엔드 명세서

## 0. MVP 구현 현황 (2026-08)

| 영역 | 상태 | 비고 |
|------|------|------|
| **계정·learner 분리** | ✅ | `account-store`, `StudentSwitcher` |
| 랜딩·학생 포털 | ✅ | ko/zh-CN, learner별 My Lessons |
| **재수강(renewal)** | ✅ | 기존 플랜·선생님·시간 유지, 결제만 |
| **20분 타임슬롯** | ✅ | `:00/:20/:40` 그리드, 휴식=슬롯 Off |
| 선생님 포털 | ✅ | My Lessons, Schedule, Salary(보너스 EN), Growth Reports |
| **관리자 운영 센터** | ✅ | `/admin/operations` — 스케줄·수업 조치·로그·되돌리기 |
| **관리자 검토 센터** | ✅ | `/admin/reschedule` — 4탭 + 처리 로그 |
| 관리자 포털 | ✅ | teacher-profiles, pricing, teacher-salary, FAQ |
| **학생 모바일 헤더** | ✅ | `StudentAppShell` 2-row 레이아웃 |
| **관리자 수업 횟수 관리** | ✅ | `EnrollmentSessionEditor` — ± draft → 확인 → batch 적용 |
| **요금제 (`pricing_plans`)** | ✅ | Supabase CRUD — `/api/pricing-plans`, `usePricingPlans` |
| **MVP store → Supabase** | ✅ | chat·finance 포함 전 도메인 — repository + sync cache |
| **채팅 (Realtime)** | ✅ | `ChatThread` + `useChatRealtime` — `/api/chat/messages` |
| **재무 대시보드** | ✅ | `/api/admin/finance/transactions` |
| **Auth (teacher/admin)** | ✅ | `/teacher/login`, `/admin/login` → `/api/auth/login`; `LogoutButton` |
| **Auth (student)** | ⚠️ | Supabase client 직접 로그인; logout UI 없음 |
| **선생님 세션 바인딩** | ⏳ | `CURRENT_TEACHER_ID = "teacher-1"` 하드코딩 (~18곳) |
| PWA / Push | ⚠️ | manifest, subscribe API ✅; install prompt stub, 수동 `public/sw.js` |

---

## 1. 개요

| 항목 | 내용 |
|------|------|
| 프로젝트명 | Pass on English |
| 프레임워크 | Next.js 14+ (App Router, TypeScript) |
| UI | Tailwind CSS + Shadcn UI |
| 다국어 | next-intl |
| PWA | 수동 `public/sw.js` + Web Push API (명세: `@ducanh2912/next-pwa` — 미적용) |
| 인증 | Supabase Auth + `/api/auth/*` (teacher/admin); student는 client SDK 직접 |

본 문서는 학생·선생님·관리자 웹 UI 및 랜딩페이지의 화면 구성, 라우팅, 컴포넌트, 상태 관리, i18n, PWA 요구사항을 정의한다.

---

## 2. 디자인 원칙

- **타겟**: 아동·청소년 학습자 및 학부모 — 친숙하고 신뢰감 있는 UI
- **톤**: 밝고 세련된 교육 서비스 느낌, 과도한 장식 지양
- **접근성**: 충분한 대비, 터치 친화적 버튼(최소 44px), 명확한 CTA
- **반응형**: 모바일 퍼스트 (PWA 홈 화면 추가 유도)
- **브랜드**: Pass on English 로고·컬러 시스템 일관 적용

---

## 3. 접근 구조 (역할별 진입점)

역할마다 **별도 URL·로그인 화면**으로 분리한다. 선생님·관리자는 랜딩/요금 UI에 노출되지 않는다.

| 역할 | 진입 URL | UI 언어 | 랜딩 노출 |
|------|----------|---------|-----------|
| **학생·일반** | `/[locale]` (`ko`, `zh-CN`) | ko / zh-CN | ✅ 랜딩·요금·회원가입 |
| **선생님** | `/teacher/login` → `/teacher/*` | en (고정) | ❌ 전용 로그인만 |
| **관리자** | `/admin/login` → `/admin/*` | ko (고정) | ❌ 전용 로그인만 |

- 학생 로그인: `/[locale]/login` (랜딩 헤더·푸터 포함)
- 선생님·관리자 포털 링크는 **학생 랜딩/로그인에 표시하지 않음**
- 선생님·관리자 URL은 내부 배포·직접 공유로만 전달

---

## 4. 다국어 (i18n)

### 4.1 지원 언어 및 적용 범위

| 영역 | 지원 언어 | 기본 언어 (Geo/IP) |
|------|-----------|-------------------|
| 랜딩·학생 | **ko, zh-CN** | 접속 국가 기준 (한국→ko, 중국→zh-CN) |
| 선생님 포털 | **en** (고정) | — |
| 관리자 포털 | **ko** (고정) | — |

> **영문(`en`) 랜딩 페이지는 제공하지 않는다.**

### 4.2 구현 방식

- `next-intl` + App Router `[locale]` 세그먼트 — **학생/랜딩 전용** (`ko`, `zh-CN`)
- 메시지 파일: `messages/ko.json`, `messages/zh-CN.json`
- 선생님·관리자 UI: i18n JSON 또는 하드코딩 (locale 세그먼트 없음)
- Geo 기반 초기 locale: middleware `Accept-Language` (zh → zh-CN, 그 외 ko)
- 언어 전환 UI: 랜딩·학생 페이지만 (ko ↔ zh-CN)

---

## 5. 라우팅 구조

```
/                           → /ko 또는 /zh-CN 리다이렉트
/[locale]                   → 랜딩 홈 (locale: ko | zh-CN)
/[locale]/pricing           → 요금제
/[locale]/teachers          → 선생님 소개 (공개 프로필 요약)
/[locale]/signup            → 학생 회원가입
/[locale]/login             → 학생 로그인

/student/*                  → 학생 포털 (인증 필요, ko/zh-CN)

/teacher/login              → ★ 선생님 전용 로그인 (랜딩 UI 없음)
/teacher                    → My Lessons (구 Dashboard)
/teacher/lessons/[id]       → 수업 상세 (교재·Special Notes 편집)
/teacher/lessons/[id]/feedback → 피드백 작성 (progressPages 포함)
/teacher/availability       → 수업 가능 시간 설정
/teacher/schedule           → 주간 스케줄 캘린더 (셀 클릭 → 상세 모달)
/teacher/reports            → Monthly Growth Report (학생별 작성·편집)
/teacher/salary             → 월별 급여 명세서 (Estimated/Processing/Paid)
/teacher/chat               → 채팅

/admin/login                → ★ 관리자 전용 로그인 (랜딩 UI 없음)
/admin                      → 관리자 대시보드 (인증·역할 필요)
/admin/students             → 학생 현황
/admin/students/[id]        → 학생 상세·입금 확인
/admin/teachers             → 선생님 현황
/admin/teachers/[id]        → 선생님 상세·급여 설정·보너스
/admin/teacher-profiles     → 선생님 프로필 CRUD
/admin/pricing              → 요금제 관리
/admin/reschedule           → **검토 센터** (보강·가입·입금 4탭 + 처리 로그)
/admin/operations           → **수업 운영 센터** (주간 스케줄·수업 조치·일괄 이관)
/admin/teacher-salary       → 강사 급여 명세·상태 관리
/admin/faq                  → FAQ CRUD
/admin/finance              → 재무 현황·정산
/admin/messages             → 관리자 메시지 발송

/student                    → My Lessons (다음 수업·오늘 일정·보강 진행)
/student/learning           → Learning Results (피드백·월 성장 레포트)
/student/chat               → 채팅
```

> ~~`/teacher/profile`~~ — 네비에서 제거. 프로필은 관리자 `/admin/teacher-profiles` 에서 관리.

---

## 6. 화면별 상세 명세

### 6.0 전용 로그인 페이지

#### 선생님 (`/teacher/login`)

| 항목 | 내용 |
|------|------|
| UI | Emerald 테마, 영어 고정, AppShell **미적용** |
| 노출 금지 | 랜딩 헤더/푸터, 요금제, 마케팅 CTA |
| 로그인 후 | `/teacher` 대시보드 |
| 하단 링크 | 학생 로그인(`/ko/login`) 안내만 |

#### 관리자 (`/admin/login`)

| 항목 | 내용 |
|------|------|
| UI | Violet 테마, 한국어 고정, AppShell **미적용** |
| 노출 금지 | 랜딩·요금·학생 회원가입 UI |
| 로그인 후 | `/admin` 대시보드 |
| 하단 링크 | 학생 로그인(`/ko/login`) 안내만 |

### 6.1 랜딩페이지

**목적**: 마케팅·전환 중심의 서비스 홍보

| 섹션 | 내용 |
|------|------|
| Hero | 서비스 슬로건, CTA(무료 체험 신청 / 회원가입) |
| 서비스 소개 | 필리핀 원어민, Zoom 화상 수업, Pass on English 차별점 |
| 요금제 | 한국(원)·중국(위안) 요금표 (아래 표) |
| 선생님 소개 | 대표 프로필 카드 (사진, 경력, 전문 분야) |
| 이용 방법 | 가입 → 선생님 선택 → 일정 예약 → 무료 1회 → 결제 |
| FAQ | 자주 묻는 질문 |
| Footer | 이용약관, 개인정보, 연락처, 언어 전환 |

**요금표 (Supabase `pricing_plans` — `GET /api/pricing-plans?active=true`)**

| plan_type (시드) | 한국 | 중국 | 회차 |
|------------------|------|------|------|
| weekday5_20min | 87,000원 | 480위안 | 20 |
| mwf_20min | 90,000원 | 490위안 | 12 |
| tuth_20min | 64,000원 | 340위안 | 8 |
| weekend_20min | 64,000원 | 340위안 | 8 |

> 관리자 `/admin/pricing`에서 40분·60분 등 추가 플랜 CRUD 가능. 랜딩·수강 UI는 API 응답 UUID를 `planId`로 사용.

> 수업 시간: **20분 세션**, **20분 슬롯** (:00·:20·:40). 휴식은 선생님이 `WeeklyAvailabilityGrid`에서 슬롯 Off. `EnrollmentFlow` 공통.

---

### 5.2 학생 페이지

#### 5.2.1 회원가입·로그인

- **계정 유형 선택**: 본인 수강(`self`) / 자녀 수강(`guardian`)
- **Guardian**: 학부모 이름·연락처 + **자녀** 이름·영문 이름·생년월일 분리 입력
- **Self**: 성인 본인 — 계정=learner 1:1
- `POST /api/student/account` → 첫 learner 생성 → onboarding
- **자녀 추가**: `/student/learners/new` → `POST /api/student/learners`
- **헤더 전환기**: `StudentSwitcher` — learner별 포털 데이터 전환

#### 5.2.2 온보딩 설문 (learner당 1회)

| 필드 | 타입 | 옵션 예시 |
|------|------|-----------|
| 영어 수준 | select | 초급 / 중급 / 고급 |
| 수강 목적 | multi-select | 회화, 파닉스, 비즈니스, 시험 대비 등 |
| 연령대 | select | 유아, 초등, 중등, 성인 |
| 기타 메모 | textarea | 선택 |

#### 5.2.3 선생님 선택·수강 신청

**신규 가입 플로우 (MVP)**

1. 회원가입 → 온보딩 설문
2. `EnrollmentFlow` 4단계: 요금제 → 선생님 → **20분 슬롯** → 결제
3. 첫 가입: 선택 슬롯에 **무료 체험 1회** 예약 (`book_trial` → trial lesson 생성)
4. 결제 안내 → 입금 완료 신고 (`POST /api/enrollments`)
5. 관리자 입금 확인 → 수강 `active` (**신청 완료**)

**재수강(renewal) 플로우**

- 기존 수강(`active`/`expiring_soon`/`completed`)에서 **재수강** 진입
- 플랜·선생님·주간 시간(`preferredSlotTime`) **잠금** — 신규 4단계를 반복하지 않음
- 결제(입금 신고)만 진행 → `POST /api/enrollments` `{ renewFromEnrollmentId }`
- 입금 확인 시 슬롯 예약 + 잔여 회차 스케줄 자동 생성

- 선생님 카드: 프로필 사진, 이름, 소개, 전문 분야
- **일정 선택**: 20분 단위 슬롯 (`:00` / `:20` / `:40`) — plan `scheduleDays` 와 availability 교집합
- **요금제**: 4종 (주5 20회 / MWF 12 / 화목 8 / 주말 8), 기본 **20분** (`sessionMinutes`; 관리자 CRUD로 25/30/40 확장 가능)
- 요금제·가격: `/admin/pricing` CRUD (랜딩·학생 UI는 API 연동)

#### 5.2.4 결제 (계좌이체)

- PG 미연동 — 계좌 정보·입금자명·금액 안내 화면
- "입금 완료" 버튼 → 관리자 확인 대기 상태
- 관리자 입금 확인 후 수업 승인(active) 상태로 전환

#### 5.2.5 My Lessons · 보강

**구현**: `MyLessonsHub.tsx` — API `/api/teacher/lessons`, `/api/lessons/reschedule`

| 영역 | 내용 |
|------|------|
| Next Lesson | 가장 가까운 예정 수업 — **시작–종료** (`formatLessonTimeRange`, 예: 19:00–19:20) |
| Today's Schedule | 오늘 수업 목록 (demo: 항상 오늘 날짜로 표시되는 시드 데이터) |
| Action Required | 피드백 미작성 완료 수업 |
| Reschedule Progress | `RescheduleProgressPanel` — pending/approved/rejected/cancelled |

- 수업 카드: 학생 `englishName` 표시, **채팅 아이콘** (`StudentChatLink`) → 해당 학생 채팅방
- **보강**: `LessonDialogs` + `RescheduleRequestForm` — `datetime-local` **step=1200**(20분), 제출 시 KST 그리드 스냅
- **보강**: 학생 월 2회, pending 중 **취소** 가능 (위 폼·패널 연동)
- Zoom 링크는 표시하지 않음 (ZOOM/VOOV 플랫폼명만 teacher context에서 표시)

#### 5.2.6 Learning Results

**구현**: `LearningResultsHub.tsx`

- Lesson Feedback 목록 (`progressPages`)
- Monthly Growth Report — 5개 필드: lessonsCovered, progressMade, areasToWorkOn, nextMonthGoals, overallComment

#### 5.2.7 채팅

- 수강 신청(매칭) 완료 후 해당 선생님과 1:1 채팅방 생성
- Instagram DM 유사 UI: 버블, 시간, 읽음 표시
- Web Push로 새 메시지 알림

---

### 5.3 선생님 페이지

#### 5.3.1 My Lessons (`/teacher`)

**구현**: `TeacherMyLessonsHub.tsx`

| Zone | 내용 |
|------|------|
| Next Lesson | 다음 수업 + `TeacherLessonDetailCard` |
| Today's Schedule | 오늘 수업 리스트 |
| Action Required | 피드백 대기 수업 → `/teacher/lessons/[id]/feedback` |
| Reschedule Progress | 보강 진행 패널 (승인·거절·취소) |

#### 5.3.2 수업 상세 카드 (`TeacherLessonDetailCard`)

- 학생명 + `StudentChatLink`
- 일시: **시작–종료** (`formatLessonTimeRange`, 예: 10:00–10:20)
- **Textbook**: Edit/Save 인라인 편집 → `PUT /api/teacher/student-context`
- **Special Notes**: 동일 Edit/Save 패턴
- Video platform: ZOOM / VOOV
- Request Reschedule 버튼

#### 5.3.3 Schedule (`/teacher/schedule`)

**구현**: `TeacherWeeklyScheduleCalendar.tsx`

- 주간 그리드: enabled + booked 오버레이
- **예약 셀 클릭** → Dialog: `TeacherLessonDetailCard` + Request Reschedule

#### 5.3.4 수업 가능 시간 (`/teacher/availability`)

**구현**: `WeeklyAvailabilityGrid.tsx`

- 주간 반복 슬롯 (KST 저장, PHT 표시)
- **20분 그리드** (`:00` / `:20` / `:40`) — 셀 탭으로 On/Off
- 휴식: 시스템 자동 간격 없음 → 선생님이 **쉬고 싶은 20분 슬롯을 Off**
- toggle / copy day / save actions

#### 5.3.5 Growth Reports (`/teacher/reports`)

**구현**: `MonthlyGrowthReportEditor.tsx`

- 학생 필터·월 선택
- 필드 (영문 라벨): What We Covered / Progress Made / Areas to Work On / Next Month's Goals / Teacher's Overall Comment
- ~~Sessions Completed~~ 제거

#### 5.3.6 Salary (`/teacher/salary`)

**구현**: `TeacherSalaryDashboard.tsx`

| Zone | 내용 |
|------|------|
| 1 | 월 선택 + `SalaryStatusBadge` + 총액 + **보너스 정책** 카드 (**영문** 문구) |
| 2 | Breakdown (완료 수업 수·시간·기본급·보너스·공제) — **수업별 목록 없음** |
| 3 | Payout details (지급일·계좌) |

상태: `estimated` (당월 live) → `processing` → `paid`

#### 5.3.7 프로필

- 선생님 네비 **Profile 탭 없음** — `/admin/teacher-profiles` 에서 관리자가 CRUD

---

### 5.4 관리자 페이지

- **학생 현황**: 수강 중/과거 수강자 필터, 입금 여부, 입금 확인 버튼
- **선생님 현황**: 프로필, 진행 수업, 시급 설정
- **선생님 프로필 관리** (`/admin/teacher-profiles`): displayName, bio, specialties, hourlyRatePhp CRUD
- **요금제** (`/admin/pricing`): PricingPlan CRUD — Supabase `pricing_plans` (`sessionMinutes`, `scheduleDays`, i18n name)
- **학생 상세** (`/admin/students/[id]`): **수업 횟수 관리** — `EnrollmentSessionEditor` (± draft → 확인 Dialog → `adjust_sessions`)
- **검토 센터** (`/admin/reschedule`): `AdminReviewCenter` — 4탭 + 하단 처리 로그
- **수업 운영 센터** (`/admin/operations`): `AdminOperationsCenter` — 아래 §5.4.1
- **강사 급여** (`/admin/teacher-salary`): 월별 명세, live estimate → processing 확정, paid 처리
- **FAQ** (`/admin/faq`): FAQ CRUD
- **재무**: 수입·지출 차트 (mock + accounting 데이터)
- **메시지 · CS 센터** (`/admin/messages`): `AdminMessagesHub` — §5.4.3

#### 5.4.3 메시지 · CS 센터 (`AdminMessagesHub`)

**경로**: `/admin/messages`  
**상태**: 프론트엔드 프로토타입 ✅ · 발송/저장 API ⏳

| 탭 | 컴포넌트 | 설명 |
|----|----------|------|
| CS · 1:1 | `CsManagerPanel` | 채팅 모니터링 + 관리자 1:1 + Quick Replies |
| 단체 발송 | `BroadcastPanel` | 세그먼트·필터·채널·예약 발송 UI |
| Push · 알림 | `PushNotificationsPanel` | KPI·발송 내역(샘플) + **자동 시스템 알림 UI 미리보기 (향후 구축 예정)** |

**채팅 모니터링**: `GET /api/chat/rooms?role=admin` · `ChatMonitorThread` · `/admin/chat/[roomId]` 참여  
**관리자 1:1**: students/teachers API로 대상 선택 · 전송은 로컬 프로토타입  
**Quick Replies**: `messages-mock-data.ts`  
**단체 발송**: 전체·학생(KR/CN)·선생님 + 수강 상태 필터  
상세: `docs/원어민 화상영어 플랫폼 서비스 앱 개발 요구사항 정리.md` §6

#### 5.4.1 수업 운영 센터 (`AdminOperationsCenter`)

**경로**: `/admin/operations`  
**모드**: 카드 토글 2종 — **스케줄 & 수업 조치** | **휴직·퇴직 일괄 이관**

| 영역 | 구현 | 설명 |
|------|------|------|
| 선생님 선택 | 상단 셀렉트 | 선택 시 주간 캘린더 + 조치 로그 로드 |
| 주간 스케줄 | `TeacherWeeklyScheduleCalendar` | 이전/다음 주 · KST 그리드 · 예약/노쇼(회색) 셀 |
| 수업 클릭 | `AdminLessonDualModal` | 대체·노쇼·무급취소·일정변경 (`AdminLessonActionsPanel`) |
| **수업 조치 로그** | `AdminLessonOperationLogPanel` | 스케줄 **아래** — 해당 주(수업 예정 주 기준) 조치 이력 |
| 주간 연동 | `weekStart` lift state | 캘린더 이전/다음 주 ↔ 로그 필터 동기화 |
| 조치 되돌리기 | 로그 행 **취소** 버튼 | **선생님 노쇼**·**무급 취소**만 undo 가능 |
| 일괄 이관 | bulk 탭 | enrollment 단위 잔여 스케줄 전체 이관 |

**수업 조치 UI (`AdminLessonActionsPanel`)**

| 조치 | 확인 | 효과 |
|------|------|------|
| 대체 선생님 | — | substitute 배정 |
| 선생님 노쇼 | 확인 Dialog | 원 수업 cancelled(회색) · 보강 생성 · 회차+1 · 급여 패널티 |
| 무급 취소 | 확인 Dialog | 수업 삭제 · 슬롯 Available · 회차−1 |
| 일정 변경 | — | `datetime-local` step=1200, KST 그리드 스냅 |

**데모 (Sarah Mitchell / teacher-1)**: 10:00 회색=노쇼 완료 · 11:00=노쇼 테스트 · 14:00=일반 예정

#### 5.4.2 검토 센터 (`AdminReviewCenter`)

**경로**: `/admin/reschedule` (파일명 legacy; UI는 통합 검토 센터)

| 탭 | 대상 | 액션 |
|----|------|------|
| 수업 시간 변경 | `LessonRescheduleRequest` pending | 승인 / 거절 |
| 신규 선생님 | `TeacherApplication` pending | 승인 / 거절 |
| 신규 학생 | `StudentRegistrationReview` | 확인 / 거절 |
| 입금 · 수업 활성화 | `StudentEnrollment` reported | 활성화 / 거절 |

- 하단 **처리 로그**: 카테고리별 `AdminReviewLogEntry` (승인·거절·확인·활성화)
- API: `GET/PATCH /api/admin/reviews`

---

## 6. 공통 UI 컴포넌트

| 컴포넌트 | 용도 |
|----------|------|
| `AppShell` | 역할별 사이드바/하단 네비 (teacher: My Lessons, Growth Reports 등) |
| `StudentAppShell` | 학생 포털 레이아웃 (**모바일 2-row 헤더**, `LocaleSwitcher` compact) |
| `AdminOperationsCenter` | 관리자 수업 운영 (스케줄·조치·로그·일괄 이관) |
| `AdminLessonOperationLogPanel` | 수업 조치 로그 + undo 버튼 |
| `AdminLessonDualModal` | 수업 조치 듀얼 모달 (정보 + 조치 패널) |
| `AdminReviewCenter` | 관리자 검토 4탭 + 처리 로그 |
| `WeeklyAvailabilityGrid` | 선생님 20분 availability 그리드 |
| `LocaleSwitcher` | 언어 전환 (ko ↔ zh-CN) |
| `TeacherWeeklyScheduleCalendar` | 선생님 주간 스케줄 + 셀 클릭 모달 |
| `TeacherLessonDetailCard` | 수업 상세·교재/Notes 편집·보강 |
| `TeacherMyLessonsHub` | 선생님 My Lessons 4-zone |
| `StudentSwitcher` | 헤더 learner 전환 + 자녀 추가 |
| `ActiveLearnerProvider` | activeLearnerId 컨텍스트 |
| `RescheduleRequestForm` | 보강 요청 폼 |
| `RescheduleProgressPanel` | 보강 진행 상태 패널 |
| `SalaryStatusBadge` | estimated / processing / paid |
| `TeacherSalaryDashboard` | 급여 3-zone 대시보드 |
| `MonthlyGrowthReportEditor` | 월 성장 레포트 작성 |
| `StudentChatLink` | 학생명 옆 채팅 아이콘 |
| `LessonStatusBadge` | scheduled / completed / reschedule_pending |
| `ChatThread` | 메시지 목록 + 입력 |
| `ChatNotificationBell` | 헤더 미읽음 알림 |
| `PaymentInfoPanel` | 계좌이체 안내 |
| `DataTable` | 관리자 리스트 (Shadcn Table) |
| `FinanceChart` | 재무 시각화 |

Shadcn UI 기준 설치: Button, Card, Dialog, Form, Input, Select, Tabs, Toast, Calendar, Sheet, Avatar, Badge, Table, Chart.

---

## 7. 상태 관리·데이터 fetching

- **요금제**: `usePricingPlans` → `GET /api/pricing-plans` → Supabase PostgreSQL
- **핵심 도메인**: Route Handler → `*/repository.ts` → Supabase; 클라이언트·RSC는 `*-store-sync.ts` (cache) 읽기
- **Bootstrap**: 서버 페이지·API는 `ensureSchedulesBootstrapped()` / `ensurePublicContentBootstrapped()` 선행
- **목표**: TanStack Query (React Query) + Supabase client (Auth 연동 후)
- **폼**: React Hook Form + Zod (점진 적용)
- **실시간**: Supabase Realtime (채팅, 알림) — 추후
- **인증 세션**: `@supabase/ssr` — middleware에서 세션 갱신, 역할별 라우트 가드 (미연동)

---

## 8. PWA & Web Push

### 8.1 PWA

- `@ducanh2912/next-pwa` — service worker, offline shell, manifest
- `manifest.json`: name, icons (192/512), `display: standalone`, theme_color
- 홈 화면 추가 유도 배너 (iOS Safari / Android Chrome 분기)

### 8.2 Web Push

- VAPID 키 기반 구독 (`pushManager.subscribe`)
- 구독 정보 Supabase `push_subscriptions` 저장
- 알림 트리거: 새 채팅, 보강 요청/승인, 결제 확인, 수업 리마인더(추후)
- 권한 거부 시 in-app Toast만 사용

---

## 9. 인증·권한 (클라이언트)

| 역할 | 로그인 URL | 접근 경로 | 로그아웃 |
|------|------------|-----------|----------|
| `student` | `/[locale]/login` | `/student/*`, `/[locale]/*` (공개) | ⏳ UI 없음 |
| `teacher` | `/teacher/login` | `/teacher/*` (login 제외) | ✅ `LogoutButton` |
| `admin` | `/admin/login` | `/admin/*` (login 제외) | ✅ `LogoutButton` |

- middleware: 미인증 → **역할별 로그인 URL**로 리다이렉트
  - `/student/*` → `/[locale]/login`
  - `/teacher/*` (login 제외) → `/teacher/login`
  - `/admin/*` (login 제외) → `/admin/login`
- 역할 불일치 → 403
- `/teacher/login`, `/admin/login`은 AppShell·랜딩 레이아웃 미적용
- RLS는 Supabase에서 enforcement — UI는 UX 차원의 가드

### 9.1 잔여 (Auth 2차)

| 항목 | 현재 | 목표 |
|------|------|------|
| 선생님 ID | `CURRENT_TEACHER_ID` 상수 | `GET /api/auth/session` → `teacherId` |
| 학생 로그인 | Supabase client `signInWithPassword` | `/api/auth/login` + role 검증 통일 |
| 학생 logout | 없음 | `StudentAppShell`에 `LogoutButton` |

---

## 10. 중국 접속 호환

- Google Fonts / Firebase / blocked CDN 사용 금지
- 정적 자산 self-host 또는 Tencent CDN
- Supabase·API 엔드포인트 홍콩 리전 배치 (guide.md 참고)
- third-party script 최소화

---

## 11. 디렉터리 구조 (권장)

```
src/
├── app/
│   ├── [locale]/           # 랜딩
│   ├── student/
│   ├── teacher/
│   │   ├── page.tsx        # My Lessons
│   │   ├── lessons/[id]/
│   │   ├── schedule/
│   │   ├── reports/
│   │   └── salary/
│   ├── admin/
│   │   ├── operations/       # 수업 운영 센터
│   │   ├── teacher-profiles/
│   │   ├── pricing/
│   │   ├── reschedule/       # 검토 센터 (AdminReviewCenter)
│   │   └── teacher-salary/
│   └── api/
│       ├── teacher/lessons/
│       ├── teacher/student-context/
│       ├── teacher/salary/
│       ├── lessons/reschedule/
│       ├── learning/feedback/
│       ├── learning/reports/
│       ├── admin/lessons/          # 수업 조치·일괄 이관·operation-logs
│       ├── admin/reviews/          # 검토 센터
│       └── admin/teacher-salary/
│   ├── ui/                   # shadcn
│   ├── landing/
│   ├── student/
│   ├── teacher/
│   ├── admin/
│   └── shared/
├── lib/
│   ├── pricing-plans/repository.ts   # Supabase CRUD (server-only)
│   ├── enrollments/repository.ts
│   ├── lessons/repository.ts
│   ├── accounts/repository.ts
│   ├── teachers/repository.ts
│   ├── faq/repository.ts
│   ├── chat/repository.ts
│   ├── chat/chat-store-sync.ts
│   ├── finance/repository.ts
│   ├── finance/finance-store-sync.ts
│   ├── chat-store.ts                 # href helpers (client-safe)
│   ├── …/repository.ts             # 도메인별 Supabase CRUD
│   ├── *-cache.ts                    # warm*Cache 대상 in-memory cache
│   ├── *-store-sync.ts              # 클라이언트 안전 sync 읽기
│   ├── *-store.ts                    # re-export (하위 호환)
│   ├── lesson-scheduler-bootstrap.ts # ensureSchedulesBootstrapped
│   ├── supabase/
│   │   ├── server.ts                 # @supabase/ssr createClient
│   │   ├── client.ts                 # browser + Realtime
│   │   └── admin.ts
│   ├── i18n/
│   └── push/
├── hooks/
│   ├── usePricingPlans.ts
│   ├── useChatRealtime.ts            # chat_messages Realtime 구독
├── types/
└── messages/
    ├── ko.json
    ├── zh-CN.json
    ├── student-portal.ko.json
    └── student-portal.zh-CN.json
```

---

## 12. 비기능 요구사항

| 항목 | 목표 |
|------|------|
| LCP | < 2.5s (랜딩, 4G) |
| SEO | 랜딩 metadata, sitemap, hreflang |
| 에러 처리 | Error boundary, Toast, 재시도 |
| 로딩 | Skeleton UI |

---

## 13. MVP 범위 및 제외

**포함**: 랜딩, 학생/선생님/관리자 핵심 플로우, 채팅, PWA, Push, 계좌이체 UI  
**제외**: Zoom API 연동, PG 결제, 네이티브 앱 스토어 배포
