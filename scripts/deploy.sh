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

# 4) Seed REAL reference data (KPI rules + deadline templates) required by the
#    KPI engine, the compliance engine and the bot. No mock/demo data is ever
#    seeded in production. Both are idempotent upserts.
#    `--no-generate`: seeding must not create obligations as a side effect —
#    generation is a separate, explicit step (scripts/generate-obligations.ts),
#    otherwise every deploy would silently backfill periods.
echo "▶ [4/7] Seeding reference data (KPI rules + deadline templates)…"
npx tsx scripts/seed-kpi-rules-v2.ts
npx tsx scripts/seed-deadline-templates.ts --no-generate

# 5) Bootstrap the admin — idempotent; only creates it when missing.
echo "▶ [5/7] Ensuring admin account…"
npx tsx scripts/create-admin.ts

# 6) Build the Next.js production bundle.
echo "▶ [6/7] Building Next.js bundle…"
npm run build

# 7) FINAL readiness gate — env + DB + schema + non-empty User table + admin.
#    Deployment aborts here (non-zero exit) if the system can't accept logins.
# Dalil ombori — DALILLAR ENDI BAZADA EMAS, DISKDA (D1).
#
# `pg_dump` YOLG'IZ O'ZI to'liq zaxira emas va bu katalog deploy bilan birga
# kelmaydi: u serverning o'zida yashaydi va relizlar orasida saqlanadi.
# Yo'q bo'lsa birinchi skrinshot yuklashda ENOENT bilan yiqilardi — ya'ni
# nosozlik deploy paytida emas, buxgalter ish qilayotganda ko'rinardi.
# Shuning uchun mavjudligi SHU YERDA kafolatlanadi.
FILES_ROOT="${ASRO_FILES_ROOT:-./storage/files}"
echo "▶ Ensuring evidence store exists ($FILES_ROOT)…"
mkdir -p "$FILES_ROOT"
[ -w "$FILES_ROOT" ] || { echo "✗ Evidence store is not writable: $FILES_ROOT"; exit 5; }

echo "▶ [7/7] Preflight verification (DB + schema + admin)…"
npx tsx scripts/preflight.ts

# Restart the app if a process manager is present (never fatal if absent).
if command -v pm2 >/dev/null 2>&1 && [ -f ecosystem.config.cjs ]; then
  # A web process started outside ecosystem.config.cjs (historically named
  # "mehnat-ai") still holds port 3000, so `pm2 reload` would bring up
  # "asro-web" beside it and the new one would die with EADDRINUSE. Retire the
  # stray first — ecosystem.config.cjs is the single source of truth.
  if pm2 describe mehnat-ai >/dev/null 2>&1; then
    echo "▶ Removing legacy PM2 process 'mehnat-ai' (superseded by asro-web)…"
    pm2 delete mehnat-ai || true
  fi
  echo "▶ Reloading PM2 (zero-downtime)…"
  pm2 reload ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
elif command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q '^asro-web'; then
  echo "▶ Restarting systemd services…"
  sudo systemctl restart asro-web asro-bot
else
  echo "ℹ No PM2/systemd unit detected — restart the app process manually."
fi

# Re-register the Telegram webhook. Telegram REMEMBERS whatever was registered
# last, so a release that adds an update type (callback_query, my_chat_member)
# or changes the command menu silently does nothing until this runs — buttons
# and group-join events simply never arrive. Idempotent, so it is safe every time.
# NOT gated on $TELEGRAM_BOT_TOKEN: the token lives in .env / .env.local, which
# only the Node scripts read (scripts/load-env). Testing the shell variable
# skipped this step on every server that keeps its secrets in a file — which is
# all of them. The script itself fails loudly when the token really is missing,
# and the `||` keeps that from aborting an otherwise-good deploy.
echo "▶ Re-registering the Telegram webhook + command menu…"
npx tsx scripts/set-telegram-webhook.ts \
  || echo "⚠️  Webhook registration failed — run 'npm run bot:webhook' manually."

echo "✅ Deploy complete — system verified login-capable."
