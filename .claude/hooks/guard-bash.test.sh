#!/usr/bin/env bash
# Qo'riqchi hook'ining sinovi. Xavfli naqshlar shu faylda yashaydi, ya'ni
# sinovni ishga tushiruvchi buyruqning o'zi qo'riqchiga tushmaydi.
G="$1"

check() {
  local desc="$1" cmd="$2" want="$3"
  # Qo'riqchi ruxsat berganda HECH NARSA chiqarmaydi, shuning uchun standart
  # qiymat jq ichida emas, shu yerda beriladi: bo'sh kirishda jq umuman
  # natija qaytarmaydi va `// "ruxsat"` hech qachon ishlamaydi.
  local out got
  out=$(printf '%s' "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":$(printf '%s' "$cmd" | jq -Rs .)}}" | bash "$G")
  if [ -z "$out" ]; then
    got=ruxsat
  else
    got=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision')
  fi
  if [ "$got" = "$want" ]; then
    printf '  OK   %-44s → %s\n' "$desc" "$got"
  else
    printf '  XATO %-44s → %s (kutilgan: %s)\n' "$desc" "$got" "$want"
    FAILED=1
  fi
}

FAILED=0

# To'silishi kerak
check "migratsiya: dev"      "npx prisma migrate dev --name x"        deny
check "migratsiya: reset"    "npx prisma migrate reset --force"       deny
check "bazani tashlash"      "psql -c 'DROP DATABASE inbola'"         deny
check "jadvalni tozalash"    "psql -c 'TRUNCATE TABLE \"Payment\"'"   deny
check "maxfiy faylni add"    "git add kassa/Kassa.json"               deny

# O'tishi kerak
check "migratsiya: deploy"   "npx prisma migrate deploy"              ruxsat
check "mijoz generatsiyasi"  "npx prisma generate"                    ruxsat
check "unit test"            "npx vitest run test/transit.test.ts"    ruxsat
check "build"                "npm run build"                          ruxsat
check "hammasini add"        "git add -A"                             ruxsat
check "holat"                "git status --short"                     ruxsat
check "heredoc ichida matn"  "$(printf 'cat > A.md <<X\nprisma migrate dev ishlatilmaydi\nX')" ruxsat

echo
[ "$FAILED" = 0 ] && echo "Hammasi o'tdi." || echo "Sinov yiqildi."
exit "$FAILED"
