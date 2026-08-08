# Pass on English — 전체 프로젝트 가이드

## 1. 프로젝트 소개

### 1.1 서비스 개요

**Pass on English**는 필리핀 원어민 영어 선생님을 고용하여 한국·중국 학생에게 **Zoom 화상 수업**을 제공하는 온라인 영어 교육 플랫폼이다.

- 화상 프로그램(Zoom)은 **플랫폼과 API 연동하지 않음** — 수업은 Zoom 등 외부 도구로 진행, 일정·결제·커뮤니케이션만 플랫폼에서 관리
- **네이티브 앱 없음** — PWA + Web Push로 홈 화면 추가 및 알림 제공
- **결제** — PG 없이 **계좌이체**만 (관리자 입금 확인 후 수업 승인)

### 1.2 요금제

모든 수업 **20분**, **20분 단위 타임슬롯** (:00·:20·:40). 휴식은 선생님이 Availability에서 슬롯 Off. 관리자 `/admin/pricing` 에서 요금·회차·`session_minutes` 수정 가능.

| 플랜 | 한국 | 중국 | 회차 |
|------|------|------|------|
| 주5회(월~금) 20분 | 87,000원 | 480위안 | 20 |
| 월·수·금 20분 | 90,000원 | 490위안 | 12 |
| 화·목 20분 | 64,000원 | 340위안 | 8 |
| 주말(토·일) 20분 | 64,000원 | 340위안 | 8 |

### 1.3 사용자 역할 및 진입점

| 역할 | 진입 URL | UI | 랜딩 노출 |
|------|----------|-----|-----------|
| **학생 계정** | `/ko`, `/zh-CN` → login | ko/zh-CN | ✅ |
| **선생님** | `/teacher/login` | en | ❌ |
| **관리자** | `/admin/login` | ko | ❌ |

| 역할 | 주요 기능 |
|------|-----------|
| **학생 계정** (account_holder) | 로그인, 자녀 등록·전환, 입금 신고(입금자=계정명) |
| **수강생** (learner) | My Lessons, Learning Results, 채팅, trial·보강(learner별) |
| **선생님** | My Lessons, Availability, Schedule, Growth Reports, Salary, 채팅 |
| **관리자** | 학생/선생님 현황, **운영 센터**, **검토 센터**, 프로필·요금·급여·FAQ |

---

## 2. 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | Next.js (App Router), TypeScript |
| UI | Tailwind CSS, Shadcn UI |
| i18n | next-intl |
| PWA / Push | @ducanh2912/next-pwa, Web Push API |
| Backend | Next.js Route Handlers, Supabase |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth |
| Realtime | Supabase Realtime (채팅) |
| Storage | Supabase Storage |
| Infra | **Tencent Cloud 홍콩 리전** |

### 2.1 중국 접속 제약

다음을 **사용하지 않는다**:

- Google 서비스 (Fonts, Analytics blocked 대체)
- Firebase 등 중국 차단 서비스
- 중국에서 접속 불가한 CDN·API

**필수**:

- 홍콩 리전 배포로 한·중 양국 접속
- Self-host fonts/assets
- Supabase/API latency HK 기준 검증

### 2.2 MVP 구현 현황 (2026-08)

| 기능 | 상태 | 구현 위치 |
|------|------|-----------|
| My Lessons (teacher/student) | ✅ | `TeacherMyLessonsHub`, `MyLessonsHub` |
| **20분 타임슬롯** | ✅ | `SLOT_BLOCK_MINUTES=20`, `:00/:20/:40` |
| **재수강(renewal)** | ✅ | `createRenewalEnrollment`, `EnrollmentFlow` renew 모드 |
| **관리자 수업 운영 센터** | ✅ | `/admin/operations`, 조치 로그·undo |
| **관리자 검토 센터** | ✅ | `/admin/reschedule`, 4탭 + 처리 로그 |
| 수업 상세·교재/Special Notes 편집 | ✅ | `TeacherLessonDetailCard`, student-context API |
| Schedule 캘린더·노쇼 회색 셀 | ✅ | `TeacherWeeklyScheduleCalendar` |
| 보강 (양방향·취소·월 2회) | ✅ | `reschedule-store`, 20분 그리드 스냅 |
| 학생 채팅·모바일 헤더 | ✅ | `StudentChatLink`, `StudentAppShell` 2-row |
| Lesson Feedback + progressPages | ✅ | `/api/learning/feedback` |
| Monthly Growth Report (5필드) | ✅ | `MonthlyGrowthReportEditor` |
| Teacher Salary (월별 명세·EN 보너스 정책) | ✅ | `TeacherSalaryDashboard` |
| Admin: teacher-profiles, pricing, FAQ | ✅ | `/admin/teacher-profiles`, `/admin/pricing`, `/admin/faq` |
| In-memory stores → Supabase | ⏳ | `src/lib/*-store.ts` |
| 입금 확인·재무 API | ⏳ | 재무 집계 mock |
| Trial → 결제 → 승인 | ✅ | learner 단위 enrollment |
| Account vs Learner | ✅ | account-store, StudentSwitcher |
| Teacher signup API | ⏳ | localStorage prototype |

