import "./load-env";
import { prisma } from "@/lib/prisma";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log("═".repeat(60));
  console.log("TEST USER CLEANUP");
  console.log("═".repeat(60));

  // Test user IDs
  const testUserIds = await prisma.$queryRawUnsafe<Array<{id: string; email: string}>>(
    `SELECT id, email FROM "User" WHERE email LIKE '%@vitest.local' OR email = 'testov@gmail.com' OR email LIKE 'test.%'`
  );

  const userIds = testUserIds.map(u => `'${u.id}'`).join(',');
  console.log(`\nTest User lar: ${testUserIds.length} ta`);
  for (const u of testUserIds) console.log(`  ${u.email}`);

  if (testUserIds.length === 0) {
    console.log("Test User topilmadi.");
    await prisma.$disconnect();
    return;
  }

  // FK tekshirish — faqat Obligation (eng muhim)
  const fkObligation = await prisma.$queryRawUnsafe<Array<{cnt: number}>>(
    `SELECT count(*)::int as cnt FROM "Obligation" WHERE "responsibleUserId" IN (${userIds})`
  );

  console.log("\nBog'liq jadvallar:");
  console.log(`  Obligation: ${fkObligation[0]?.cnt ?? 0}`);

  const hasFK = (fkObligation[0]?.cnt ?? 0) > 0;

  if (hasFK) {
    console.log("\n⚠️  Test User larda bog'liq yozuvlar bor — O'CHIRIB BO'LMAYDI.");
    console.log("   Ular active foydalanuvchi — alohida ko'riladi.");
  } else {
    console.log("\n✓ Test User larda bog'liq yozuv yo'q — tozalash mumkin.");
    if (!dryRun) {
      const r = await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE id IN (${userIds})`);
      console.log(`✓ ${r} ta test User o'chirildi.`);
    } else {
      console.log("(--dry-run: hech narsa o'zgartirilmadi.)");
    }
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
