import "./load-env";
import { prisma } from "@/lib/prisma";
async function main() {
  const r = await prisma.$executeRaw`DELETE FROM "LedgerEntry" WHERE "createdBy" = 'recover-reversal'`;
  console.log("O'chirildi:", r, "ta yozuv");
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