---

## 3. 문서 구조

| 문서 | 내용 |
|------|------|
| [front.md](./front.md) | UI/UX, 라우팅, 컴포넌트, PWA, i18n |
| [backend.md](./backend.md) | API, 비즈니스 로직, Push, 배포 |
| [db.md](./db.md) | 스키마, RLS, 트리거, 급여 계산 |
| [guide.md](./guide.md) | 본 문서 — 전체 흐름·온보딩·운영 |

원본 요구사항: [원어민 화상영어 플랫폼 서비스 앱 개발 요구사항 정리.md](./원어민%20화상영어%20플랫폼%20서비스%20앱%20개발%20요구사항%20정리.md)

---

## 4. 핵심 사용자 플로우

### 4.1 학생 여정

```mermaid
flowchart LR
    A[랜딩 방문] --> B[회원가입]
    B --> C[설문 온보딩]
    C --> D[선생님 선택]
    D --> E[일정·플랜 선택]
    E --> F{첫 수업?}
    F -->|Yes| G[무료 체험 확정]
    F -->|No| H[입금 안내]
    G --> I[수업 진행]
    I --> J[결제 요청 알림]
    J --> H
    H --> K[입금 신고]
    K --> L[관리자 확인]
    L --> M[수업 활성화]
    M --> N[스케줄·채팅·보강]
```

### 4.2 보강(일정 변경)

```mermaid
sequenceDiagram
    participant Init as Initiator (T or S)
    participant SYS as System
    participant Appr as Approver

    Init->>SYS: POST /api/lessons/reschedule
    alt Teacher initiates
        SYS->>Appr: pending_student_approval
    else Student initiates (≤2/month)
        SYS->>Appr: pending_teacher_approval
    end
    Appr->>SYS: approve / reject
    alt Initiator cancels while pending
        Init->>SYS: PATCH action=cancel
        SYS->>SYS: status=cancelled, lesson→scheduled
    else Approved
        SYS->>SYS: lesson.scheduled_at 갱신
    end
```

- **학생**: 월 2회 (`cancelled` 제외), **선생님**: 제한 없음
- 학생·선생님·관리자 포털 모두 `RescheduleProgressPanel` 로 진행 상태 표시

### 4.3 선생님 급여

```
월 명세서 = baseSalary (totalHours × hourlyRate)
         + perfectAttendanceBonus (25 PHP/h × hours, 만근 시)
         + quarterlyBonus (분기 tier)
         + otherIncentives - deductions

상태: estimated (당월 live) → processing → paid
관리자: live estimate 확정 → processing, 지급 후 paid
```

### 4.4 재수강(renewal)

```mermaid
flowchart LR
    A[기존 수강 active/completed] --> B[재수강 진입]
    B --> C[플랜·선생님·시간 잠금 확인]
    C --> D[입금 신고 only]
    D --> E[관리자 입금 확인]
    E --> F[새 enrollment active]
    F --> G[슬롯 예약 + 잔여 lesson 스케줄]
```

- 신규 4단계 enrollment UI를 거치지 않음
- API: `POST /api/enrollments` `{ renewFromEnrollmentId, depositorName, amountKrw }`

### 4.5 관리자 수업 운영

```mermaid
flowchart TB
    A[/admin/operations] --> B[선생님 선택]
    B --> C[주간 캘린더]
    C --> D[수업 클릭 → 조치 모달]
    D --> E{조치 유형}
    E --> F[대체 / 노쇼 / 무급취소 / 일정변경]
    F --> G[조치 로그 기록]
    G --> H[주간 로그 패널]
    H --> I{undo?}
    I -->|노쇼·무급취소| J[POST operation-logs/undo]
```

