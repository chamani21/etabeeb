# eTabeeb Production Deployment Guide

## Architecture

```
Internet → Reverse Proxy (nginx/Caddy, TLS) → etabeeb-web (127.0.0.1:3000)
                                           ↓
                                    Existing PostgreSQL
                                    Existing Redis (optional)
```

- **Framework**: Next.js 14 App Router (monorepo: `apps/web`)
- **Database**: PostgreSQL with Drizzle ORM (`packages/db`)
- **Auth**: NextAuth.js v4 (JWT strategy)
- **Video**: LiveKit (optional; demo mode without keys)
- **Notifications**: WhatsApp Cloud API + Resend email
- **Base path**: `/etabeeb/` (all assets and routes under this prefix)

---

## Prerequisites on VPS

- Docker Engine ≥ 24 and Docker Compose v2
- SSH access to the VPS
- Existing PostgreSQL instance (do **not** create a new one)
- Reverse proxy already configured (nginx, Caddy, or Traefik)
- Git installed

---

## Step-by-step Deployment

### 1. Clone or pull the repository

```bash
# First deploy
git clone git@github.com:chamani21/etabeeb1.git /home/antigravity/workspaces/etabeeb
cd /home/antigravity/workspaces/etabeeb
git checkout main

# Subsequent deploys
git pull origin main
```

### 2. Create .env.production (VPS-only, never committed)

```bash
cp .env.production.example .env.production
nano .env.production   # fill in all values
```

Required variables:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://etabeeb.online/etabeeb` |
| `NEXTAUTH_URL` | `https://etabeeb.online/etabeeb` |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `DATABASE_URL` | `postgresql://user:pass@localhost:5432/etabeeb` |
| `LIVEKIT_URL` | LiveKit server URL (or leave blank) |
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `WHATSAPP_PHONE_ID` | WhatsApp Cloud phone ID |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp Cloud access token |
| `RESEND_API_KEY` | Resend email API key |

### 3. Run database migrations (before starting the app)

```bash
DATABASE_URL="<your-connection-string>" \
  npx drizzle-kit migrate \
  --config packages/db/drizzle.config.ts
```

Or using the migration container:

```bash
docker compose -f compose.production.yml \
  --env-file .env.production \
  run --rm etabeeb-migrate
```

The initial migration file is at `packages/db/migrations/0000_skinny_photon.sql` (44 tables).

### 4. Build the Docker image

```bash
docker compose -f compose.production.yml \
  --env-file .env.production \
  build etabeeb-web
```

### 5. Blue/Green – Start the new container on a staging port first

```bash
# Start on port 3001 to test before switching
docker run -d --name etabeeb-blue \
  --env-file .env.production \
  -p 127.0.0.1:3001:3000 \
  etabeeb-web:latest

# Smoke test
curl -sf http://127.0.0.1:3001/etabeeb/api/health && echo "HEALTHY"
```

### 6. Switch traffic and start with restart policy

```bash
# Stop staging container
docker stop etabeeb-blue && docker rm etabeeb-blue

# Start production container
docker compose -f compose.production.yml \
  --env-file .env.production \
  up -d etabeeb-web
```

### 7. Configure reverse proxy

Add to your nginx/Caddy config:

**nginx snippet:**
```nginx
location /etabeeb/ {
    proxy_pass         http://127.0.0.1:3000/etabeeb/;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade $http_upgrade;
    proxy_set_header   Connection "upgrade";
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
}
```

**Caddy snippet:**
```
handle_path /etabeeb/* {
    reverse_proxy 127.0.0.1:3000
}
```

### 8. Verify the deployment

```bash
# Health check
curl https://etabeeb.online/etabeeb/api/health

# Check container logs
docker compose -f compose.production.yml logs -f etabeeb-web
```

---

## Rollback

```bash
# Stop the new container
docker compose -f compose.production.yml down etabeeb-web

# Restart previous image
docker run -d --name etabeeb-web-rollback \
  --env-file .env.production \
  -p 127.0.0.1:3000:3000 \
  --restart unless-stopped \
  etabeeb-web:previous
```

---

## Maintenance

### View logs
```bash
docker compose -f compose.production.yml logs --tail=100 -f etabeeb-web
```

### Restart
```bash
docker compose -f compose.production.yml restart etabeeb-web
```

### Update (pull new image, re-deploy)
```bash
git pull origin main
docker compose -f compose.production.yml build etabeeb-web
docker compose -f compose.production.yml up -d etabeeb-web
```

---

## Ports Summary

| Port | Service | Bound to |
|------|---------|----------|
| `3000` | Next.js web + API | `127.0.0.1` (reverse proxy only) |

---

## Health Check Endpoint

`GET /etabeeb/api/health` → `200 OK` when the application and database are available.
The container probe uses `127.0.0.1` because the Next.js server listens on IPv4; inside the
container, `localhost` resolves to IPv6 first and can report a false connection refusal.

---

## Database Migration Command

```bash
DATABASE_URL="<connection>" npx drizzle-kit migrate --config packages/db/drizzle.config.ts
```

Migration file: `packages/db/migrations/0000_skinny_photon.sql` (44 tables, first run only)

---

## Important Notes

- **Do not** run `docker compose up` without reviewing the existing VPS containers first.
- **Do not** expose port 3000 publicly; always behind the reverse proxy.
- **Do not** commit `.env.production` to Git — it is in `.gitignore`.
- The `private-uploads/` volume stores medical documents — back it up regularly.
- NextAuth session cookies are `httpOnly; secure; sameSite=lax`.
