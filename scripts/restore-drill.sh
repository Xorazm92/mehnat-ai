#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ASRO — RESTORE DRILL. Zaxira tiklanishini ISBOTLAYDI.
#
#   bash scripts/restore-drill.sh                 # eng yangi daily dump
#   bash scripts/restore-drill.sh backups/daily/asro_2026....dump
#   bash scripts/restore-drill.sh --keep          # sinov bazasi o'chirilmaydi
#
# NEGA BU ALOHIDA SKRIPT. `backup.sh` dump yozadi va oxirida tiklash buyrug'ini
# CHOP ETADI — lekin uni hech kim bajarmaydi. Tekshirilmagan zaxira zaxira
# emas, u faqat fayl: u bo'sh bo'lishi, yarim yozilgan bo'lishi yoki sxemasi
# eskirgan bo'lishi mumkin va buni tiklash kerak bo'lgan kunda bilib olasan.
# Reliz darvozasi (docs/QUALITY_BAR.md R1) shuning uchun "zaxira bor" emas,
# "tiklash SINOVDAN o'tgan" deydi.
#
# XAVFSIZLIK. Bu skript MANBA bazaga hech qachon yozmaydi. Sinov bazasi nomi
# vaqt tamg'asi bilan quriladi va manba nomi bilan mos kelsa — skript to'xtaydi.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

KEEP_DB=0
DUMP=""
for arg in "$@"; do
  case "$arg" in
    --keep) KEEP_DB=1 ;;
    -*) echo "Noma'lum bayroq: $arg"; exit 2 ;;
    *) DUMP="$arg" ;;
  esac
done

# backup.sh bilan bir xil manba tartibi: .env.local > .env.
if [ -z "${DATABASE_URL:-}" ]; then
  for f in .env.local .env; do
    [ -f "$f" ] || continue
    DATABASE_URL="$(grep -E '^DATABASE_URL=' "$f" | head -1 | cut -d= -f2- | tr -d '"')"
    [ -n "$DATABASE_URL" ] && break
  done
fi
[ -n "${DATABASE_URL:-}" ] || { echo "✗ DATABASE_URL topilmadi"; exit 3; }

