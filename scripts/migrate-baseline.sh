#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ONE-TIME: baseline a prod DB that was built with `db push` into prisma migrate.
# Marks every committed migration as APPLIED (resolve --applied) WITHOUT running
# its SQL, so the first `migrate deploy` won't try to CREATE tables that already
# exist. Run this ONCE on such a DB, then use scripts/deploy.sh normally.
# Safe to re-run: an already-recorded migration errors and is skipped.
#   Usage:  bash scripts/migrate-baseline.sh   (DATABASE_URL from env/.env)
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

echo "▶ Baselining committed migrations into _prisma_migrations (no SQL run)…"
for dir in prisma/migrations/*/; do
  [ -f "$dir/migration.sql" ] || continue
  name="$(basename "$dir")"
  echo "  • resolve --applied $name"
  npx prisma migrate resolve --applied "$name" || echo "    (already applied — skipped)"
done

echo "✅ Baseline complete. Verify with: npx prisma migrate status"
echo "   Then future deploys use scripts/deploy.sh (prisma migrate deploy)."
