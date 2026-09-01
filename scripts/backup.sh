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

# Ilova bilan bir xil ustunlik: .env.local > .env (scripts/_bootstrap.ts,
# bot/env.ts). Aks holda ikkisi farq qilganda BOSHQA baza zaxiralanardi.
if [ -z "${DATABASE_URL:-}" ]; then
  for f in .env.local .env; do
    [ -f "$f" ] || continue
    DATABASE_URL="$(grep -E '^DATABASE_URL=' "$f" | head -1 | cut -d= -f2- | tr -d '"')"
    [ -n "$DATABASE_URL" ] && { echo "ℹ DATABASE_URL manbasi: $f"; break; }
  done
fi
[ -n "${DATABASE_URL:-}" ] || { echo "✗ DATABASE_URL topilmadi (env yoki .env)"; exit 3; }

# Prisma URL'ida libpq tushunmaydigan parametrlar bo'ladi (`?schema=public` va
# hokazo) — pg_dump ularni ko'rsa "invalid URI query parameter" deb yiqiladi va
# ZAXIRA OLINMAY QOLADI. Ularni olib tashlaymiz; sslmode kabi haqiqiy libpq
# parametrlari joyida qoladi.
PG_URL="$(node -e '
const u = new URL(process.argv[1]);
for (const k of ["schema", "connection_limit", "pool_timeout", "pgbouncer",
                 "socket_timeout", "sslidentity", "sslcert", "sslpassword"]) {
  u.searchParams.delete(k);
}
process.stdout.write(u.toString());
' "$DATABASE_URL")"
[ -n "$PG_URL" ] || { echo "✗ DATABASE_URL tahlil qilinmadi"; exit 3; }

DIR="backups/$TIER"
mkdir -p "$DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$DIR/asro_${STAMP}.dump"

echo "▶ pg_dump ($TIER) → $FILE"
# Avval vaqtinchalik nomga yozamiz. pg_dump yarim yo'lda yiqilsa (masalan URL
# xato yoki disk to'lsa), `set -e` skriptni to'xtatadi va joyida 0 baytli fayl
# qolardi — u zaxiraga o'xshaydi, retention uni saqlaydi va tiklash kerak
# bo'lganda bo'sh chiqadi. Faqat muvaffaqiyatli dump yakuniy nomga ko'chadi.
TMP="$FILE.partial"
trap 'rm -f "$TMP"' EXIT
pg_dump --format=custom --no-owner --dbname="$PG_URL" --file="$TMP"
[ -s "$TMP" ] || { echo "✗ pg_dump bo'sh fayl qaytardi"; exit 4; }
mv "$TMP" "$FILE"
trap - EXIT
sha256sum "$FILE" > "$FILE.sha256"
echo "  size: $(du -h "$FILE" | cut -f1)   sha256: $(cut -d' ' -f1 "$FILE.sha256")"

# ── FAYL OMBORI ──────────────────────────────────────────────────────────────
# Skrinshot va hujjatlar endi bazada emas, diskda (lib/evidenceStore.ts).
# Ya'ni `pg_dump` YOLG'IZ O'ZI TO'LIQ ZAXIRA EMAS: dump'da faqat `storageRef`
# bor, baytlar shu katalogda. Ikkalasi birga olinadi va birga tiklanadi.
FILES_ROOT="${ASRO_FILES_ROOT:-./storage/files}"
if [ -d "$FILES_ROOT" ]; then
  FILES_ARCHIVE="$DIR/files_${STAMP}.tar.gz"
  echo "▶ fayl ombori ($FILES_ROOT) → $FILES_ARCHIVE"
  FTMP="$FILES_ARCHIVE.partial"
  trap 'rm -f "$FTMP"' EXIT
  tar -czf "$FTMP" -C "$FILES_ROOT" .
  [ -s "$FTMP" ] || { echo "✗ fayl arxivi bo'sh chiqdi"; exit 5; }
  mv "$FTMP" "$FILES_ARCHIVE"
  trap - EXIT
  sha256sum "$FILES_ARCHIVE" > "$FILES_ARCHIVE.sha256"
  echo "  size: $(du -h "$FILES_ARCHIVE" | cut -f1)"
else
  echo "⚠ fayl ombori topilmadi ($FILES_ROOT) — faqat baza zaxiralandi"
fi

# Retention: keep the newest $KEEP dumps in this tier, prune the rest.
ls -1t "$DIR"/asro_*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  echo "  prune: $old"
  rm -f "$old" "$old.sha256"
done

ls -1t "$DIR"/files_*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  echo "  prune: $old"
  rm -f "$old" "$old.sha256"
done

echo "✅ Backup done ($TIER, keep=$KEEP)."
echo "ℹ Restore drill (staging): createdb asro_restore && pg_restore --clean --no-owner --dbname=asro_restore \"$FILE\""
echo "⚠ Copy this dump OFFSITE now — do not leave the only copy on the DB host."
