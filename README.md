# Pass on English

필리핀 원어민 화상 영어 플랫폼 — Next.js PWA

> AI와 개발자는 작업 전에 반드시 [`AI_GUIDE.md`](AI_GUIDE.md)를 읽어야 합니다. 운영 인프라, Supabase 대상과 배포 안전 규칙의 최우선 SSOT입니다.

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 접근 URL (역할별 분리)

| 역할 | URL |
|------|-----|
| **학생·랜딩** | `/ko`, `/zh-CN` |
| 학생 로그인 | `/ko/login`, `/zh-CN/login` |
| **선생님 전용** | `/teacher/login` → `/teacher` |
| **관리자 전용** | `/admin/login` → `/admin` |

> 영문 랜딩(`/en`)은 제공하지 않습니다.  
> 선생님·관리자 포털은 랜딩/요금 UI 없이 전용 로그인만 사용합니다.

## Tech Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS 4 + Shadcn-style UI
- next-intl (ko / zh-CN — 학생·랜딩)
- Supabase (Auth, PostgreSQL, Realtime, Storage)
- PWA manifest + Web Push

## Documentation

- [AI_GUIDE.md](AI_GUIDE.md) — AI 작업 및 운영 대상 SSOT
- [개발요청서_현재빌드및향후계획.md](docs/개발요청서_현재빌드및향후계획.md) — 현재 구현·운영 상태와 후속 계획
- [front.md](docs/front.md) — Frontend spec
- [backend.md](docs/backend.md) — Backend spec
- [db.md](docs/db.md) — Database spec
- [guide.md](docs/guide.md) — Project guide
