# ASRO — AWS + asro.uz deployment guide

How to run ASRO (Next.js web app **+** Telegram KPI bot) in production on AWS,
served at **https://asro.uz**. Two runtime processes share one Postgres and one
Redis.

```
                          ┌──────────────────────────────────────────┐
   Telegram  ── webhook ──┤  nginx / ALB  (TLS for asro.uz)          │
   Browsers  ── https  ───┤     │                                    │
                          │     ▼                                    │
                          │  Next.js  (npm start, :3000)             │
                          │     • web UI + Server Actions            │
                          │     • POST /api/telegram/webhook → Redis │
                          │     • GET  /api/health                   │
                          │                                          │
                          │  Bot worker (npm run bot:start)          │
                          │     • BullMQ workers (message/question)  │
                          │     • cron (deadline sweep + billing)    │
                          └──────┬───────────────────────┬───────────┘
                                 ▼                       ▼
                          PostgreSQL (RDS)         Redis (ElastiCache)
```

The **web** process receives Telegram webhooks and only *enqueues* them; the
**bot worker** consumes the queue and does all the work. Both need Redis + DB.

---

## 1. AWS building blocks

| Component | Recommended | Minimal (single box) |
|---|---|---|
| Compute | EC2 `t3.medium` (or ECS/Fargate) | one EC2 `t3.small` |
| Database | RDS PostgreSQL 16, Multi-AZ, automated backups | Postgres in Docker on the EC2 |
| Cache/queue | ElastiCache Redis 7 | Redis in Docker on the EC2 |
| TLS / domain | ACM cert on an ALB, **or** nginx + certbot on EC2 | nginx + certbot |
| DNS | Route 53 `A`/`ALIAS` `asro.uz` → ALB/EC2 IP | Route 53 `A` → EC2 Elastic IP |

Security groups: open **443** (and 80 for the certbot HTTP-01 challenge) to the
world; keep **5432/6379** private (only the app SG). Never expose Postgres/Redis
publicly.

---

## 2. DNS (Route 53)

- `asro.uz` → A/ALIAS record to the ALB (managed) or the EC2 Elastic IP (self-managed).
- `www.asro.uz` → redirect to `asro.uz` (optional).
- Point the record before requesting the TLS cert (certbot/ACM validate the domain).

---

## 3. Production environment

Create `/opt/asro/.env` from `.env.example`. The production-critical values:

```dotenv
DATABASE_URL="postgresql://asro:STRONGPASS@asro-db.xxxx.rds.amazonaws.com:5432/asro?schema=public"
AUTH_SECRET="<openssl rand -base64 32>"
AUTH_URL="https://asro.uz"
NEXTAUTH_URL="https://asro.uz"
AUTH_TRUST_HOST="true"                      # REQUIRED behind nginx/ALB
CREDENTIALS_SECRET="<a second openssl rand -base64 32>"
NEXT_PUBLIC_SITE_URL="https://asro.uz"

REDIS_URL="redis://asro-redis.xxxx.cache.amazonaws.com:6379"

TELEGRAM_BOT_TOKEN="<from @BotFather>"
TELEGRAM_WEBHOOK_SECRET="<openssl rand -hex 32>"   # REQUIRED — webhook 503s without it
TELEGRAM_ADMIN_TELEGRAM_ID="<your numeric TG id>"
BOT_MODE="webhook"

GEMINI_API_KEY="<optional — powers the bot classifier AND the in-app AI assistant>"
BILLING_ENABLED="true"
BILLING_CRON_HOUR="9"
```

> `chmod 600 /opt/asro/.env` and keep it out of git (it already is). Prefer AWS
> SSM Parameter Store / Secrets Manager for the secrets in a hardened setup.

---

## 4. Database bring-up

The repo currently uses **`prisma db push`** (no migration history). For a first
deploy that is fine; for ongoing change management, adopt `prisma migrate`
(see `PRODUCTION_REPORT.md` §7).

### 4a. One-command deploy (recommended)

`scripts/deploy.sh` runs the whole release **and refuses to restart the app
unless the system can accept logins** — the exact failure that once shipped an
empty `User` table. It is idempotent and safe to re-run.

```bash
cd /opt/asro
# First deploy: pass the admin creds so the bootstrap can create the account.
ADMIN_EMAIL=admin@asro.uz ADMIN_PASSWORD='<≥8 chars>' npm run deploy
# Later deploys: creds optional — the admin already exists (step is a no-op).
npm run deploy
```

It runs, in order and failing loudly on any error:
`preflight env` → `npm ci` → `prisma db push` → seed KPI rules →
`create-admin` (idempotent) → `npm run build` → **full preflight** (DB reachable,
schema applied, `User` table non-empty, admin present) → PM2/systemd reload.

### 4b. Manual equivalent

```bash
cd /opt/asro
npm ci
npx prisma db push                     # create the schema on RDS
npx tsx scripts/seed-kpi-rules-v2.ts   # seed KPI rules (required by KPI/bot)
ADMIN_EMAIL=admin@asro.uz ADMIN_PASSWORD='<≥8 chars>' npm run create:admin
npm run preflight                      # MUST print "Preflight passed" before serving traffic
```

> `npm run preflight` (or `npx tsx scripts/preflight.ts`) is the guardrail:
> non-zero exit on missing env, unreachable DB, unapplied schema, an empty
> `User` table, or a missing admin. Wire it as the last step of any deploy.

---

## 5. Build

```bash
cd /opt/asro
npm ci
npm run build      # produces .next/
```

