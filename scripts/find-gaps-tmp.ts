import "./load-env";
import { prisma } from "@/lib/prisma";

async function main() {
  const gaps = await prisma.$queryRaw<Array<{
    id: string; date: Date; amount: number; type: string;
    companyId: string | null; status: string; description: string | null;
    companyName: string | null; companyTin: string | null;
  }>>`
    SELECT k.id, k.date, k.amount, k.type, k."companyId", k.status, k.description,
           c.name as "companyName", c.inn as "companyInn"
      FROM "KassaEntry" k
      LEFT JOIN "Company" c ON c.id = k."companyId"
     WHERE k."deletedAt" IS NULL
       AND k.status = 'approved'
       AND NOT EXISTS (SELECT 1 FROM "LedgerEntry" l
                        WHERE l."sourceId" = k.id AND l."sourceTable" = 'KassaEntry')
     ORDER BY k.date
  `;
  console.log("Toplam:", gaps.length);
  console.log("Summa:", gaps.reduce((s, g) => s + Number(g.amount), 0));
  console.log("---");
  for (const g of gaps) {
    const firma = g.companyName ? `${g.companyName} (${g.companyInn})` : "NULL";
    console.log(`${g.date.toISOString().slice(0,10)} | ${g.type.padEnd(7)} | ${String(g.amount).padStart(12)} | ${firma} | ${g.description ?? ''}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
