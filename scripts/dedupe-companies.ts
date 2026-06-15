import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const activeCompanies = await prisma.company.findMany({
    where: { isActive: true },
  });

  console.log(`Boshlang'ich faol firmalar: ${activeCompanies.length}`);

  // Group by name
  const byName = new Map<string, typeof activeCompanies>();

  for (const c of activeCompanies) {
    const name = c.name.trim();
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name)!.push(c);
  }

  let archived = 0;

  for (const [name, list] of byName.entries()) {
    if (list.length > 1) {
      // Find the best one to keep:
      // 1. Valid INN (length >= 9, not all 0s)
      // 2. Has contract amount
      // 3. Keep the most recently updated one

      list.sort((a, b) => {
        const aValidInn = a.inn && a.inn !== "000000000" && !a.inn.startsWith("NO_INN") ? 1 : 0;
        const bValidInn = b.inn && b.inn !== "000000000" && !b.inn.startsWith("NO_INN") ? 1 : 0;
        
        if (aValidInn !== bValidInn) return bValidInn - aValidInn;

        const aHasAmount = a.contractAmount ? 1 : 0;
        const bHasAmount = b.contractAmount ? 1 : 0;

        if (aHasAmount !== bHasAmount) return bHasAmount - aHasAmount;

        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });

      // Keep the first one, archive the rest
      const keep = list[0];
      const duplicates = list.slice(1);

      for (const dup of duplicates) {
        await prisma.company.update({
          where: { id: dup.id },
          data: { isActive: false, companyStatus: "archived_duplicate" }
        });
        archived++;
      }
    }
  }

  console.log(`Deduplikatsiya yakunlandi. ${archived} ta dublikat firma arxivlandi.`);
  console.log(`Yakuniy faol firmalar: ${activeCompanies.length - archived}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
