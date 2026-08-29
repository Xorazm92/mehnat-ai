import "./load-env";
import { prisma } from "@/lib/prisma";

async function main() {
  // Firmalar without buxgalter
  const firms = await prisma.$queryRaw<Array<{id: string; name: string; inn: string}>>`
    SELECT id, name, inn
    FROM "Company"
    WHERE "accountantId" IS NULL
  `;
  console.log("Buxgalter biriktirmagan firmalar:");
  for (const f of firms) {
    console.log(`  ${f.inn} | ${f.name}`);
  }
  console.log(`\nJami: ${firms.length}`);

  // Bo'sh activeServices (companyStatus = 'active' va activeServices = empty array)
  const emptyServices = await prisma.$queryRawUnsafe<Array<{id: string; name: string; inn: string; activeServices: string}>>(
    `SELECT id, name, inn, "activeServices" FROM "Company" WHERE "activeServices" = '{}' OR "activeServices" IS NULL LIMIT 20`
  );
  console.log("\nActiveServices bo'sh firmalar:");
  for (const s of emptyServices) {
    console.log(`  ${s.inn} | ${s.name}`);
  }
  console.log(`\nJami: ${emptyServices.length}`);

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
