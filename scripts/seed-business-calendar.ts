// =====================================================
// ISH KUNLARI KALENDARI — BAYRAMLARNI EKISH (P2)
// =====================================================
//
// FAQAT ISTISNO YOZILADI. `BusinessCalendarDay` bo'sh bo'lsa ham shanba va
// yakshanba ish kuni deb hisoblanmaydi: `makeWorkdayPredicate` aniq yozuv
// topmasa standart qoidaga tushadi (`dow !== 0 && dow !== 6`). Ya'ni
// hafta oxiridan surish ALLAQACHON ishlaydi va uni jadvalga yozish
// standart qoidaning nusxasini yaratardi — 2 yilga ~208 keraksiz qator,
// ustiga ikkinchi haqiqat manbasi.
//
// Jadval yetishmayotgan yagona narsa — BAYRAMLAR: ular ish kuni bo'lishi
// kerak edi, lekin emas, va buni standart qoida bila olmaydi.
//
// ⚠️ HAYIT SANALARI TAXMINIY. Ramazon va Qurbon hayit oy taqvimiga bog'liq
// va har yili hukumat qarori bilan e'lon qilinadi. Skript ularni alohida
// belgilaydi; tasdiqlanmagunicha ular bilan hisoblangan muddat ishonchsiz.
//
// IDEMPOTENT: `upsert` — qayta yurgizish hech narsani buzmaydi. Qo'lda
// kiritilgan yozuv (`approvedById` bor) TEGILMAYDI.
//
//   npx tsx scripts/seed-business-calendar.ts               # dry-run, 2026-2027
//   npx tsx scripts/seed-business-calendar.ts --apply
//   npx tsx scripts/seed-business-calendar.ts --apply --years=2026,2027,2028

import "./load-env";
import { prisma } from "@/lib/prisma";
import { uzHolidays, hasMoveableHolidays } from "@/lib/domains/accounting/uzHolidays";

const APPLY = process.argv.includes("--apply");
const YEARS = (process.argv.find((a) => a.startsWith("--years="))?.split("=")[1] ?? "2026,2027")
  .split(",")
  .map((y) => Number(y.trim()))
  .filter((y) => Number.isInteger(y) && y > 2000 && y < 2100);

export interface CalendarSeedResult {
  created: number;
  updated: number;
  /** Qo'lda tasdiqlangan — tegilmadi. */
  protected: number;
  approximate: number;
}

/** "YYYY-MM-DD" → UTC yarim tun (`@db.Date` shu shaklda saqlanadi). */
const toUtcDate = (key: string) => new Date(`${key}T00:00:00.000Z`);

async function main(): Promise<void> {
  if (YEARS.length === 0) {
    console.error("✗ Yaroqli yil berilmadi (--years=2026,2027)");
    process.exitCode = 1;
    return;
  }

  console.log(APPLY ? "▶ QO'LLASH rejimi (--apply)" : "▶ DRY-RUN — hech narsa yozilmaydi");
  console.log(`  Yillar: ${YEARS.join(", ")}`);
  console.log("  Hafta oxiri EKILMAYDI — standart qoida uni allaqachon qamraydi.\n");

  const res: CalendarSeedResult = { created: 0, updated: 0, protected: 0, approximate: 0 };
  const unknownYears: number[] = [];

  for (const year of YEARS) {
    if (!hasMoveableHolidays(year)) unknownYears.push(year);

    for (const h of uzHolidays(year)) {
      const date = toUtcDate(h.date);
      if (h.approximate) res.approximate++;

      const existing = await prisma.businessCalendarDay.findUnique({
        where: { date },
        select: { id: true, name: true, approvedById: true },
      });

      // Odam tasdiqlagan yozuv skript taxminidan USTUN: kalendarni bosh
      // buxgalter to'g'irlagan bo'lsa, keyingi yurish uni qaytarib
      // buzmasligi kerak.
      if (existing?.approvedById) {
        res.protected++;
        console.log(`  = ${h.date}  ${h.name.padEnd(32)} (tasdiqlangan — tegilmadi)`);
        continue;
      }

      const label = h.approximate ? `${h.name} (taxminiy)` : h.name;
      if (APPLY) {
        await prisma.businessCalendarDay.upsert({
          where: { date },
          create: { date, isWorkday: false, isHoliday: true, name: label },
          update: { isWorkday: false, isHoliday: true, name: label },
        });
      }
      if (existing) res.updated++;
      else res.created++;
      console.log(`  ${APPLY ? "✓" : "·"} ${h.date}  ${label}`);
    }
  }

  console.log(
    `\n  yaratildi=${res.created}  yangilandi=${res.updated}  ` +
      `tegilmadi=${res.protected}  taxminiy=${res.approximate}`,
  );
  if (res.approximate > 0) {
    console.log(
      `\n⚠️  ${res.approximate} ta sana TAXMINIY (Ramazon/Qurbon hayit). Ular har yili ` +
        `hukumat qarori bilan e'lon qilinadi — tasdiqlangach admin ekranidan to'g'rilang.`,
    );
  }
  if (unknownYears.length > 0) {
    console.log(
      `\n⚠️  ${unknownYears.join(", ")} yil(lar)i uchun hayit sanalari YO'Q — ` +
        `faqat qat'iy bayramlar ekildi. lib/domains/accounting/uzHolidays.ts ga qo'shing.`,
    );
  }
  if (!APPLY) console.log("\n  Yozish uchun: --apply");
}

main()
  .catch((e) => {
    console.error("✗ Xato:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