- 캘린더 **이전/다음 주** ↔ 로그 필터 **동기화** (수업 예정 주 기준)
- 노쇼: 원 수업 회색 · 보강 생성 · 학생 +1회 · 선생님 급여 패널티

---

## 5. 다국어 전략

| 페이지 | 언어 | 자동 선택 |
|--------|------|-----------|
| 랜딩·학생 | **ko, zh-CN** | 접속 국가 (zh→zh-CN, 그 외 ko) |
| 선생님 | en (고정) | — |
| 관리자 | ko (고정) | — |

- **영문(`en`) 랜딩 미제공** — `messages/ko.json`, `messages/zh-CN.json`만 사용
- 선생님·관리자 UI는 locale 세그먼트 없이 고정 언어
- 통화·요금: `country` 필드와 `pricing_plans` 연동

---

## 6. 로컬 개발 환경 설정

### 6.1 사전 요구

- Node.js 20+
- pnpm (권장) 또는 npm
- Supabase CLI
- Docker (Supabase local)

### 6.2 초기 설정

```bash
# 1. 저장소 클론
git clone <repo-url>
cd Pass_on_English

# 2. 의존성
pnpm install

# 3. Supabase 로컬
supabase init
supabase start

# 4. 환경 변수
cp .env.example .env.local
# NEXT_PUBLIC_SUPABASE_URL, ANON_KEY, VAPID keys 등 입력

# 5. DB 마이그레이션
supabase db push

# 6. 개발 서버
pnpm dev
```

### 6.3 VAPID 키 생성

```bash
npx web-push generate-vapid-keys
```

Public → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`  
Private → `VAPID_PRIVATE_KEY` (서버 only)

---

## 7. 프로젝트 디렉터리 (목표 구조)

```
Pass_on_English/
├── docs/
│   ├── front.md
│   ├── backend.md
│   ├── db.md
│   ├── guide.md
│   └── 원어민 화상영어 ... 요구사항 정리.md
├── supabase/
│   ├── migrations/
│   └── seed.sql
├── public/
│   ├── icons/          # PWA
│   └── manifest.json
├── src/
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── hooks/
│   ├── types/
│   └── messages/
├── .env.example
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

---

## 8. 개발 단계 (로드맵)

### Phase 0 — 기반 (1~2주)

- [x] Next.js + Tailwind + Shadcn 보일러플레이트
- [ ] Supabase 프로젝트, Auth, profiles (MVP: mock auth)
- [x] next-intl, locale routing (ko, zh-CN)
- [x] PWA manifest + service worker

### Phase 1 — MVP Core (3~4주)

- [x] 랜딩페이지 (ko/zh-CN, 요금표)
- [x] 학생: 가입, 설문, My Lessons, Learning Results
- [x] 선생님: My Lessons, availability, schedule, feedback
- [x] 관리자: teacher-profiles, pricing, students/teachers UI
- [ ] DB migrations per db.md (in-memory store 사용 중)

### Phase 2 — 운영 기능 (2~3주)

- [x] 보강 요청/승인/취소 플로우 (양방향)
- [x] **관리자 검토 센터** (4탭 + 로그)
- [x] **관리자 수업 운영 센터** (조치·로그·undo·일괄 이관)
- [x] **20분 타임슬롯** 정책 전환
- [x] **재수강** 플로우
- [x] 수업 완료 + 피드백 (progressPages)
- [x] 채팅 (rooms API, StudentChatLink)
- [x] Web Push 구독·발송 API

### Phase 3 — 재무·급여 (2주)

- [x] 급여 월별 명세서 (estimated/processing/paid)
- [x] 만근·분기 보너스 정책 UI
- [ ] 재무 대시보드·차트 (mock)
- [ ] 월말 정산 스냅샷 (DB cron)

### Phase 4 — 배포·QA

- [ ] Tencent Cloud HK 배포
- [ ] 한·중 접속 테스트
- [ ] PWA iOS/Android 검증
- [ ] 보안·RLS 감사
- [ ] in-memory store → Supabase migration

---

## 9. 배포 (Tencent Cloud HK)

### 9.1 권장 구성

