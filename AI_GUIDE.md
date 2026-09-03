# PassOn English AI 작업 가이드 (SSOT)

> 이 문서는 AI와 개발자가 작업을 시작할 때 가장 먼저 확인해야 하는 프로젝트의 단일 진실 공급원(SSOT)이다.
> 다른 문서·대화·주석·과거 배포 기록이 이 문서와 충돌하면 이 문서를 우선한다. 충돌을 발견하면 추측하지 말고 사실을 재검증한 뒤 이 문서도 함께 갱신한다.

최종 검증일: 2026-09-03 (DB 043 적용 및 CLI 대상 재검증; 앱 배포 변경 없음)
기준 브랜치: `main`
검증된 운영 기준 커밋: `848666a` (`fix: restore auth profile provisioning`)

## 1. 절대 혼동하면 안 되는 운영 정보

| 항목 | 현재 운영 기준 |
|---|---|
| 서비스명 | PassOn English |
| 운영 도메인 | `https://passonenglish.com` |
| 애플리케이션 서버 | **Tencent Cloud Lighthouse 싱가포르 리전** |
| 서버 공인 IPv4 | `43.134.7.175` |
| 서버 접속 계정 | `ubuntu` (SSH 공개키 인증) |
| 운영 Supabase | **싱가포르 리전 프로젝트** |
| 운영 Supabase project ref | `mvngtkoqjejvwygikvhi` |
| 운영 Supabase URL | `https://mvngtkoqjejvwygikvhi.supabase.co` |
| 폐기 대상 Supabase project ref | `yldtimpsgumheiahcwwi` |
| 운영 배포 방식 | Docker Compose (`app`, `cron`, `nginx`) |
| 서버 릴리스 경로 | `/opt/pass-on-english/releases/<git-short-sha>/deploy/tencent-lighthouse` |
| DB migration 최신 기준 | `043_chat_push_presence.sql` — 2026-09-03 싱가포르 운영 DB 적용·권한 검증 완료 |
| 다음 배포 시 적용 대기 | DB 043 적용 완료. 운영 환경파일에 VAPID 등록 완료(2026-09-03); 새 이미지 빌드·앱 배포·실기기 검증 필요 |

### 금지된 연결

- `yldtimpsgumheiahcwwi.supabase.co`는 구 프로젝트이며 삭제 대상이다.
- 코드, 로컬 환경변수, CI/CD, Tencent 서버 `.env.production`, 브라우저 빌드 산출물 어디에서도 구 프로젝트를 런타임 대상으로 사용하면 안 된다.
- “홍콩 배포”라는 과거 설명은 폐기됐다. 현재 애플리케이션과 Supabase 모두 싱가포르 리전을 사용한다.
- `deploy/tencent-lighthouse`라는 디렉터리명은 Tencent 제품명을 뜻할 뿐 리전을 뜻하지 않는다.

구 프로젝트 ref가 소스 또는 런타임 설정에서 발견되면 작업을 중단하고 영향 범위를 먼저 보고한다. 이 문서의 폐기 대상 기록은 안전장치이므로 예외다.

## 2. AI 작업 시작 절차

모든 AI 작업은 다음 순서를 따른다.

1. 이 `AI_GUIDE.md`를 처음부터 끝까지 읽는다.
2. 사용자 요청과 `git status --short`, 현재 브랜치, 최근 커밋을 확인한다.
3. 요청과 관련된 코드·migration·배포 문서를 읽어 현재 구현을 확인한다.
4. DB나 배포 작업 전 실제 대상 URL/project ref/서버 리전을 다시 확인한다.
5. 문서와 런타임이 다르면 문서를 맹신하지 말고 읽기 전용 확인으로 실제 상태를 확정한다.
6. 사용자 변경사항과 untracked 파일을 보존한다. 명시적 요청 없이 삭제·reset·덮어쓰기를 하지 않는다.

작업 시작용 확인 명령:

```powershell
Get-Content -LiteralPath .\AI_GUIDE.md -Raw
git status --short
git branch --show-current
git log -5 --oneline
rg -n "yldtimpsgumheiahcwwi" src scripts deploy supabase .github
```

마지막 검색은 결과가 없어야 정상이다. 문서 전체를 검색하면 이 가이드의 폐기 대상 기록이 검색되는 것은 정상이다.

## 3. 제품과 기술 구조

- Framework: Next.js 15 App Router, React 19, TypeScript
- UI: Tailwind CSS, Radix UI, Lucide
- i18n: `next-intl`
- Database/Auth/Realtime/Storage: Supabase
- 배포: Tencent Cloud Lighthouse 싱가포르, Docker Compose, Nginx, Let's Encrypt
- 운영 언어:
  - 공개·학생 페이지: 한국어, 중국어
  - 선생님 페이지: 영어
  - 관리자 페이지: 한국어
- 주요 포털:
  - 공개: `/ko`, `/zh-CN`
  - 학생: `/[locale]/student/*`
  - 선생님: `/teacher/*`
  - 관리자: `/admin/*`

