import "./load-env";
import { prisma } from "@/lib/prisma";
async function main() {
  const r = await prisma.$executeRaw`DELETE FROM "LedgerEntry" WHERE "createdBy" = 'fix-drift'`;
  console.log(`O'chirildi: ${r} ta adjustment yozuvi`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
