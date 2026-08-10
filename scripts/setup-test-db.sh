#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ASRO — integratsiya testlari uchun ALOHIDA baza tayyorlaydi.
#
# Nima uchun kerak: `test/**/*.test.ts` real yozuv qiladi (User, KassaEntry,
# Payment, LedgerEntry, Obligation…). Ular ishchi bazaga yugursa, test yiqilgan
# yoki jarayon o'ldirilgan har safar qoldiq qator bazada qoladi va balansni
# buzadi. `test/setup.ts` qo'riqchisi shu sababli test bazasini TALAB qiladi.
#
# Bu skript FAQAT YANGI baza yaratadi. Mavjud ma'lumotga tegmaydi:
#   • ishchi/prod bazaga bitta ham so'rov yubormaydi
#   • DROP / DELETE / UPDATE qilmaydi
#   • migratsiya fayllarini o'zgartirmaydi
#
# Sxema `prisma db push` bilan qo'yiladi, `migrate deploy` bilan emas: test
# bazasi bo'sh va bir martalik, `db push` esa schema.prisma ni to'g'ridan-to'g'ri
# aks ettiradi — migratsiya fayllari bilan schema o'rtasidagi drift bu yerda
# to'sqinlik qilmaydi.
#
#   ISHLATISH:  npm run test:db:setup
#   NOMNI O'ZGARTIRISH:  TEST_DB_NAME=boshqa_test npm run test:db:setup
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."

TEST_DB_NAME="${TEST_DB_NAME:-asro_test}"

# ⚠️ ALOHIDA SXEMA YO'LI YO'Q — ATAYIN.
# Sinab ko'rilgan va ISHLAMAYDI: Prisma Client jadval nomlarini generatsiya
# vaqtidagi sxema bilan qattiq bog'laydi ("public"."Obligation"), shuning uchun
# `?schema=` yoki `search_path` o'zgartirilsa ham tipli so'rovlar `public` ga
# tushaveradi. O'lchangan: current_schema()=asro_test, raw FROM "Obligation"=0,
# prisma.obligation.count()=2982. Ya'ni sxema izolyatsiyasi YOLG'ON xotirjamlik
# beradi. Yagona ishonchli yo'l — alohida BAZA.

# ── 1) Ulanish ma'lumotlarini mavjud DATABASE_URL dan olamiz ────────────────
# Faqat host/port/foydalanuvchi qismi ko'chiriladi; baza nomi ALMASHTIRILADI,
# ya'ni ishchi bazaga ulanish hech qachon ochilmaydi.
SOURCE_URL="${DATABASE_URL:-}"
if [ -z "$SOURCE_URL" ]; then
  for f in .env.local .env; do
    if [ -f "$f" ]; then
      line="$(grep -E '^DATABASE_URL=' "$f" | tail -1 || true)"
      if [ -n "$line" ]; then
        SOURCE_URL="$(printf '%s' "$line" | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//')"
        break
      fi
    fi
  done
fi

if [ -z "$SOURCE_URL" ]; then
  echo "✗ DATABASE_URL topilmadi (.env.local / .env / muhit)." >&2
  echo "  Ulanish ma'lumotlarini shundan olaman — baza nomini esa almashtiraman." >&2
  exit 1
fi

# postgresql://user:pass@host:port/dbname?params  →  bo'laklarga
PREFIX="$(printf '%s' "$SOURCE_URL" | sed -E 's#^(.*://[^/]+)/.*$#\1#')"
PARAMS="$(printf '%s' "$SOURCE_URL" | sed -nE 's#^.*/[^?]*(\?.*)$#\1#p')"
[ -n "$PARAMS" ] || PARAMS="?schema=public"

SOURCE_DB="$(printf '%s' "$SOURCE_URL" | sed -E 's#^.*://[^/]+/([^?]*).*$#\1#')"
HOST="$(printf '%s' "$PREFIX" | sed -E 's#^.*://([^:@]+(:[^@]*)?@)?([^:/]+).*$#\3#')"

