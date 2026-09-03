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

# ── 4) Toza start: test bazasining sxemasini bo'shatamiz ────────────────────
# Faqat TEST bazasida — yuqoridagi tekshiruvlar nishon ishchi baza emasligini
# allaqachon kafolatlagan. Toza start `migrate deploy` ning birinchi
# migratsiyadan boshlab yurishiga imkon beradi.
echo "▶ Test bazasi sxemasi bo'shatilmoqda…"
# psql `?schema=` parametrini tushunmaydi (u Prisma'ga xos) — u holda
# "invalid URI query parameter" beradi. Shuning uchun parametrsiz URL.
psql "${PREFIX}/${TEST_DB_NAME}" -q -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'

# ── 5) MIGRATSIYALAR — `db push` YO'Q ───────────────────────────────────────
# `db push` faqat schema.prisma ifodalay oladigan narsani yaratadi. Trigger va
# qisman (partial) unikal indeks kabi MAXSUS SQL migratsiya fayllarida yashaydi
# va `db push` ularni butunlay o'tkazib yuboradi. Natijada test bazasi
# ishlab chiqarishdan farq qilardi va aynan shu himoyalarni tekshiradigan
# testlar yiqilardi (financial_snapshot_immutable triggeri — o'lchangan).
#
# ILGARI BU YERDA `prisma db push` HAM BOR EDI — "migratsiyasiz qolgan model
# farqini yopish" uchun. Sabab: `20260810150000_consolidate_drop_unused_modules`
# olti jadvalni (1C integratsiyasi + CompanyObligationOverride) DROP qilgan,
# lekin schema.prisma ularni hali ham e'lon qiladi — ya'ni sof `migrate deploy`
# 71 emas, 65 jadval bilan qolardi va `db push` bu farqni jimgina yopardi.
#
# `db push` ENDI KERAK EMAS: `20260903140000_reconcile_dropped_models`
# o'sha olti jadvalni (va ikkita enum turini) forward-only migratsiya bilan
# tiklaydi — muvofiqlik prod bilan tasdiqlangan (2026-09-03, faqat o'qish
# so'rovlari: prod 71 jadval, barcha migratsiya "applied"). `db push` yashirgan
# BOSHQA drift yo'q edi: `prisma migrate diff` bilan tekshirilgan.
#
# `db push` OLIB TASHLANDI, chunki u driftni TUZATMAYDI — YASHIRADI: kelgusida
# schema.prisma yangi model bilan migratsiyasiz kengaysa, test bazasi buni
# jimgina "to'g'irlab" ketardi va muammo faqat prodga chiqqanda ko'rinardi.
# Endi test bazasi FAQAT migratsiya fayllaridan quriladi — prod bilan bir xil
# yo'ldan.
echo "▶ Migratsiyalar qo'llanmoqda (prisma migrate deploy)…"
DATABASE_URL="$TEST_URL" npx prisma migrate deploy

# ── 6) Spravochnik ma'lumot ─────────────────────────────────────────────────
# KPI qoidalari — test emas, SPRAVOCHNIK. Ularsiz KPI proyeksiyasi va scope
# testlari "qoida topilmadi" deb yiqiladi.
echo "▶ KPI qoidalari ekilmoqda…"
DATABASE_URL="$TEST_URL" npx tsx scripts/seed-kpi-rules-v2.ts

# Muddat shablonlari ham SPRAVOCHNIK: `test/matrix-template-coverage.test.ts`
# matritsa ustunlarining qamrovini shu jadvalga qarab o'lchaydi va bo'sh
# jadvalda "qoplangan ustunlar 0" deb yiqilardi. `--no-generate` — majburiyat
# YARATILMAYDI, faqat shablonlar.
echo "▶ Muddat shablonlari ekilmoqda…"
DATABASE_URL="$TEST_URL" npx tsx scripts/seed-deadline-templates.ts --no-generate

echo
echo "✅ Test bazasi tayyor."
echo
echo "   .env.local ga QO'SHING (DATABASE_URL ni O'ZGARTIRMANG):"
echo
echo "       TEST_DATABASE_URL=\"${TEST_URL}\""
echo
echo "   so'ng:  npm test"
