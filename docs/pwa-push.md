# PWA 설치와 채팅 Push

2026-09-05 기준 운영 DB migration 043·VAPID 설정 및 앱 `073cb07` 빌드·배포 완료. 실제 기기의 설치·권한 허용·Push 수신 검증은 남아 있다.

## 핵심 변경

| 영역 | 동작 |
|---|---|
| PwaProvider / PwaInstallBanner / PwaInstallHelp | 전역 SW 등록·설치 이벤트 보관. 설치·Push UI는 모바일과 iPadOS 데스크톱 모드에서만 제공하며 PC에서는 숨긴다. 랜딩은 강제 배너 없이 헤더 메뉴를 제공하고, 포털은 설치 카드와 수동 설치 안내를 제공한다. 일회성 배너만 닫은 뒤 7일 숨김이며 설정·프로필의 설치 메뉴는 계속 접근 가능하다. Standalone에서는 설치 UI를 숨기고, Push 권한 거부는 앱 설치 UI와 분리한다. |
| PushSubscribeProvider / lib/push | 사용자 클릭 안에서 권한 요청. 허용 후 브라우저 구독과 인증 API 저장. 성공한 계정별 구독은 페이지 메모리에 1시간 캐시, 실패는 재시도 가능 |
| 로그아웃 | 이 브라우저의 Push 구독 해제와 본인 소유 DB endpoint 삭제. 다른 기기의 구독은 유지 |
| 채팅 전송 | 인증된 사용자로 메시지 저장 후 Next.js `after`에서 알림 처리. Push 실패는 이미 저장된 메시지를 전송 실패로 바꾸지 않음 |
| 수신자 확인 | service-role 전용 `get_chat_push_recipients(message_id)`로 저장된 메시지의 실제 상대와 언어·접속 여부만 조회. 최대 2행 |
| 접속 기록 | 보이고 포커스된 채팅방 + Realtime 연결 성공 조건에서만 60초마다 90초 lease 갱신. 인증된 본인과 접근 가능한 방만 기록 가능 |
| Push 표시 | 접속 중인 수신자는 in-app 기록만 저장. 다른 수신자는 언어·포털별 채팅방으로 연결되는 Push 수신. 404/410 endpoint만 제거; 일시 장애 구독은 유지 |
| 트래픽 | 알림 사용자 확인에서 계정/스케줄 bootstrap 제거. 토큰 필수 열만 조회. 읽음 처리는 단일 조건 UPDATE. 한 탭의 목록/벨은 Realtime 하나 공유 |
| 백그라운드 | 숨김 시 Realtime 해제 및 폴링 중단. 보이는 화면의 연결 장애 때만 60초 안전 폴링. 복귀/재연결 시 채팅 재조회 |

`predev`/`prebuild`는 원본 1024px 아이콘을 보존하고 정확한 192/512px PNG를 생성한다.
아이콘 파일·manifest·SW는 공개 정적 리소스이며, Service Worker는 인증 페이지나 API 응답을 캐시하지 않는다.

## 배포 전 조건

1. `AI_GUIDE.md`의 운영 싱가포르 project ref와 현재 환경을 확인한다.
2. `043_chat_push_presence.sql`은 2026-09-03 운영 적용 완료. 다시 실행하지 않는다. 기존 메시지/계정 데이터는 수정하지 않았다.
3. 운영 VAPID 공개키·비밀키가 동일한 키 쌍인지 확인하고, 공개키가 Docker 빌드 인수에 들어가도록 한다. 값을 로그에 출력하지 않는다.
4. `NEXT_PUBLIC_*` 변경 후 이미지를 다시 빌드한다. 키를 매번 새로 생성하지 않는다.
5. 최종 HTTPS 도메인에서 manifest/SW/192·512 아이콘이 200으로 제공되는지 확인한다.

초기 구현 시 비어 있던 로컬 VAPID 공개키·비밀키를 사용자가 입력했고, 2026-09-03 정상 키 쌍임을 확인했다.
최초 키 등록 당시 실행 중이던 `pass-on-english:24b2111`의 Compose 경로를 확인한 뒤
`/opt/pass-on-english/releases/24b2111/deploy/tencent-lighthouse/.env.production`에 두 키만 등록했다.
기존 `VAPID_SUBJECT`와 다른 설정은 보존했고 Supabase URL은 싱가포르를 유지했다.
로컬과 서버 파일의 두 키 일치를 값 출력 없이 재확인했다.
원본 백업: 같은 디렉터리의 `.env.production.pre-vapid-20260903T132319Z-1683392`.
환경파일과 백업 모두 `600 root:root`. 키 원문을 로그/채팅에 출력하지 않았다.
키 등록만 진행했던 시점에는 실행 컨테이너가 미반영 상태였다. 이후 아래 배포에서 브라우저 빌드와 런타임에 모두 반영했다.

