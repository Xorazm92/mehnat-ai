import "./load-env";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // PAYROLL M08 (August) obligations — applicability yo'q
  // Template effectiveFrom=2026-08-01, lekin M08 yozuvlari ham
  // BARCHA company uchun generic yaratilgan. Bot ishlasa 1614 ta notification.
  // Bekor qilish kerak.

  const templates = await prisma.$queryRaw<Array<{id: string; code: string}>>`
    SELECT id, code FROM "DeadlineTemplate"
    WHERE code IN ('PAYROLL_CALC', 'PAYROLL_POSTED')
  `;
  const templateIds = templates.map(t => t.id);

  console.log("═".repeat(60));
  console.log("PAYROLL M08 (2026-M08) CANCELLATION");
  console.log("═".repeat(60));
  console.log(`\nPAYROLL templates: ${templates.map(t => t.code).join(", ")}`);

  if (dryRun) {
    // Count first
    const cnt = await prisma.$queryRaw<Array<{cnt: number}>>`
      SELECT count(*)::int as cnt
      FROM "Obligation"
      WHERE "templateId" IN (${Prisma.join(templateIds)})
        AND "periodKey" = '2026-M08'
        AND status NOT IN ('accepted', 'cancelled', 'rejected')
    `;
    console.log(`Dry run: ${cnt[0]?.cnt ?? 0} ta majburiyat bekor qilinadi.`);
    console.log("(--dry-run: hech narsa o'zgartirilmadi.)");
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.$executeRaw`
    UPDATE "Obligation"
    SET status = 'cancelled'
    WHERE "templateId" IN (${Prisma.join(templateIds)})
      AND "periodKey" = '2026-M08'
      AND status NOT IN ('accepted', 'cancelled', 'rejected')
  `;
  console.log(`\n✓ ${result} ta PAYROLL M08 majburiyat cancelled qilindi.`);
  console.log("  (1614 ta eskalatsiya notification oldini olindi)");

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
