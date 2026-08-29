import "./load-env";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // PAYROLL_CALC va PAYROLL_POSTED template larda applicability mezoni yo'q
  // Shu sabab ular BARCHA company uchun BARCHA davrda yaratilgan
  // effectiveFrom = 2026-08-01, lekin yozuvlar 2026-M07 va undan oldin
  //
  // Tozalash: 2026-08-01 dan oldingi PAYROLL_CALC va PAYROLL_POSTED
  // majburiyatlarini "cancelled" qilamiz

  const templates = await prisma.$queryRaw<Array<{id: string; code: string}>>`
    SELECT id, code FROM "DeadlineTemplate"
    WHERE code IN ('PAYROLL_CALC', 'PAYROLL_POSTED')
  `;
  const templateIds = templates.map(t => t.id);
  console.log(`PAYROLL templates: ${templates.map(t => `${t.code} (${t.id.slice(0,8)})`).join(", ")}`);

  if (templateIds.length === 0) {
    console.log("PAYROLL templates topilmadi.");
    await prisma.$disconnect();
    return;
  }

  // Olingan obligatsiyalar soni
  const obligations = await prisma.$queryRaw<Array<{cnt: number}>>`
    SELECT count(*)::int as cnt
    FROM "Obligation"
    WHERE "templateId" IN (${Prisma.join(templateIds)})
      AND status NOT IN ('accepted', 'cancelled', 'rejected')
  `;
  console.log(`Ochiq PAYROLL majburiyatlari: ${obligations[0]?.cnt ?? 0}`);

  if (dryRun) {
    console.log("\n--dry-run: hech narsa o'zgartirilmadi.");
    await prisma.$disconnect();
    return;
  }

  // Faqat 2026-M07 (July) va undan oldingi davrlarni bekor qilish
  // Chunki template effectiveFrom = 2026-08-01
  // 2026-M08 obligations keyinroq yaratilgan, ularni qoldiramiz (applicability hali yo'q)
  const result = await prisma.$executeRaw`
    UPDATE "Obligation"
    SET status = 'cancelled'
    WHERE "templateId" IN (${Prisma.join(templateIds)})
      AND "periodKey" < '2026-M08'
      AND status NOT IN ('accepted', 'cancelled', 'rejected')
  `;
  console.log(`\n✓ ${result} ta PAYROLL majburiyat (2026-M07 va oldingilar) cancelled qilindi.`);

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