## 앱 운영 배포 기록 (2026-09-03)

- 코드 커밋: `35bb9543a62387c7c1de34c1c7d88dc6fc92c9ae`, origin/main 푸시 완료.
- 운영 이미지: `pass-on-english:35bb954`, 이미지 config SHA256 `96877c245d6ffb07be0bba39a412221abb969834597b53277f27c9253e30d629`.
- 릴리스: `/opt/pass-on-english/releases/35bb954/deploy/tencent-lighthouse`.
- 앱 시작 시각: 2026-09-03 13:46:36 UTC (22:46:36 KST). healthcheck 통과 후 cron·nginx 전환 및 nginx 설정 검사 통과.
- 커밋 아카이브만 전송했고 SHA256 `873a65c0c553e40e7e7cebf1f2ab71e9303260e766c17b1f9fb67e82e596758d`를 서버에서 확인했다.
- 기존 운영 환경파일을 서버 내부에서 복사하고 `APP_IMAGE_TAG=35bb954`만 변경했다. 그 외 모든 변수의 동일성을 확인했다. 환경파일은 600 권한이며 이미지 빌드 컨텍스트에서 제외된다.
- 실제 서버 메모리 2GB에 맞춰 별도 BuildKit 빌더를 CPU 1코어·RAM 1200MB·메모리+스왑 2GB로 제한했다. 빌드 중 기존 health 응답 200 유지, 빌드 완료 후 빌더는 정지했다. 빌더 캐시는 다음 빌드에 재사용 가능하다.
- 새 이미지 검사 11개 통과: VAPID 키 쌍·브라우저 공개키 포함·비밀키/서비스키 비노출·구 프로젝트 비포함·Supabase/앱 URL·연락처·manifest scope·아이콘 크기·presence API.
- 운영 HTTPS 검사: ko/zh-CN/ko signup/teacher login/admin login/health HTTP 200, manifest id·scope, SW 소스 일치, 아이콘 크기, 실제 제공 JS의 공개키 포함·비밀키 비노출, 익명 presence/구독 POST 401.
- 운영 도메인에서 API 기본 거부 10개·선생님 프로필 권한/DTO 9개 통과. 로컬에서도 동일 검사와 production build·타입·PWA 모의 9그룹·회원가입/성능/i18n/RLS/proxy 경계 검사를 통과했다.
- 배포 후 확인 구간의 app/cron/nginx 오류 및 nginx 5xx 0건, 두 cron 작업 각각 2회 완료. 실제 채팅·Push는 임의로 발송하지 않았다.
- 이전 릴리스/이미지 `24b2111` 보존. 기존 환경파일의 태그가 당시 실행 이미지와 달랐으므로 롤백 때 반드시 명시적으로 이미지 태그를 지정한다. 별도 클라우드 스냅샷은 생성하지 않았다.

긴급 롤백(운영 승인 후 실행):

```sh
cd /opt/pass-on-english/releases/24b2111/deploy/tencent-lighthouse
sudo APP_IMAGE_TAG=24b2111 docker compose --env-file .env.production up -d --no-build --wait --wait-timeout 180
```

### 별도 후속 보안 점검

