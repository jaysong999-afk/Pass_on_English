# PWA 로그인 세션 유지

2026-09-05 구현. 운영 배포는 별도다.

## 원인과 수정

- 설치된 PWA의 `start_url`은 `/`였지만, middleware가 `/`를 무조건 공개 랜딩으로 보냈다. 이제 `/?source=pwa`로 시작하고 유효한 세션의 역할을 확인해 학생은 언어별 학생 홈, 선생님은 선생님 홈으로 보낸다. 비로그인 사용자는 기존 언어별 랜딩으로 간다.
- Supabase SSR의 현재 설치 버전은 인증 쿠키에 기본 400일 `Max-Age`를 사용하므로 단순 누락이 직접 원인은 아니었다. 제품 정책을 명확히 하기 위해 로그인·갱신 쿠키를 30일로 통일하고 `Path=/`, `SameSite=Lax`, 운영 `Secure`를 명시했다. 활동 중 토큰이 갱신되면 30일 수명도 다시 설정된다.
- SSR 패키지가 현재 버전에서 사용자 지정 `maxAge`보다 자체 기본값을 우선하는 동작을 보완하기 위해, 실제 `setAll` 쓰기 직전에 30일 옵션을 적용한다. 로그아웃·무효 세션 정리용 `Max-Age=0`은 그대로 보존한다.
- middleware가 세션을 갱신한 뒤 권한 오류나 로그인 리다이렉트용 새 `NextResponse`를 만들 때 갱신/삭제 쿠키가 빠질 수 있었다. 모든 파생 응답으로 쿠키를 복사한다.
- 일반 공개 페이지는 기존대로 인증 조회를 생략한다. PWA 진입점 `/`만 역할별 자동 연결을 위해 인증을 확인하므로 공개 페이지 전체의 Supabase 트래픽은 늘리지 않는다.

## 검증

- `npm run test:pwa-session`: 쿠키 옵션, 삭제 의미, 리다이렉트 쿠키 전달, manifest 진입점을 정적으로 검사한다.
- 두 번째 인수로 실행 주소를 주면 학생·선생님 API 로그인 → 영속 `Set-Cookie` 속성 확인 → 새 프로세스를 모의한 Cookie-only 요청 → `/` 역할별 자동 연결 → 포털 접근 → 테스트 세션 로그아웃까지 검사한다.

```sh
npm run test:pwa-session -- http://localhost:3100
```

- `npx tsc --noEmit`, `npm run build`, 기존 proxy/PWA Push/auth/i18n 경계 검사도 함께 실행한다.

## 보장 범위

브라우저/PWA 저장소가 유지되고 Supabase refresh session이 서버에서 유효한 동안에는 앱 종료·기기 재부팅 후에도 로그인 상태가 유지된다. 사용자가 로그아웃하거나 사이트 데이터를 삭제한 경우, 30일 동안 갱신 활동이 없는 경우, 관리자가 세션을 종료한 경우, OS가 저장 공간 정책에 따라 사이트 데이터를 삭제한 경우에는 다시 로그인해야 한다.

근거: [Supabase SSR 세션](https://supabase.com/docs/guides/auth/server-side), [Supabase SSR 고급 가이드](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [Supabase SSR 클라이언트 구성](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs).
