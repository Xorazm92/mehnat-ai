<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

ASRO — buxgalteriya autsorsing korxonasi uchun muvofiqlik va moliya tizimi.
Next.js + Prisma + PostgreSQL + next-auth + Tailwind v4. Prod: https://asro.uz

## Uy qoidalari

Loyiha odatiy taxminlardan farq qiladigan joylar:

- **Interfeys tili — faqat o'zbek (lotin).** `lang` kodda `'uz'` ga qotirilgan, RU shoxlari o'lik kod. `Login`, `Email`, `Admin` kabi o'zlashmalar qoladi. `<option value=...>` kalitlariga tegilmaydi — ular bazaga yoziladi.
- **Izoh NEGA ni yozadi, NIMA ni emas.** Kod o'zi nima qilishini ko'rsatadi; izoh kod ifodalay olmaydigan cheklovni yozadi va o'zgarishni ko'rmagan o'quvchi uchun ham to'g'ri qolishi kerak.
- **Sana va son `lib/format.ts` orqali** (`formatUzDate`, `formatNum`). `toLocaleString` / `Intl.NumberFormat` ishlatilmaydi — ular serverda va brauzerda har xil natija berib gidratatsiyani buzadi.
- **Moliyaviy yozuv jismonan o'chirilmaydi** — `deletedAt` bilan yumshoq o'chiriladi, jurnal esa `reverseLedger` bilan bekor qilinadi.
- **Pul chiqimi `lib/balance.ts` dagi `assertSufficientFunds` dan o'tadi.**
- **Ekranga darvoza `server/rbac.ts` `currentUserViews()` orqali** — proxy bilan aynan bir manba. Server action'lar o'z tekshiruvini saqlaydi; UI hech qachon yagona to'siq emas.

## Buyruqlar

```bash
npm run dev                          # :3000
npm run build                        # prod build (deploydan oldin)
npx tsc --noEmit -p tsconfig.json    # tiplar
npx vitest run <fayl>                # bitta test fayli
npm run test:db:setup                # test bazasi (test/** TEST_DATABASE_URL talab qiladi)

npx prisma generate                  # mijozni qayta yaratish
npx prisma migrate deploy            # migratsiyani qo'llash (tuzoqlarga qarang)

bash scripts/test-login.sh           # kirish smoke testi
bash scripts/backup.sh               # baza zaxirasi
./scripts/deploy.sh                  # prod: migratsiya → build → preflight → pm2 reload

bash .claude/hooks/guard-bash.test.sh .claude/hooks/guard-bash.sh   # qo'riqchi sinovi
```

Kassa ma'lumotini Excel'dan ko'chirish tartibi: `docs/KASSA_IMPORT.md`.

## Tuzoqlar

Har biri allaqachon yuz bergan xato.

- **`prisma migrate dev` va `migrate reset` ishlatilmaydi.** `schema.prisma` da hali commit qilinmagan modellar bor; ular drift deb hisoblanib baza reset qilinishi taklif qilinadi. Migratsiya SQL'i qo'lda yoziladi, keyin `migrate deploy`. `.claude/hooks/guard-bash.sh` buni to'sadi.
- **`prisma generate` dan keyin dev serverni QAYTA ishga tushiring.** Aks holda eski mijoz bilan ishlab `Unknown field` deb 500 qaytaradi va sabab uzoq izlanadi.
- **Har `tsx` skripti birinchi qatorda `import "./load-env"` yozadi**, `@/lib/prisma` dan OLDIN. `lib/prisma` yalqov (`getPrisma` + Proxy); dotenv ikkinchi marta ulanmaydi.
- **Kassa yozuvi jurnalga ham tushishi shart.** Kassalar hisoboti (`server/kassaReport.ts`) qoldiqni faqat `LedgerEntry` ning CASH oyoqlaridan o'qiydi. Jurnalsiz `KassaEntry` ro'yxatda ko'rinadi, balansda esa yo'q bo'ladi.
- **`KassaEntry(income)` mijoz qarzini kamaytirmaydi.** Qarz `Payment` + `PaymentAllocation` (`applyAllocation`) orqali yopiladi. Ikkalasiga yozish bitta pulni ikki marta sanaydi.
- **Oylik tushum uchun `getMonthBreakdown`, `getAvailableBalance` emas.** Ikkinchisi ataylab yig'ma (boshidan beri); uni "Kirim" yorlig'i ostida ko'rsatish rahbarni chalg'itadi.
- **Matritsa kalitlari `snake_case`, DB ustunlari `camelCase`** — `monthlyReport` ga yozishdan oldin `FIELD_TO_DB_COLUMN` orqali o'giriladi.
- **`kassa/` va `others_json_files/` repozitoriyaga tushmaydi** — ichida xodimlarning karta raqami va JSHSHIR bor.
- **Prod va lokal baza bir xil nomlanadi (`inbola`)** — ulanish satrini tekshirmasdan skript ishga tushirmang.

## Agent sozlamalari

`.claude/hooks/` da ikkita hook bor va ikkalasi `.claude/settings.json` orqali ulanadi:

- `guard-bash.sh` (PreToolUse) — yuqoridagi tuzoqlarni buyruq darajasida to'sadi va sababini tushuntiradi. Yangi qoida qo'shsangiz `guard-bash.test.sh` ga sinov ham qo'shing.
- `session-start.sh` (SessionStart) — sessiya boshida shox, commit holati, lokal baza va dev server holatini ko'rsatadi. Faqat o'zgaruvchi ma'lumot; doimiy qoidalar shu faylda qoladi.

## Agent ko'nikmalari

### Issue tracker
Issues live in GitHub Issues on `Xorazm92/mehnat-ai`, driven by the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels
The five canonical triage roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs
Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
