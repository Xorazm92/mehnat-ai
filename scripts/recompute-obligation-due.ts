import "./load-env";
import { prisma } from "../lib/prisma";
import {
  periodWindowFor,
  computeDueAt,
  makeWorkdayPredicate,
  type CalendarDay,
} from "../lib/engines/obligation/deadlines";

/**
 * Hali bajarilmagan Obligation'larning `dueAt` ini shablonning JORIY sozlamasi
 * bo'yicha qayta hisoblaydi.
 *
 * Nega kerak: generator idempotent — `@@unique([companyId, templateId,
 * periodStart, periodEnd])` bo'yicha mavjud qatorni o'tkazib yuboradi va `dueAt`
 * ni QAYTA HISOBLAMAYDI. Shu sabab shablonning anchor'i tuzatilsa (masalan
 * PAYROLL_CALC `fixed_day_of_month`/31 → `period_end_offset`/0), allaqachon
 * yaratilgan majburiyatlar eski, bir oy kech muddat bilan qolib ketadi va KPI
 * kechikkanni "o'z vaqtida" deb baholaydi.
 *
 * Tarixni o'zgartirmaydi: `accepted`/`cancelled` qatorlarga tegmaydi.
 *
 * Ishlatish:  npx tsx scripts/recompute-obligation-due.ts [--apply]
 * `--apply` bo'lmasa faqat nima o'zgarishini ko'rsatadi (dry-run).
 */
const APPLY = process.argv.includes("--apply");

async function main() {
  const calendar: CalendarDay[] = await prisma.businessCalendarDay.findMany({
    select: { date: true, isWorkday: true, isHoliday: true },
  });
  const isWorkday = makeWorkdayPredicate(calendar);

  const obligations = await prisma.obligation.findMany({
    where: { status: { notIn: ["accepted", "cancelled"] } },
    select: {
      id: true,
      dueAt: true,
      periodStart: true,
      periodKey: true,
      template: {
        select: {
          code: true,
          periodicity: true,
          anchorType: true,
          dueDay: true,
          dueMonth: true,
          offsetDays: true,
          adjustmentPolicy: true,
        },
      },
    },
  });

  const changes: { id: string; code: string; periodKey: string; from: string; to: string }[] = [];

  for (const ob of obligations) {
    const window = periodWindowFor(ob.template.periodicity, ob.periodStart);
    const due = computeDueAt(ob.template, window, isWorkday);
    if (due.getTime() !== ob.dueAt.getTime()) {
      changes.push({
        id: ob.id,
        code: ob.template.code,
        periodKey: ob.periodKey,
        from: ob.dueAt.toISOString().slice(0, 10),
        to: due.toISOString().slice(0, 10),
      });
    }
  }

  const byCode = new Map<string, { n: number; sample: string }>();
  for (const c of changes) {
    const e = byCode.get(c.code) ?? { n: 0, sample: `${c.periodKey}: ${c.from} → ${c.to}` };
    e.n++;
    byCode.set(c.code, e);
  }

  console.log(`${obligations.length} ta ochiq majburiyat tekshirildi, ${changes.length} tasi mos emas.`);
  for (const [code, e] of byCode) console.log(`  ${code.padEnd(18)} ${String(e.n).padStart(5)} ta   ${e.sample}`);

  if (!APPLY) {
    console.log("\nDRY-RUN — hech narsa o'zgartirilmadi. Qo'llash uchun: --apply");
    return;
  }

  // Guruhlab yangilaymiz: bir xil yangi sanaga tushganlar bitta so'rovda.
  const byDue = new Map<string, string[]>();
  for (const c of changes) {
    const arr = byDue.get(c.to) ?? [];
    arr.push(c.id);
    byDue.set(c.to, arr);
  }
  for (const [to, ids] of byDue) {
    await prisma.obligation.updateMany({
      where: { id: { in: ids } },
      data: { dueAt: new Date(`${to}T00:00:00.000Z`) },
    });
  }
  console.log(`\n${changes.length} ta majburiyat muddati yangilandi.`);
}

main()
  .catch((e) => {
    console.error("dueAt qayta hisoblashda xato:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
