# Tencent Cloud Lighthouse (Hong Kong) deployment

This directory is the production deployment package for one Hong Kong Lighthouse
instance. Supabase remains external; only the Next.js application, its minute
scheduler, and the reverse proxy run on Lighthouse.

## Recommended instance

- Region: Hong Kong (China)
- OS: Ubuntu 24.04 LTS x86_64
- Minimum: 2 vCPU / 4 GB RAM / 60 GB SSD
- Firewall: allow TCP 80 and 443 from the internet; allow TCP 22 only from the
  administrator IP; do not expose port 3000
- Enable automatic snapshots before application upgrades

The 4 GB recommendation leaves headroom for an on-server Next.js Docker build.
For a 2 GB plan, build and push the image from CI instead of building on the host.

## Files and secrets

On the server, place the repository at `/opt/pass-on-english`, then run:

```bash
cd /opt/pass-on-english/deploy/tencent-lighthouse
cp .env.production.example .env.production
chmod 600 .env.production
```

Fill every placeholder in `.env.production`. Public `NEXT_PUBLIC_*` values are
embedded during `docker compose build`, so changing them requires a rebuild.
Never copy `.env.local` to the server without reviewing it.

Generate a production cron secret with:

```bash
openssl rand -base64 48
```

Generate production Web Push keys once with:

```bash
npx web-push generate-vapid-keys
```

## First HTTP start

Docker Engine with the Compose plugin must be installed first. From this directory:

```bash
docker compose --env-file .env.production config
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d
docker compose ps
curl --fail http://127.0.0.1/api/health
docker compose logs --tail=100 app cron nginx
```

The `cron` service calls both protected maintenance routes once per minute. It is
not reachable from the public network. The app container is also private; only
Nginx publishes port 80 at this stage.

## DNS and HTTPS gate

Before production traffic:

1. Point the service domain A record to the Lighthouse public IPv4 address.
2. Confirm the record from Korea and mainland China.
3. Install the selected TLS certificate and change Nginx to publish 443.
4. Set `NEXT_PUBLIC_APP_URL=https://<production-domain>` and rebuild.
5. Confirm HTTP redirects to HTTPS and `/api/health` returns HTTP 200.
6. Confirm PWA installation and Web Push on the final HTTPS origin.

The repository deliberately starts with HTTP-only Nginx until the real domain and
certificate method are confirmed; it must not be treated as production-ready HTTPS.

## Upgrade and rollback

Before each upgrade, take a Lighthouse snapshot and set a unique image tag:

```bash
APP_IMAGE_TAG=$(git rev-parse --short HEAD) docker compose --env-file .env.production build
APP_IMAGE_TAG=$(git rev-parse --short HEAD) docker compose --env-file .env.production up -d
```

Keep the preceding image tag until health, login, cron, student, teacher, and admin
smoke tests pass. Roll back by restoring that tag in `.env.production` and running
`docker compose up -d` again.

## Required post-start checks

- `/ko` and `/zh-CN` load over HTTPS
- student, teacher, and admin login/authorization boundaries still pass
- student KST and teacher Manila time displays describe the same lesson instant
- cron logs show successful broadcast and enrollment-hold maintenance calls
- browser console has no errors on the three portals
- real access test succeeds from both Korea and mainland China
- Lighthouse traffic quota, CPU, memory, disk, and availability alerts are enabled
