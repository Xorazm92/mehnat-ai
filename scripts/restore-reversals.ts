import "./load-env";
import { prisma } from "@/lib/prisma";

async function main() {
  // Qaytarish: reversePeriod o'zgartirish (July → August)
  const result = await prisma.ledgerEntry.updateMany({
    where: {
      accountId: "CASH",
      period: "2026-07",
      description: { contains: "re-baseline" },
    },
    data: { period: "2026-08" },
  });
  console.log(`✓ ${result.count} ta reversal period '2026-07' → '2026-08' qaytarildi`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
