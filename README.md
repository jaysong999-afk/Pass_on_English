# Pass on English

필리핀 원어민 화상 영어 플랫폼 — Next.js PWA

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
- Supabase (Auth, DB — skeleton)
- PWA manifest (Web Push stub)

## Documentation

- [front.md](docs/front.md) — Frontend spec
- [backend.md](docs/backend.md) — Backend spec
- [db.md](docs/db.md) — Database spec
- [guide.md](docs/guide.md) — Project guide
