import "./load-env";
import { prisma } from "../lib/prisma";
import { toPerformanceMonth } from "../lib/periods";

/**
 * MonthlyPerformance.month ni yagona kanonik "YYYY-MM-01" formatiga keltiradi.
 *
 * Nega kerak: bot proyeksiyasi "2026-07" yozardi, nazoratchi UI va seed'lar
 * "2026-07-01". @@unique([month, companyId, employeeId, ruleId]) bu ikkisini
 * turli oy deb bilgani uchun bitta qoida bo'yicha ikkita qator yashab qolishi va
 * jarima ikki marta hisoblanishi mumkin edi — ADR-0004 dagi nuqson.
 *
 * To'qnashuvda ADR-0004 qoidasi: eng so'nggi `recordedAt` g'olib.
 */
async function main() {
  console.log("MonthlyPerformance oy kalitini normalizatsiya qilish...");

  // Diqqat: `endsWith: "-01"` bilan filtrlash MUMKIN EMAS — "2026-01" ham "-01"
  // bilan tugaydi, ya'ni har yanvarning legacy qatorlari jimgina o'tkazib
  // yuborilardi. Uzunlik bo'yicha ajratamiz.
  const all = await prisma.monthlyPerformance.findMany({
    select: { id: true, month: true, companyId: true, employeeId: true, ruleId: true, recordedAt: true },
  });
  const legacyRows = all.filter((r) => /^\d{4}-\d{2}$/.test(r.month));

  console.log(`Jami ${all.length} qator, shundan ${legacyRows.length} tasi legacy formatda.`);

  let updated = 0;
  let deletedLegacy = 0;
  let replacedCanonical = 0;

  for (const row of legacyRows) {
    const newMonth = toPerformanceMonth(row.month);
    if (!newMonth) continue;

    const key = {
      month: newMonth,
      companyId: row.companyId,
      employeeId: row.employeeId,
      ruleId: row.ruleId,
    };
    const existing = await prisma.monthlyPerformance.findUnique({
      where: { month_companyId_employeeId_ruleId: key },
      select: { id: true, recordedAt: true },
    });

    if (!existing) {
      await prisma.monthlyPerformance.update({ where: { id: row.id }, data: { month: newMonth } });
      updated++;
      continue;
    }

    // Ikkalasi ham bor — ADR-0004: eng yangi `recordedAt` qoladi.
    if (row.recordedAt > existing.recordedAt) {
      await prisma.$transaction([
        prisma.monthlyPerformance.delete({ where: { id: existing.id } }),
        prisma.monthlyPerformance.update({ where: { id: row.id }, data: { month: newMonth } }),
      ]);
      replacedCanonical++;
    } else {
      await prisma.monthlyPerformance.delete({ where: { id: row.id } });
      deletedLegacy++;
    }
  }

  console.log(
    `Tayyor. Ko'chirildi: ${updated}, eski legacy o'chirildi: ${deletedLegacy}, ` +
      `yangiroq legacy kanonikni almashtirdi: ${replacedCanonical}`
  );
}

main()
  .catch((e) => {
    console.error("Oy kalitini normalizatsiya qilishda xato:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
