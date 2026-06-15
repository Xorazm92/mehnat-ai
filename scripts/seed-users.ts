import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as bcrypt from "bcryptjs";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash("Admin2026!", 12);
  
  await prisma.user.upsert({
    where: { email: "admin@mehnat.uz" },
    update: {
      passwordHash,
      isActive: true,
      role: "super_admin",
    },
    create: {
      email: "admin@mehnat.uz",
      fullName: "Super Admin",
      passwordHash,
      role: "super_admin",
      avatarColor: "hsl(220, 80%, 60%)",
      isActive: true,
    },
  });

  const testUserHash = await bcrypt.hash("User2026!", 12);
  await prisma.user.upsert({
    where: { email: "user@mehnat.uz" },
    update: {
      passwordHash: testUserHash,
      isActive: true,
      role: "accountant",
    },
    create: {
      email: "user@mehnat.uz",
      fullName: "Test Accountant",
      passwordHash: testUserHash,
      role: "accountant",
      avatarColor: "hsl(120, 80%, 60%)",
      isActive: true,
    },
  });

  console.log("Users seeded: admin@mehnat.uz (Admin2026!) and user@mehnat.uz (User2026!)");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
