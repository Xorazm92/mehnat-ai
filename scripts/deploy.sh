#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ASRO — production deploy / release script.
#
# Fails loudly (set -euo pipefail) the moment anything is wrong, and NEVER
# restarts the app unless the final readiness gate passes. Idempotent: safe to
# re-run. This is the guardrail that makes "schema but no users → login broken"
# impossible to ship again.
#
#   Usage (from the app dir, e.g. /opt/asro):
#     ADMIN_EMAIL=admin@asro.uz ADMIN_PASSWORD='strong-pass' ./scripts/deploy.sh
#
# On first deploy ADMIN_EMAIL/ADMIN_PASSWORD are required (to create the admin).
# On later deploys they are optional — the admin already exists and the step is
# a no-op. Env is read from the shell + .env (systemd/PM2 EnvironmentFile).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."
echo "▶ Deploying ASRO from $(pwd)"

# 1) Fail fast on missing env BEFORE doing any expensive work.
echo "▶ [1/7] Verifying environment variables…"
npx tsx scripts/preflight.ts env

# 2) Install exact dependencies from the lockfile.
echo "▶ [2/7] Installing dependencies (npm ci)…"
npm ci

# 3) Apply versioned migrations (NOT `db push`). Idempotent: already-applied
#    migrations are skipped. IMPORTANT — a prod DB previously built with `db push`
#    must be baselined ONCE before the first migrate-deploy, else CREATE TABLE
#    fails on existing tables. Run `scripts/migrate-baseline.sh` on such a DB.
echo "▶ [3/7] Applying database migrations (prisma migrate deploy)…"
npx prisma migrate deploy

# 4) Seed REAL reference data (KPI rules) required by the KPI engine + bot.
#    No mock/demo data is ever seeded in production.
echo "▶ [4/7] Seeding KPI rules (real reference data)…"
npx tsx scripts/seed-kpi-rules-v2.ts

# 5) Bootstrap the admin — idempotent; only creates it when missing.
echo "▶ [5/7] Ensuring admin account…"
npx tsx scripts/create-admin.ts

# 6) Build the Next.js production bundle.
echo "▶ [6/7] Building Next.js bundle…"
npm run build

# 7) FINAL readiness gate — env + DB + schema + non-empty User table + admin.
#    Deployment aborts here (non-zero exit) if the system can't accept logins.
echo "▶ [7/7] Preflight verification (DB + schema + admin)…"
npx tsx scripts/preflight.ts

# Restart the app if a process manager is present (never fatal if absent).
if command -v pm2 >/dev/null 2>&1 && [ -f ecosystem.config.cjs ]; then
  echo "▶ Reloading PM2 (zero-downtime)…"
  pm2 reload ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
elif command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q '^asro-web'; then
  echo "▶ Restarting systemd services…"
  sudo systemctl restart asro-web asro-bot
else
  echo "ℹ No PM2/systemd unit detected — restart the app process manually."
fi

echo "✅ Deploy complete — system verified login-capable."
