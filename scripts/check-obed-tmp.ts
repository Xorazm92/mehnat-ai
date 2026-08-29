import "./load-env";
import { prisma } from "@/lib/prisma";
async function main() {
  const r = await prisma.$queryRaw<Array<{min: Date; max: Date; cnt: number}>>`
    SELECT MIN("createdAt") as min, MAX("createdAt") as max, count(*)::int as cnt
      FROM "KassaEntry"
     WHERE description LIKE 'obed:%' AND "deletedAt" IS NULL
  `;
  console.log("Obed yozuvlar (jami 51 ta, shundan 39 da ledger yo'q):");
  for (const row of r) {
    console.log(`  min: ${row.min}`);
    console.log(`  max: ${row.max}`);
    console.log(`  cnt: ${row.cnt}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
