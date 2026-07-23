#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ONE-TIME, MANUAL: baseline a DB that was built with `db push` into prisma
# migrate. Marks every committed migration as APPLIED (resolve --applied)
# WITHOUT running its SQL, so the first `migrate deploy` won't try to CREATE
# tables that already exist.
#
#   ⚠ REHEARSE ON STAGING FIRST — see docs/MIGRATION_RECONCILIATION.md.
#
# This script is deliberately NOT called by scripts/deploy.sh, CI, or any cron:
# `migrate resolve` rewrites migration history without touching the schema, so
# running it unattended can permanently desynchronise the two.
#
#   Usage:  CONFIRM=baseline bash scripts/migrate-baseline.sh
#           (DATABASE_URL from env/.env)
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

# ── Guard 1: explicit human confirmation ─────────────────────────────────────
if [ "${CONFIRM:-}" != "baseline" ]; then
  echo "✖ Refusing to run unconfirmed."
  echo "  This rewrites _prisma_migrations WITHOUT applying any SQL."
  echo "  Read docs/MIGRATION_RECONCILIATION.md, then re-run:"
  echo "      CONFIRM=baseline bash scripts/migrate-baseline.sh"
  exit 1
fi

# ── Guard 2: the live schema must already equal schema.prisma ────────────────
# Baselining a DB that does NOT match the migrations records a lie: Prisma would
# believe SQL ran that never did, and a later migration breaks with no clue why.
echo "▶ Verifying the live schema already matches prisma/schema.prisma…"
if ! npx prisma migrate diff \
      --from-config-datasource \
      --to-schema prisma/schema.prisma \
      --exit-code >/tmp/asro-baseline-diff.txt 2>&1; then
  echo "✖ The database does NOT match schema.prisma — baselining would be WRONG."
  echo "  Drift detected:"
  sed 's/^/    /' /tmp/asro-baseline-diff.txt
  echo "  Follow §4 (Case C′) of docs/MIGRATION_RECONCILIATION.md instead."
  exit 1
fi
echo "  ✓ No drift — safe to baseline."

echo "▶ Baselining committed migrations into _prisma_migrations (no SQL run)…"
for dir in prisma/migrations/*/; do
  [ -f "$dir/migration.sql" ] || continue
  name="$(basename "$dir")"
  echo "  • resolve --applied $name"
  npx prisma migrate resolve --applied "$name" || echo "    (already applied — skipped)"
done

echo "✅ Baseline complete. Verify with: npx prisma migrate status"
echo "   Then future deploys use scripts/deploy.sh (prisma migrate deploy)."
