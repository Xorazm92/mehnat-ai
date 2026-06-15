import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const companies = await prisma.company.findMany({ where: { isActive: true } });
  
  let archivedCompanies = 0;
  for (const c of companies) {
    const name = c.name.toLowerCase().trim();
    if (
      name === "sevara" || 
      name === "mardonbek" || 
      name === "farida" || 
      name === "xammasi" || 
      name === "#ref!" ||
      name.includes("oylik")
    ) {
      await prisma.company.update({
        where: { id: c.id },
        data: { isActive: false, companyStatus: "archived_summary" }
      });
      archivedCompanies++;
      console.log(`🗑️ Arxivlandi (Xato Firma/Oylik qatori): ${c.name}`);
    }
  }

  // Also verify any remaining numeric users
  const users = await prisma.user.findMany({ where: { isActive: true } });
  let archivedUsers = 0;
  for (const u of users) {
    const name = u.fullName.toLowerCase().trim();
    if (name === "#ref!") {
      await prisma.user.update({
        where: { id: u.id },
        data: { isActive: false }
      });
      archivedUsers++;
      console.log(`🗑️ Arxivlandi (Xato Xodim): ${u.fullName}`);
    }
  }

  console.log(`\nTozalash tugadi:`);
  console.log(`- ${archivedCompanies} ta xato firma arxivlandi.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
