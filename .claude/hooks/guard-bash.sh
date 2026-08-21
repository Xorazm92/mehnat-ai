#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# XAVFLI BUYRUQLARNI TO'XTATUVCHI QO'RIQCHI (PreToolUse → Bash)
#
# Bu ro'yxatdagi har bir band — ALLAQACHON YUZ BERGAN yoki bir qadam qolgan
# xato. Umumiy "xavfli buyruqlar" ro'yxati emas: har biri shu loyihaning
# aniq tuzog'i, va sababi bilan birga tushuntiriladi, chunki to'xtatilgan
# agent nima qilishni bilishi kerak.
#
# stdin: hook JSON. stdout: permissionDecision bilan JSON.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')

# Heredoc TANASI tekshirilmaydi — u bajarilmaydi, faylga yoziladi. Busiz
# qo'riqchi o'z hujjatini yozishni ham to'sardi: AGENTS.md ichiga "bu buyruq
# ishlatilmaydi" deb yozilgan matn buyruqning o'zi deb qabul qilinardi.
# Faqat `<<` dan OLDINGI qism — ya'ni haqiqatan bajariladigan buyruq — ko'riladi.
cmd=${cmd%%<<*}

deny() {
  jq -nc --arg r "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
  exit 0
}

# ── 1. prisma migrate dev / reset ───────────────────────────────────────────
# `schema.prisma` da hali commit qilinmagan modellar bor. `migrate dev` bazani
# schema bilan tenglashtiraman deb drift aniqlaydi va RESET taklif qiladi —
# bir marta shunday qilib lokal ma'lumot yo'qolgan.
if [[ "$cmd" =~ prisma[[:space:]]+migrate[[:space:]]+(dev|reset) ]]; then
  deny "\`prisma migrate dev/reset\` bu loyihada ishlatilmaydi: schema'da commit qilinmagan modellar bor, migrate dev ularni drift deb hisoblab bazani reset qilishni taklif qiladi. O'rniga: migratsiya SQL'ini qo'lda yozing va \`npx prisma migrate deploy\` bilan qo'llang."
fi

# ── 2. Prod bazasini to'g'ridan-to'g'ri o'zgartirish ────────────────────────
# Prod DB nomi lokal bilan BIR XIL (ikkalasi ham `inbola`), ya'ni ulanish
# satrini adashtirish oson va xato jimgina o'tib ketadi.
if [[ "$cmd" =~ (drop[[:space:]]+database|DROP[[:space:]]+DATABASE|truncate[[:space:]]+table|TRUNCATE[[:space:]]+TABLE) ]]; then
  deny "Bazani jismonan o'chirish/tozalash bu loyihada qo'lda qilinmaydi. Moliyaviy yozuvlar hech qachon jismonan o'chirilmaydi (yumshoq o'chirish: deletedAt). Zarur bo'lsa avval \`bash scripts/backup.sh\`, keyin egasidan tasdiq so'rang."
fi

# ── 3. Manba fayllarini repozitoriyga qo'shish ──────────────────────────────
# `kassa/*.json` ichida xodimlarning karta raqami va JSHSHIR bor.
if [[ "$cmd" =~ git[[:space:]]+add ]] && [[ "$cmd" =~ (kassa/|others_json_files/) ]]; then
  deny "Bu papkalarda xodimlarning karta raqami va JSHSHIR bor — repozitoriyga tushmaydi (.gitignore: /kassa/). \`git add\` ni aniq fayllarga qarating yoki \`git add -A\` ishlating (gitignore o'zi to'sadi)."
fi

exit 0