상태 변경의 기본 흐름은 `Route Handler → 인증·역할·소유권 검증 → server-only repository → Supabase`다. 과거 in-memory store 또는 demo fallback에 새로운 운영 write 로직을 추가하지 않는다.

## 4. Supabase와 DB 불변조건

### 운영 대상

- 모든 운영용 `NEXT_PUBLIC_SUPABASE_URL`은 정확히 `https://mvngtkoqjejvwygikvhi.supabase.co`여야 한다.
- anon/publishable key와 service-role/secret key는 반드시 같은 프로젝트에서 발급된 값이어야 한다.
- 키 원문은 문서, Git, 채팅, 로그에 기록하지 않는다.

### Migration

- migration 디렉터리: `supabase/migrations/`
- 현재 운영 기준: 기존 `001`~`042` 적용 기준에 `043`을 2026-09-03 추가 적용. `024`는 운영 migration이 아니라 `supabase/seeds/`로 분리됐다.
- `039_repair_auth_refresh_token_sequence.sql`: 이전 후 refresh token PK/sequence 충돌 복구.
- `040_restore_auth_profile_provisioning.sql`: `auth.users` → `public.profiles` 트리거 복구와 누락 프로필 backfill.
- `041_targeted_chat_inbox.sql`: 사용자 범위 채팅 inbox/thread 집계, 채팅 인덱스와 enrollment/admin 대화방 lifecycle trigger.
- `042_harden_chat_rpc_privileges.sql`: Supabase가 신규 함수에 부여한 직접 `anon` 실행 권한을 제거하고 채팅 RPC를 인증 사용자와 service role로 제한한다.
- 이미 적용된 migration 파일을 임의로 재작성하지 않는다. 후속 변경은 새 번호 migration으로 추가한다.
- `043_chat_push_presence.sql`은 2026-09-03 운영 적용 완료. 채팅방 접속 lease와 저장된 메시지 기반 수신자 RPC를 추가한다. RLS·인덱스·역할별 권한·함수 소유자 등 12개 검사와 service-role 읽기 전용 함수 실행을 통과했다. 앱 코드는 아직 별도 배포가 필요하다.
- 같은 날 운영 DB에 `supabase_migrations.schema_migrations`가 없음을 확인했다. 043은 Management API를 통한 해당 SQL 파일 단독 트랜잭션 실행으로 적용했고, CLI 이력을 임의로 생성하거나 과거 이력을 복구하지 않았다. `db push`/전체 migration 재적용 금지: 실제 객체와 과거 적용 기록을 대조한 이력 정합화가 먼저 필요하다.
- 로컬 `supabase/.temp`의 구 프로젝트 연결을 발견하여 실행을 중단한 후, 공식 CLI `link`로 싱가포르 project ref 및 pooler를 재설정·확인했다. 향후 CLI 실행 전 숨김/ignored 파일의 project-ref도 반드시 확인한다.
- 운영 DB 적용 전 대상 project ref를 출력 가능한 비밀이 아닌 URL/ref 수준에서 확인하고, 데이터 보존형 SQL인지 검토한다.

### 회원가입 불변조건

- `auth.users` 생성 시 `on_auth_user_created` 트리거가 `public.profiles`를 만들어야 한다.
- 학생 회원가입은 같은 사용자 ID의 `profiles(role=student)`와 `students.account_holder_id` 관계를 유지해야 한다.
- 선생님 회원가입은 `profiles(role=teacher)`와 신청 정보의 사용자 ID 관계를 유지해야 한다.
- 애플리케이션은 프로필 UPDATE 0건을 성공으로 간주하면 안 된다. `src/lib/auth/profile-provisioning.ts`의 자동 복구 경계를 유지한다.
- 기존 계정의 역할을 자동으로 덮어쓰지 않는다. 역할 불일치는 오류로 중단한다.

## 5. 환경변수와 비밀 관리

로컬은 `.env.local`, Tencent 운영 서버는 릴리스 디렉터리의 `deploy/tencent-lighthouse/.env.production`을 사용한다.

2026-09-03 VAPID 등록: 실행 중인 `pass-on-english:24b2111`의 실제 Compose 경로를 확인한 뒤,
해당 릴리스 `.env.production`에 로컬 공개키·비밀키 두 항목만 등록했다. 키 쌍 정상 및 로컬/서버 파일 일치 확인.
기존 `VAPID_SUBJECT`와 Supabase 설정은 보존했고 원본은 동일 디렉터리의 `.env.production.pre-vapid-*`로 백업했다(두 파일 모두 600).
앱은 재시작·재빌드하지 않았으므로 현재 실행 컨테이너에는 아직 VAPID 키가 없다. 다음 배포 시 새 이미지 빌드와 환경 반영이 필요하다.

필수 운영 변수:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL=https://passonenglish.com`
- cron 및 Web Push 관련 secret/VAPID 변수

규칙:

- `.env*`, DB 비밀번호, private key, service-role key를 커밋하거나 출력하지 않는다.
- `NEXT_PUBLIC_*` 값은 Docker build 시 번들에 포함되므로 변경 후 반드시 이미지를 다시 빌드한다.
- 로컬 `.env.local`을 검토 없이 운영 서버로 복사하지 않는다.
- 환경변수 수정 전후에는 Supabase URL이 신규 싱가포르 프로젝트인지 확인하되 키값은 표시하지 않는다.

