#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# KASSA IMPORTINI PRODDA BAJARISH
#
# Bu — `scripts/deploy.sh` ning o'rnini bosmaydi. Kod chiqarilgandan KEYIN
# bir marta ishlatiladigan MA'LUMOT ko'chirish tartibi.
#
#   Prod serverda, ilova papkasida:
#     bash scripts/deploy-kassa-import.sh            # quruq hisobot (yozmaydi)
#     bash scripts/deploy-kassa-import.sh --apply    # yozadi
#
# SHART: manba JSON fayllari serverda bo'lishi kerak (repozitoriyda YO'Q —
# ichida karta raqami va JSHSHIR bor). Lokal mashinadan ko'chiring:
#     scp -i ~/Downloads/ASRO.pem -r kassa ubuntu@<server>:~/mehnat-ai/
#
# Har qadam idempotent: qayta ishga tushirish dublikat yaratmaydi.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

APPLY=""
if [[ "${1:-}" == "--apply" ]]; then APPLY="yes"; fi

step() { echo; echo "▶ $*"; }

# Manba papkasi bormi — yo'q bo'lsa hech narsa qilmasdan to'xtaymiz, chunki
# yarim import balansni buzib qoldirardi.
if [[ ! -d kassa && ! -d others_json_files && -z "${IMPORT_DIR:-}" ]]; then
  echo "✗ Manba papkasi topilmadi (kassa/ yoki others_json_files/)."
  echo "  Fayllarni serverga ko'chiring, keyin qaytadan urinib ko'ring."
  exit 1
fi

step "[0/6] Sun'iy yozuvlar bormi (test/demo axlati)"
# Prod toza bo'lsa "0 ta" chiqadi va hech narsa qilmaydi. Lokal bazada bu
# 1,63 mlrd so'mlik soxta aylanma edi — prodda ham tekshirilishi shart.
npx tsx scripts/purge-synthetic-kassa.ts ${APPLY:+--apply}

step "[1/6] O'z firmalar uchun schyot kanallari"
npx tsx scripts/seed-own-firm-accounts.ts ${APPLY:+--apply}

step "[2/6] Naqd seyf, plastik terminal, maqsadli kassalar"
npx tsx scripts/seed-kassa-desks.ts ${APPLY:+--apply}

step "[3/6] Band xodimlar + IYUL karta daftari"
# `--create-missing` ATAYIN YO'Q: reyestrda yo'q varaq uchun kanal ochish —
# taxmin, va prodda taxmin qilinmaydi. Bunday varaq ro'yxatda ko'rsatiladi.
if [[ -n "$APPLY" ]]; then
  npx tsx scripts/import-transit.ts --month=iyul
else
  npx tsx scripts/import-transit.ts --month=iyul --dry-run
fi

step "[4/6] AVGUST karta daftari"
if [[ -n "$APPLY" ]]; then
  npx tsx scripts/import-transit.ts --month=avgust
else
  npx tsx scripts/import-transit.ts --month=avgust --dry-run
fi

step "[5/6] Kassa operatsiyalari (DATA varag'i)"
npx tsx scripts/import-kassa-operations.ts ${APPLY:+--apply}

step "[6/6] Firmalar bank qoldig'i"
npx tsx scripts/import-firm-balances.ts --as-of=2026-08-01 ${APPLY:+--apply}

echo
if [[ -z "$APPLY" ]]; then
  echo "════ QURUQ HISOBOT — hech narsa yozilmadi."
  echo "     Raqamlarni tekshiring, keyin: bash scripts/deploy-kassa-import.sh --apply"
else
  echo "════ TUGADI. Tekshirish: /kassa sahifasi, oy tanlagichi bilan."
fi
