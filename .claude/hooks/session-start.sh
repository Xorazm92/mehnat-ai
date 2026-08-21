#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SESSIYA BOSHIDAGI HOLAT (SessionStart)
#
# Bu yerda FAQAT O'ZGARUVCHI ma'lumot bo'ladi. Doimiy qoidalar AGENTS.md da
# yashaydi — ularni bu yerga ko'chirish ikki nusxa yaratardi va biri eskirardi.
#
# Nima uchun kerak: har sessiya boshida bir xil savollarga javob qidiriladi —
# qaysi shoxdaman, dev server ko'tarilganmi, qaysi bazaga ulanaman. Ular
# tekshirilmasa xato qilinadi; eng ko'p uchragani "prisma generate" dan keyin
# eski dev serverning 500 qaytarishi va sababining uzoq izlanishi.
#
# TARMOQQA CHIQMAYDI va bir soniyadan kam ishlaydi: sessiya boshlanishini
# kechiktiradigan hook zarardan boshqa narsa emas.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 0

branch=$(git branch --show-current 2>/dev/null || echo "?")
dirty=$(git status --porcelain 2>/dev/null | grep -c "" || echo 0)
last=$(git log --oneline -1 2>/dev/null || echo "-")
ahead=$(git rev-list --count "@{upstream}..HEAD" 2>/dev/null || echo 0)

# Lokal baza — prod bilan BIR XIL nomlanadi (ikkalasi ham inbola), shuning
# uchun ulanishni ko'rsatib qo'yish adashishning oldini oladi.
db=$(grep -hoP '(?<=DATABASE_URL=")[^"]+' .env.local 2>/dev/null | head -1 |
     sed -E 's|.*://([^:]+):[^@]*@|\1@|' || true)

if (echo >/dev/tcp/127.0.0.1/3000) >/dev/null 2>&1; then
  server=up
else
  server=down
fi

{
  echo "Loyiha holati (SessionStart hook):"
  echo "- shox: $branch | commit qilinmagan: $dirty ta | push qilinmagan: $ahead ta"
  echo "- oxirgi commit: $last"
  echo "- lokal baza: ${db:-.env.local o+qilmadi}"
  if [ "$server" = up ]; then
    echo "- dev server: ISHLAYAPTI (:3000)"
    echo "  DIQQAT: prisma generate dan keyin serverni QAYTA ishga tushiring,"
    echo "  aks holda u eski mijoz bilan \"Unknown field\" 500 qaytaradi."
  else
    echo "- dev server: o+chiq (UI tekshirish kerak bo+lsa: npm run dev)"
  fi
} | sed "s/+/'/g"