## 6. 배포 SSOT

운영 서버는 Tencent Cloud Lighthouse **싱가포르 리전**의 `43.134.7.175`다. 현재 배포 패키지는 `deploy/tencent-lighthouse/`이며 서비스는 다음과 같다.

- `app`: Next.js standalone 서버, 외부에 3000 포트를 공개하지 않음
- `cron`: 내부 보호 API를 주기적으로 호출
- `nginx`: 80/443 공개, HTTPS 종료와 reverse proxy

안전한 배포 원칙:

1. 사용자가 배포를 요청했는지 확인한다. “코드만 수정”, “배포하지 말라”는 요청이 있으면 절대 배포하지 않는다.
2. 테스트와 production build를 먼저 통과시킨다.
3. 커밋 SHA별 새 릴리스 디렉터리와 이미지 태그를 사용한다.
4. 기존 릴리스와 이미지는 검증이 끝날 때까지 rollback 용도로 유지한다.
5. `.env.production`의 Supabase URL을 신규 싱가포르 프로젝트로 확인한다.
6. `app` healthcheck 통과 후 `cron`, `nginx`를 올린다.
7. 운영 smoke test와 로그 확인 후 완료로 보고한다.

필수 배포 후 확인:

```text
https://passonenglish.com/ko             → 200
https://passonenglish.com/zh-CN          → 200
https://passonenglish.com/ko/signup      → 200
https://passonenglish.com/api/health     → 200
```

추가 확인:

- 실행 이미지 태그가 배포 커밋 SHA와 일치하는가
- `app` 컨테이너가 healthy인가
- 컨테이너의 `NEXT_PUBLIC_SUPABASE_URL`이 `mvngtkoqjejvwygikvhi`인가
- app/nginx/cron 최근 로그에 반복 5xx·timeout이 없는가
- 로그인, 회원가입, 학생·선생님·관리자 권한 경계가 유지되는가

## 7. 테스트 기준

변경 범위에 맞춰 최소한 다음을 실행한다.

```powershell
npx tsc --noEmit
npm run build
npm run test:auth:signup
npm run test:auth:default-deny
npm run test:auth:teacher-profile
npm run test:transactions
```

DB 연결 테스트는 반드시 싱가포르 프로젝트 대상임을 먼저 확인한다. 실제 사용자 생성, 운영 데이터 삭제, seed 적용은 테스트 명령이라는 이유만으로 자동 승인된 것이 아니다.

## 8. 성능과 Egress 원칙

- 공개 페이지 초기화에서 전체 강사 availability나 전체 테이블을 가져오지 않는다.
- 선택한 강사의 예약 가능 시간은 수강신청 단계에서 필요할 때만 조회한다.
- `select('*')`, 무제한 목록, 모든 요청마다 전체 bootstrap, 짧은 간격 polling을 피한다.
- 필요한 열만 선택하고 서버 필터, 페이지네이션, 요청 중복 제거와 적절한 cache를 적용한다.
- 정적 성격의 FAQ·요금제·공개 프로필은 변경 빈도에 맞는 cache/revalidation을 사용한다.
- 기능을 줄여 Egress를 낮추지 않는다. 동일 기능을 더 작은 응답과 더 적은 요청으로 제공한다.
- Supabase Usage 수치는 최대 24시간 이상 지연될 수 있으므로 배포 직후 일일 총량만으로 회귀를 단정하지 않는다. API별 요청 횟수·응답 크기·PostgREST 로그를 함께 본다.

## 9. 변경·문서화 원칙

- 공개 URL, API 응답 계약, 역할별 기능을 임의로 바꾸지 않는다.
- 기존 운영 데이터 보존이 최우선이다. 삭제·대량 UPDATE·seed는 명시적 승인과 백업 확인이 필요하다.
- 수정 후 관련 테스트를 실행하고 실패 원인을 숨기지 않는다.
- 커밋·푸시·배포는 사용자의 요청 범위를 구분한다. 하나를 요청했다고 나머지가 자동 승인되는 것은 아니다.
- 운영 인프라, DB project ref, 도메인, migration 기준이 바뀌면 같은 변경에서 이 문서와 개발요청서를 함께 갱신한다.
- 과거 문서의 날짜가 오래됐거나 이 문서와 충돌하면 이 문서를 우선하고 해당 문서에 폐기 표기를 추가하거나 정정한다.

## 10. 관련 문서 우선순위

1. `AI_GUIDE.md` — 운영 대상과 AI 작업 규칙의 최우선 SSOT
2. `docs/개발요청서_현재빌드및향후계획.md` — 현재 구현 상태와 후속 계획
3. `deploy/tencent-lighthouse/README.md` — 운영 배포 절차
4. `docs/db.md`, `docs/backend.md`, `docs/front.md`, `docs/guide.md` — 영역별 상세 설계
5. 과거 대화와 초기 요구사항 — 배경 자료이며 현재 운영 사실의 근거로 단독 사용 금지