| 구성요소 | 옵션 |
|----------|------|
| Next.js | Docker on CVM 또는 TKE |
| CDN | Tencent Cloud CDN (정적 자산) |
| SSL | Tencent SSL / Let's Encrypt |
| DNS | DNSPod — dual region resolve |
| DB | Supabase Cloud (가까운 리전) 또는 self-host PostgreSQL on HK CVM |

### 9.2 체크리스트

- [ ] HTTPS everywhere
- [ ] `next.config` — `images.domains` Supabase storage
- [ ] Service Worker scope `/`
- [ ] Push: production VAPID on HK domain
- [ ] 중국에서 Google CDN 미사용 확인
- [ ] Real User Monitoring (선택, Tencent APM)

---

## 10. 운영 가이드

### 10.1 일일 업무 (관리자)

1. **검토 센터** (`/admin/reschedule`) — 보강·가입·입금 pending 처리
2. **수업 운영 센터** (`/admin/operations`) — 노쇼·무급취소·대체·일괄 이관
3. 입금 신고 확인 → 학생 enrollment 승인 (검토 센터 또는 학생 상세)
4. 신규 선생님 프로필 등록·수정 (`/admin/teacher-profiles`)
5. **강사 급여** 상태 확인 (`/admin/teacher-salary`)
6. 채팅/문의 대응

### 10.2 월말

1. 선생님 급여: live estimate → **processing** 확정 → 지급 후 **paid**
2. 만근·분기 보너스 검토 (`teacher_salary_statements`)
3. `finance_snapshots` 생성 (추후 automation)
4. 학생 보강 카운트: `request_month` 기준, `cancelled` 제외 (cron)

### 10.3 계좌 정보

- 한국 학생: `.env` `BANK_ACCOUNT_KR`
- 중국 학생: `.env` `BANK_ACCOUNT_CN`
- UI [front.md §5.2.4](./front.md) PaymentInfoPanel

---

## 11. 보안·개인정보

- Supabase RLS 전 테이블 적용
- Service Role Key 서버 전용
- 학생·선생님 PII 최소 수집 (설문, 연락처)
- 채팅 로그 보존 정책 수립 (권장 1년)
- 관리자 계정 MFA 권장

---

## 12. 테스트 전략

| 영역 | 방법 |
|------|------|
| API | Vitest + Supabase local |
| E2E | Playwright — student enroll, payment confirm |
| i18n | locale snapshot |
| PWA | Lighthouse PWA audit |
| Cross-region | VPN KR/CN manual QA |

---

## 13. 연락·의사결정

| 항목 | 담당 |
|------|------|
| 요구사항 변경 | Product Owner |
| DB 스키마 변경 | db.md 업데이트 후 migration |
| API 변경 | backend.md + OpenAPI (선택) |
| UI 변경 | front.md |

---

## 14. 용어집

| 용어 | 설명 |
|------|------|
| Trial | 학생당 최초 1회 무료 수업 |
| Enrollment | 학생-선생님-플랜 수강 계약 단위 |
| Lesson | 개별 수업 일정 |
| Reschedule / 보강 | 수업 일시 변경 (양방향 승인, initiator 취소 가능, 20분 그리드) |
| Renewal / 재수강 | 기존 plan·teacher·time 유지, 결제만 반복 |
| Operations Center | 관리자 주간 스케줄 + 수업 조치 + 로그·undo |
| Review Center | 관리자 4종 pending 큐 + 처리 로그 |
| Time slot | 20분 그리드 (:00/:20/:40); 휴식=availability Off |
| My Lessons | 선생님/학생 홈 — 다음 수업·오늘 일정·Action Required |
| Growth Report | 월말 5필드 성장 레포트 (lessonsCovered 등) |
| Salary Statement | 월별 급여 명세서 (estimated/processing/paid) |
| Perfect attendance / 만근 | 해당 월 결근·무단 변경 없음 |
| PWA | Progressive Web App — 홈 화면 설치형 웹 |

---

## 15. 다음 단계

1. ~~본 명세서 리뷰 및 MVP UI 플로우 검증~~ (2026-08 진행 중)
2. **Supabase migration** — `src/lib/*-store.ts` → db.md 스키마
3. Auth·RLS 연동, Realtime 채팅
4. 입금 확인·재무 API 완성
5. Tencent Cloud HK 배포 및 한·중 QA

상세 구현은 각 명세서를 참조한다.