# Prisma parametrlarini olib tashlaymiz (backup.sh dagi bilan bir xil sabab).
read -r PG_URL SRC_DB <<EOF
$(node -e '
const u = new URL(process.argv[1]);
for (const k of ["schema","connection_limit","pool_timeout","pgbouncer",
                 "socket_timeout","sslidentity","sslcert","sslpassword"]) u.searchParams.delete(k);
const db = u.pathname.replace(/^\//, "");
process.stdout.write(u.toString() + " " + db);
' "$DATABASE_URL")
EOF
[ -n "$PG_URL" ] && [ -n "$SRC_DB" ] || { echo "✗ DATABASE_URL tahlil qilinmadi"; exit 3; }

if [ -z "$DUMP" ]; then
  DUMP="$(ls -1t backups/daily/asro_*.dump 2>/dev/null | head -1 || true)"
fi
[ -n "$DUMP" ] && [ -f "$DUMP" ] || { echo "✗ Dump topilmadi. Avval: bash scripts/backup.sh daily"; exit 4; }

DRILL_DB="asro_drill_$(date -u +%Y%m%d%H%M%S)"
# Bu tekshiruv hech qachon ishlamasligi kerak — u ishlagan kun kimdir nomlash
# qoidasini o'zgartirgan va manba baza ustiga tiklanish bir qadam narida.
[ "$DRILL_DB" != "$SRC_DB" ] || { echo "✗ Sinov bazasi nomi MANBA bilan bir xil — to'xtatildi"; exit 5; }

ADMIN_URL="$(node -e '
const u = new URL(process.argv[1]); u.pathname = "/postgres"; process.stdout.write(u.toString());
' "$PG_URL")"
DRILL_URL="$(node -e '
const u = new URL(process.argv[1]); u.pathname = "/" + process.argv[2]; process.stdout.write(u.toString());
' "$PG_URL" "$DRILL_DB")"

echo "▶ Dump      : $DUMP ($(du -h "$DUMP" | cut -f1))"
echo "▶ Manba     : $SRC_DB (FAQAT O'QISH)"
echo "▶ Sinov     : $DRILL_DB"
echo

# Huquqni OLDINDAN tekshiramiz. Aks holda skript sha256 ni tekshirib, keyin
# `CREATE DATABASE` da "permission denied" bilan yiqilardi — va bu xato
# zaxira nuqsoniga o'xshab ko'rinadi, holbuki muammo rolda.
CAN_CREATE="$(psql "$ADMIN_URL" -tAc "SELECT rolcreatedb OR rolsuper FROM pg_roles WHERE rolname = current_user;" 2>/dev/null || echo "")"
if [ "$CAN_CREATE" != "t" ]; then
  DB_USER="$(node -e 'process.stdout.write(new URL(process.argv[1]).username)' "$PG_URL")"
  cat <<MSG
✗ Bu rol baza yarata olmaydi, ya'ni tiklashni sinab bo'lmaydi.

  Sinov ALOHIDA bazaga tiklanadi — manba hech qachon o'zgarmaydi. Buning
  uchun rolga CREATEDB kerak:

      psql -c 'ALTER ROLE "$DB_USER" CREATEDB;'    # superuser sifatida

  Yoki mashqni CREATEDB huquqi bor muhitda bajaring (staging/prod host).
MSG
  exit 7
fi

# 1) Yaxlitlik — sha256 yonma-yon fayli bilan.
if [ -f "$DUMP.sha256" ]; then
  echo "▶ sha256 tekshiruvi"
  sha256sum --check --status "$DUMP.sha256" \
    && echo "  ✓ mos" \
    || { echo "  ✗ MOS EMAS — dump buzilgan"; exit 6; }
else
  echo "⚠ sha256 fayli yo'q — yaxlitlik tekshirilmadi"
fi

cleanup() {
  if [ "$KEEP_DB" = "0" ]; then
    psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS \"$DRILL_DB\";" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# 2) RTO — soat shu yerdan boshlanadi.
START=$(date +%s)
echo "▶ Tiklanmoqda…"
psql "$ADMIN_URL" -q -c "CREATE DATABASE \"$DRILL_DB\";"
# `--no-owner`: dump boshqa rol bilan olingan bo'lishi mumkin. Xatolar
# YIG'ILADI, birinchisida to'xtamaydi — to'liq manzara kerak.
RESTORE_LOG="$(mktemp)"
if ! pg_restore --no-owner --dbname="$DRILL_URL" "$DUMP" >"$RESTORE_LOG" 2>&1; then
  echo "  ⚠ pg_restore ogohlantirishlar bilan tugadi:"
  head -5 "$RESTORE_LOG" | sed 's/^/    /'
fi
rm -f "$RESTORE_LOG"
ELAPSED=$(( $(date +%s) - START ))

# 3) Solishtirish — jadval sanog'i emas, QATOR sanog'i. Sxema tiklanib,
#    ma'lumot tiklanmasligi mumkin va bu eng yomon holat: hammasi joyida
#    ko'rinadi.
echo "▶ Solishtirish"
TABLES='Company User Obligation DeadlineTemplate MonthlyReport Payment AuditLog'
FAIL=0
printf "  %-20s %10s %10s\n" "jadval" "manba" "tiklangan"
for t in $TABLES; do
  A=$(psql "$PG_URL"   -tAc "SELECT count(*) FROM \"$t\";" 2>/dev/null || echo "yo'q")
  B=$(psql "$DRILL_URL" -tAc "SELECT count(*) FROM \"$t\";" 2>/dev/null || echo "yo'q")
  MARK="✓"
  [ "$A" = "$B" ] || { MARK="✗"; FAIL=1; }
  printf "  %-20s %10s %10s  %s\n" "$t" "$A" "$B" "$MARK"
done

echo
echo "  RTO (tiklash vaqti): ${ELAPSED}s"
if [ "$FAIL" = "0" ]; then
  echo "✅ RESTORE DRILL O'TDI — zaxiradan to'liq tiklandi."
else
  echo "❌ RESTORE DRILL YIQILDI — qator sanoqlari mos emas."
fi
[ "$KEEP_DB" = "1" ] && echo "ℹ Sinov bazasi saqlandi: $DRILL_DB (o'chirish: dropdb $DRILL_DB)"
exit "$FAIL"
