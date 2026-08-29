import "./load-env";
import { prisma } from "@/lib/prisma";

async function main() {
  // PAYROLL M08 obligations — ular generic/applicability yo'q, shuning uchun
  // BARCHA company uchun yaratilgan. Lekin template effectiveFrom=2026-08-01
  // — bu davrdan keyingilar to'g'ri.
  // Muammo: applicability hali yo'q, shuning uchun ular ham "fake" bo'lishi mumkin.
  // Lekin ularni bekor qilish bot ishlaganda yaxshi — aks holda 538 ta eskalatsiya.

  // M08 PAYROLL open soni
  const m08 = await prisma.$queryRaw<Array<{cnt: number}>>`
    SELECT count(*)::int as cnt
    FROM "Obligation" o
    JOIN "DeadlineTemplate" t ON t.id = o."templateId"
    WHERE t.code IN ('PAYROLL_CALC', 'PAYROLL_POSTED')
      AND o."periodKey" = '2026-M08'
      AND o.status NOT IN ('accepted', 'cancelled', 'rejected')
  `;
  console.log(`PAYROLL M08 open: ${m08[0]?.cnt ?? 0} ta`);

  // Bot ishlasa, har biri uchun eskalatsiya ketadimi?
  // Bu 538 * 3 daraja (L1, L2, L3) = 1614 ta notification
  console.log(`\nAgar bot ishlasa: ${(m08[0]?.cnt ?? 0) * 3} ta eskalatsiya xabari`);
  console.log("\nTavsiya: PAYROLL M08 larni ham bekor qilish (applicability yo'q)");

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
