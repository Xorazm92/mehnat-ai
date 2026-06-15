import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Active Companies:", await prisma.company.count({ where: { isActive: true } }));
  console.log("Total Companies:", await prisma.company.count());
  console.log("Archived Companies:", await prisma.company.count({ where: { isActive: false } }));
  console.log("Companies with INN 000000000:", await prisma.company.count({ where: { inn: "000000000" } }));
  console.log("Companies with INN NO_INN_:", await prisma.company.count({ where: { inn: { startsWith: "NO_INN_" } } }));
  console.log("Active Users:", await prisma.user.count({ where: { isActive: true } }));
}
main().finally(() => prisma.$disconnect());