Do this on the box, in CI, or in the Docker image (§8b).

---

## 6. nginx + TLS (self-managed option)

`/etc/nginx/sites-available/asro.uz`:

```nginx
server {
    listen 80;
    server_name asro.uz www.asro.uz;
    # certbot serves the ACME challenge here; everything else → https
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://asro.uz$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name asro.uz;

    ssl_certificate     /etc/letsencrypt/live/asro.uz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/asro.uz/privkey.pem;

    # Report proofs are base64 images sent through Server Actions (4 MB limit).
    client_max_body_size 8m;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;   # lets next-auth know it's https
        proxy_read_timeout 60s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/asro.uz /etc/nginx/sites-enabled/
sudo certbot --nginx -d asro.uz -d www.asro.uz     # issues + auto-renews the cert
sudo nginx -t && sudo systemctl reload nginx
```

> The app already emits HSTS/X-Frame-Options/nosniff/Referrer-Policy headers
> (`next.config.ts`), so nginx doesn't need to. On an **ALB** instead of nginx:
> attach an ACM cert, forward 443→3000, and set the same `client_max_body_size`
> equivalent via the target group / no body limit.

---

## 7. Run the two processes

### 7a. systemd (recommended on a plain EC2)

`/etc/systemd/system/asro-web.service`:

```ini
[Unit]
Description=ASRO web (Next.js)
After=network.target

[Service]
WorkingDirectory=/opt/asro
EnvironmentFile=/opt/asro/.env
Environment=NODE_ENV=production PORT=3000
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
User=asro

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/asro-bot.service`:

```ini
[Unit]
Description=ASRO Telegram bot worker
After=network.target

[Service]
WorkingDirectory=/opt/asro
EnvironmentFile=/opt/asro/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run bot:start
Restart=always
RestartSec=5
User=asro

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now asro-web asro-bot
sudo systemctl status asro-web asro-bot
journalctl -u asro-bot -f     # tail bot logs
```

### 7b. Docker Compose (all-in-one)

The repo ships `Dockerfile` + `docker-compose.yml` (Postgres + Redis + web +
bot). Verify the build first, then:

```bash
docker compose build
docker compose up -d db redis
docker compose run --rm web npx prisma db push
docker compose run --rm web npx tsx scripts/seed-kpi-rules-v2.ts
docker compose run --rm -e ADMIN_EMAIL=admin@asro.uz -e ADMIN_PASSWORD='<≥8 chars>' web npm run create:admin
docker compose run --rm web npm run preflight   # gate: must pass before serving
docker compose up -d
```

Put nginx/ALB in front of the `web` container's port 3000 for TLS.

---

## 8. Register the Telegram webhook (do this AFTER TLS is live)

Nothing reaches the bot until Telegram is told the URL + secret. The repo now
ships a script:

```bash
cd /opt/asro
npm run bot:webhook            # set  → https://asro.uz/api/telegram/webhook
npm run bot:webhook info       # verify (url, pending_update_count, last_error)
# npm run bot:webhook delete   # to switch back to polling
```

It also opts in to `edited_message` + `message_reaction` (not delivered by
default) and registers the command menu (`/start /whoami /help /bind /link`).

**Sanity check** `bot:webhook info` should show your URL and
`"last_error_message"` empty. A `401`/`403` there means the secret in `.env`
doesn't match what was registered.

---

## 9. Post-deploy smoke test

- [ ] `npm run preflight` → `Preflight passed …` (exit 0) — env + DB + admin.
- [ ] `curl https://asro.uz/api/health` → `{"status":"ok","db":"ok"}` (200).
- [ ] Browser: login at `https://asro.uz/login` with the admin account.
- [ ] `npm run bot:webhook info` → correct URL, no `last_error`.
- [ ] Add the bot to a Telegram group, send `/whoami` → it replies.
- [ ] `/bind <INN>` in a group (as admin) → group binds to the company.
- [ ] Post a question-like message in a bound group → a `Question` row is
      created (check DB / dashboard); leave it past the deadline → cron marks it
      `late` and records a KPI penalty.
- [ ] `journalctl -u asro-bot` shows `worker(s) + cron up` and no errors.

---

## 10. Scaling & operational notes

- **The bot worker must run as a single instance.** Its cron (`bot/cron/scheduler.ts`)
  uses in-process `setInterval`; two bot instances would double-run the sweep.
  The BullMQ *workers* are safe to scale, but keep exactly one process that owns
  the cron (or split the cron into its own single-replica service).
- **The web tier scales horizontally** — sessions are stateless JWTs, so no
  sticky sessions needed. All instances share RDS + ElastiCache.
- **Redis durability**: enable AOF/persistence (ElastiCache: append-only or
  snapshotting) so queued updates survive a restart. Telegram redelivers on 5xx
  and the `ProcessedUpdate` ledger dedups, so at-least-once is safe.
- **Backups**: RDS automated backups + PITR. The KPI ledger (`KpiEvent`) and
  payroll data are financial — treat backups as mandatory.
- **Health**: point the ALB target-group health check (or an uptime monitor) at
  `/api/health` (200 vs 503 drains unhealthy instances).
- **Gemini quota**: if `GEMINI_API_KEY` is unset or rate-limited, the bot falls
  back to the heuristic classifier automatically — no outage, lower accuracy.

---

## 11. Production hardening still open

These are tracked in `PRODUCTION_REPORT.md` and are **not** deploy-blockers but
should be scheduled: login rate limiting, encrypting `Company.password`, Prisma
migrations, Sentry/structured logging, and enabling the documented CSP.
```
