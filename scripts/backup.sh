#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ASRO — Postgres backup with tiered retention + checksum. Run per tier from cron:
#   daily:   0 2 * * *   bash scripts/backup.sh daily
#   weekly:  0 3 * * 0   bash scripts/backup.sh weekly
#   monthly: 0 4 1 * *   bash scripts/backup.sh monthly
# DATABASE_URL is read from the shell or .env. Dumps go to backups/<tier>/
# (gitignored). ALWAYS copy dumps OFFSITE (another host / S3) — a backup on the
# same server dies with the server.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

TIER="${1:-daily}"
case "$TIER" in
  daily) KEEP=14 ;;
  weekly) KEEP=8 ;;
  monthly) KEEP=12 ;;
  *) echo "Usage: backup.sh [daily|weekly|monthly]"; exit 2 ;;
esac

if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')"
fi
[ -n "${DATABASE_URL:-}" ] || { echo "✗ DATABASE_URL topilmadi (env yoki .env)"; exit 3; }

DIR="backups/$TIER"
mkdir -p "$DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$DIR/asro_${STAMP}.dump"

echo "▶ pg_dump ($TIER) → $FILE"
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="$FILE"
sha256sum "$FILE" > "$FILE.sha256"
echo "  size: $(du -h "$FILE" | cut -f1)   sha256: $(cut -d' ' -f1 "$FILE.sha256")"

# Retention: keep the newest $KEEP dumps in this tier, prune the rest.
ls -1t "$DIR"/asro_*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  echo "  prune: $old"
  rm -f "$old" "$old.sha256"
done

echo "✅ Backup done ($TIER, keep=$KEEP)."
echo "ℹ Restore drill (staging): createdb asro_restore && pg_restore --clean --no-owner --dbname=asro_restore \"$FILE\""
echo "⚠ Copy this dump OFFSITE now — do not leave the only copy on the DB host."