빌드 중 `npm audit` 경고가 있어 production 의존성만 재검사했다. high 4/moderate 1이며 critical은 0이다.
영향 패키지는 `nanoid`, `next`(전이 의존성), `next-intl`, `postcss`, `sharp`다.
일부 해결 제안이 메이저 버전 변경이므로 이번 배포에서 `npm audit fix --force`나 임의 업그레이드를 수행하지 않았다.
실제 사용 경로 영향과 호환성 확인 후 별도 업데이트가 필요하다. 경고 개수는 직접 취약점 개수와 같지 않다.
관련 원문: [nanoid](https://github.com/advisories/GHSA-2v37-7h3g-55p8),
[next-intl](https://github.com/advisories/GHSA-8f24-v5vv-gm5j),
[PostCSS](https://github.com/advisories/GHSA-qx2v-qp2m-jg93),
[sharp/libvips](https://github.com/advisories/GHSA-f88m-g3jw-g9cj).

## 043 운영 적용 기록 (2026-09-03)

- 실제 대상: `pass-on-english-prod-sg`, `mvngtkoqjejvwygikvhi`, `ap-southeast-1`. Management API 프로젝트 목록으로 확인했다.
- 로컬 CLI의 ignored `supabase/.temp`가 구 프로젝트를 가리켜 실행을 중단했다. 공식 CLI `link` 후 project-ref·pooler·linked-project가 싱가포르로 바뀐 것을 확인했다. 앱 `.env.local`은 이미 싱가포르였다.
- 선행 테이블·컬럼·`can_access_chat_room(uuid)`의 존재와 043 객체의 부재를 확인한 뒤, `db query --linked --file supabase/migrations/043_chat_push_presence.sql`로 파일의 BEGIN~COMMIT을 실행했다.
- 운영 DB에는 `supabase_migrations.schema_migrations`가 없었다. 전체 `db push`를 실행하지 않았고 기존 migration 이력도 임의로 만들지 않았다. 이력 정합화 전 전체 migration 재적용 금지.
- 검증: RLS 활성, expiry 인덱스, anon 테이블 차단, authenticated 직접 INSERT 차단, authenticated presence RPC 허용, anon/service-role presence RPC 차단, service-role 수신자 RPC 허용, anon/authenticated 수신자 RPC 차단, Realtime publication 제외, 두 함수의 postgres 소유·SECURITY DEFINER·고정 search_path — 12항목 모두 true.
- 실제 service-role/read-only 트랜잭션에서 존재하지 않는 메시지 ID로 수신자 RPC를 실행해 0행 반환 확인. 메시지·알림 발송이나 사용자 데이터 생성/수정/삭제는 하지 않았다.
- 043 적용 시 앱 배포, 키 생성/교체, 실제 기기 Push 검증은 수행하지 않았다. 이후 사용자 요청으로 운영 환경파일에 키를 등록한 기록은 위를 참고한다.

## VAPID 확인: 운영자용 순서

VAPID는 브라우저 Push 서비스에 이 서버가 알림 발신자임을 증명하는 공개키/비밀키 쌍이다.
Supabase API 키, 사용자별 `p256dh`/`auth`와는 다른 값이며 Supabase 설정 화면에서 발급받는 키가 아니다.

### 1. 현재 실행 중인 운영 릴리스 확인

Tencent 서버 `43.134.7.175`에 `ubuntu` 계정으로 접속한다. 실행 중인 app 컨테이너의 Compose 작업 경로를 확인하여
`/opt/pass-on-english/releases/<실제 실행 SHA>/deploy/tencent-lighthouse`로 이동한다.
가장 최근 폴더라는 이유만으로 운영 릴리스라고 가정하지 않는다.

```sh
docker ps --filter label=com.docker.compose.service=app --format '{{.ID}} {{.Image}} {{.Status}}'
# 아래 <확인한 컨테이너 ID>를 위 결과의 실제 값으로 대체한다.
docker inspect --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' <확인한 컨테이너 ID>
```

전체 `docker inspect`, `docker compose config`, `printenv`, `.env.production` 전체 출력은 하지 않는다. 다른 비밀도 함께 노출될 수 있다.

### 2. 운영 환경파일의 세 항목 확인

운영 릴리스의 `.env.production`을 비공개 편집기로 열어 다음 변수에 값이 있는지만 확인한다.

| 변수 | 역할 | 확인 사항 |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 브라우저 구독에 사용하는 공개키 | 비어 있지 않고, 비밀키와 동일한 쌍이어야 함 |
| `VAPID_PRIVATE_KEY` | 서버 발송 서명용 비밀키 | 서버에만 보관. `NEXT_PUBLIC_` 접두사 사용 금지 |
| `VAPID_SUBJECT` | 운영자 연락처 | 실제 연락 가능한 `mailto:이메일주소` 또는 HTTPS URL |

예시 파일의 연락처가 실제 관리되는 주소인지 확인한다. 키 원문은 채팅/스크린샷/Git에 공유하지 않는다.
로컬 파일이 비었다고 운영 파일도 비었다고 판단하지 않는다.

### 3. 실행 중인 서버의 키 쌍 확인 (값 출력 없음)

위에서 확인한 운영 Compose 디렉터리에서 다음 명령을 실행한다. DB·구독·키를 변경하거나 Push를 발송하지 않는다.
환경파일이 아니라 **현재 실행 중인 app 컨테이너가 실제로 가진 값**을 검사한다.

```sh
docker compose --env-file .env.production exec -T app node - <<'NODE'
const { createECDH } = require('node:crypto');
const pub = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim();
const priv = (process.env.VAPID_PRIVATE_KEY || '').trim();
const subject = (process.env.VAPID_SUBJECT || '').trim();
console.log('Public key:', pub ? 'PRESENT' : 'MISSING');
console.log('Private key:', priv ? 'PRESENT' : 'MISSING');
console.log('Subject:', subject ? 'PRESENT (verify contact privately)' : 'MISSING (app uses default contact)');
let match = false;
try {
  const publicBytes = Buffer.from(pub, 'base64url');
  const privateBytes = Buffer.from(priv, 'base64url');
  if (!/^[A-Za-z0-9_-]+$/.test(pub) || !/^[A-Za-z0-9_-]+$/.test(priv) ||
      publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32) {
    throw new Error('Invalid key format');
  }
  const key = createECDH('prime256v1');
  key.setPrivateKey(privateBytes);
  match = key.getPublicKey().equals(publicBytes);
} catch {}
console.log('Key pair:', match ? 'MATCH' : 'MISSING / INVALID / MISMATCH');
process.exitCode = match ? 0 : 1;
NODE
```

- `PRESENT`, `PRESENT`, `MATCH`: 서버 런타임의 키 쌍은 정상. 아직 브라우저 빌드·실제 전송까지 검증된 것은 아니다.
- `MISSING`: 실행 컨테이너에 키가 없으므로 환경파일과 컨테이너 생성 시점의 설정을 확인한다.
- `INVALID / MISMATCH`: 키 형식 또는 짝이 잘못됐다. 기존 비밀 저장소의 원래 쌍을 먼저 확인한다.
- 파일은 정상인데 컨테이너가 비정상: 파일 변경이 실행 환경에 반영되지 않은 상태일 수 있다.

### 4. 기존 키 재사용 또는 최초 생성 판단

기존 정상 키 쌍이 있으면 그대로 사용한다. 점검/배포할 때마다 생성하지 않는다.
키가 한쪽만 있거나 짝이 다르면 먼저 원래 키를 복구한다.
정말 최초 설정이라면 신뢰할 수 있는 환경에서 `web-push`의 `generateVAPIDKeys()`로 한 쌍을 생성해
비밀 저장소와 운영 환경파일에 안전하게 저장한다. 생성 결과를 공유 터미널·채팅·로그에 출력하지 않는다.
키를 바꾸면 기존 브라우저 구독의 재구독이 필요할 수 있으므로 임의 교체하지 않는다.

### 5. 공개키를 반영한 앱 빌드·배포

현재 프로젝트는 공개키를 Docker build argument로 전달한다.
`NEXT_PUBLIC_*`는 Next.js 빌드 때 브라우저 코드에 고정되므로 `.env.production` 수정이나 컨테이너 재시작만으로
기존 브라우저 코드가 바뀌지 않는다. 올바른 공개키로 새 이미지 빌드 → 새 릴리스 배포 → 브라우저 새로고침이 필요하다.
비밀키는 런타임 환경으로만 전달한다. 배포는 별도 승인 후 `AI_GUIDE.md` 절차에 따라 수행한다.

### 6. 실제 구독·알림 확인 (배포 후)

1. HTTPS 운영 주소에 학생 또는 선생님으로 로그인한다.
2. “채팅 및 수업 알림 켜기”를 직접 누르고 브라우저 알림 권한을 허용한다.
3. 개발자 도구 Network에서 `/api/push/subscribe` 성공 여부를 확인한다. 요청 본문에는 구독 비밀이 있으므로 공유하지 않는다.
4. 운영 DB에서 본인 계정의 `push_subscriptions` 행 존재만 확인한다. `endpoint`, `p256dh`, `auth`를 복사하거나 출력하지 않는다.
5. 수신 기기에서 해당 채팅방을 벗어나거나 앱을 백그라운드로 보내고, 다른 테스트 계정으로 일반 채팅을 전송한다. 알림을 누르면 해당 방으로 이동해야 한다.
6. 같은 방을 보며 Realtime이 연결된 경우 별도 Push가 생략되는지, 학생→선생님과 선생님→학생 양방향을 확인한다.
7. iPhone/iPad는 iOS/iPadOS 16.4 이상에서 홈 화면에 추가한 웹 앱을 열고 알림 버튼을 누른다. OS 알림 설정·집중 모드도 확인한다.

앱 설치 성공, 키 쌍 일치, DB 구독 저장, 실제 알림 수신은 서로 다른 검증 단계다.
브라우저·OS·네트워크 정책에 따라 설치/알림 동작에 제약이 있을 수 있다.

근거: [web-push 키 생성·사용](https://github.com/web-push-libs/web-push),
[Next.js 공개 환경변수 빌드 시점 고정](https://nextjs.org/docs/app/guides/environment-variables),
[WebKit iOS Web Push 조건](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

## 검증

- `npm run test:pwa-push`: 브라우저/서버 모의 테스트. 권한 요청, 중복 저장, 오류 재시도, 키 교체, 수신자 분기, 404/410, 탭 숨김·cleanup, SQL 권한 구조, 알림 링크를 검증한다.
- `npx tsc --noEmit`, `npm run build`, 회원가입·채팅 성능·i18n 경계 검사.
- migration은 별도 테스트 DB에서 실행해 학생이 다른 사용자의 presence를 쓸 수 없는지, 무관한 방이 거부되는지, anon/authenticated가 수신자 RPC를 호출할 수 없는지 확인한다.
- 학생→선생님, 선생님→학생, 관리자→양쪽: 열린 방/다른 방/숨긴 탭/닫은 앱/두 기기 조합에서 확인한다.
- 공개 ko/zh-CN은 강제 배너가 없어야 한다. 설치 이벤트 후 버튼, 설치 취소 후 7일 숨김, 설치 완료 후 숨김을 확인한다.
- iPhone/iPad는 홈 화면에 추가한 앱으로 실행하고 버튼을 눌러 권한을 허용한다. Android Chrome에서도 설치·Push·채팅 링크를 확인하고, PC Chrome/Edge에서는 설치·Push UI가 숨겨지는지 확인한다.
- 잠금 화면·중국 현지망·OS 알림 차단은 실제 기기에서 확인한다. 단위 테스트 통과가 실제 전달 성공을 보장하지 않는다.

## 한계

2026-09-03 검증 결과: TypeScript·production build, PWA/Push 모의 검사 9그룹,
회원가입·채팅 성능·i18n·RLS 구조·proxy 경계 검사 통과.
실행 중인 로컬 서버의 기존 계정으로 API 기본 거부 10개, 선생님 프로필 권한 9개 통과.
localhost에서 ko/zh-CN 공개 페이지, manifest, SW, 192/512 아이콘 모두 HTTP 200 확인.
새 presence 및 Push 구독 API의 익명 POST는 HTTP 401 확인.
초기 샌드박스 외부 연결 차단으로 발생한 인증 오류는 연결 허용 후 재검사로 해소됐다.
Browser 도구는 로컬 실행 환경 오류로 시작되지 않았으며 시각적/실기기 검증은 미완료다.
운영 DB에 데이터를 생성·삭제하는 `test:transactions`는 실행하지 않았다.
043 SQL은 운영 적용·권한 검사 및 service-role 읽기 전용 실행까지 완료했다.
실제 계정의 채팅방 소유권/접속 갱신 시나리오는 별도 테스트 환경 또는 승인된 테스트 계정으로 추가 검증해야 한다.

- 비정상 종료로 이탈 요청이 전달되지 않으면 마지막 lease가 최대 90초 남을 수 있다. 그동안 같은 방의 Push가 생략될 수 있다.
- `after`는 요청 응답을 늦추지 않는 서버 후처리이며 영속 큐는 아니다. 프로세스 강제 종료 시 재시도 보장은 없다. 무손실 전달이 필요하면 outbox/worker를 후속으로 추가한다.
- 수업 알림 구독 UI는 공통 알림 수신 설정이다. 수업 10분 전 알림 등 자동 규칙 엔진을 새로 구현한 것은 아니다.

브라우저 기준: [MDN 설치 이벤트](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event), [WebKit iOS Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after).