# ── 2) Qat'iy tekshiruv: nishon ishchi baza bilan bir xil bo'lmasin ─────────
if [ "$TEST_DB_NAME" = "$SOURCE_DB" ]; then
  echo "✗ Test bazasi nomi ishchi baza bilan bir xil ('${SOURCE_DB}'). To'xtatildi." >&2
  exit 1
fi
case "$TEST_DB_NAME" in
  *test*) ;;
  *) echo "✗ Test bazasi nomida 'test' bo'lishi shart — qo'riqchi (test/setup.ts) shunga qaraydi." >&2; exit 1 ;;
esac
TEST_URL="${PREFIX}/${TEST_DB_NAME}${PARAMS}"
echo "▶ Manba ulanishi : ${HOST}/${SOURCE_DB}   (faqat host/user ko'chiriladi, TEGILMAYDI)"
echo "▶ Test bazasi    : ${HOST}/${TEST_DB_NAME}"
echo

# ── 3) Nishonni tayyorlaymiz ────────────────────────────────────────────────
if ! command -v psql >/dev/null 2>&1; then
  echo "⚠️  psql topilmadi — bazani qo'lda yarating:"
  echo "      createdb ${TEST_DB_NAME}"
  echo "    so'ng bu skriptni qayta ishga tushiring."
  exit 1
else
  EXISTS="$(psql "${PREFIX}/postgres" -tAc "SELECT 1 FROM pg_database WHERE datname='${TEST_DB_NAME}'" 2>/dev/null || true)"
  if [ "$EXISTS" = "1" ]; then
    echo "✓ '${TEST_DB_NAME}' allaqachon mavjud — yaratish o'tkazib yuborildi."
  else
    echo "▶ '${TEST_DB_NAME}' yaratilmoqda…"
    # CREATE DATABASE uchun rolda CREATEDB huquqi kerak. Bo'lmasa — bu skript
    # HECH NARSA qilmaydi va operatorga aniq ikki yo'l beradi. Ishchi bazaga
    # jimgina "zaxira reja" bilan yozib ketmaydi: izolyatsiya — qaror, taxmin emas.
    if ! psql "${PREFIX}/postgres" -c "CREATE DATABASE \"${TEST_DB_NAME}\"" >/dev/null 2>/tmp/asro-createdb.err; then
      echo
      echo "✗ Baza yaratilmadi: $(tr -d '\n' < /tmp/asro-createdb.err)"
      echo
      echo "  Ikki yo'ldan birini tanlang."
      echo
      echo "  A) ALOHIDA BAZA (tavsiya etiladi) — bir marta, administrator huquqi bilan:"
      echo
      echo "       sudo -u postgres createdb -O \"\$(whoami)\" ${TEST_DB_NAME}"
      echo
      echo "     so'ng: npm run test:db:setup"
      echo
      echo "  B) yoki menga huquq bering, keyin skript o'zi yaratadi:"
      echo
      echo "       sudo -u postgres psql -c 'ALTER ROLE \"$(whoami)\" CREATEDB'"
      echo
      exit 1
    fi
    echo "✓ Yaratildi."
  fi
fi

# ── 4) Sxemani qo'yamiz ─────────────────────────────────────────────────────
# `--url` ATAYIN ishlatiladi: prisma.config.ts `process.env.DATABASE_URL` ni
# o'qiydi va u yerda ISHCHI baza turadi. Aniq bayroq bilan uzatish nishonni
# bir joyda, ko'rinadigan qilib belgilaydi — muhit o'zgaruvchisiga tayanmaydi.
echo "▶ Sxema qo'yilmoqda (prisma db push)…"
npx prisma db push --url "$TEST_URL" --accept-data-loss

echo
echo "✅ Test bazasi tayyor."
echo
echo "   .env.local ga QO'SHING (DATABASE_URL ni O'ZGARTIRMANG):"
echo
echo "       TEST_DATABASE_URL=\"${TEST_URL}\""
echo
echo "   so'ng:  npm test"
