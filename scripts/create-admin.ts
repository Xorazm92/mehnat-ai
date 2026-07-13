// Super-admin bootstrap (bir martalik). Ishlatish:
//   ADMIN_EMAIL=admin@asro.uz ADMIN_PASSWORD='kuchli-parol' npx tsx scripts/create-admin.ts
// Parol env orqali beriladi — kodga zaif standart parol yozilmaydi.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as bcrypt from "bcryptjs";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password || password.length < 8) {
  console.error(
    "ADMIN_EMAIL va ADMIN_PASSWORD (kamida 8 belgi) berilishi shart.\n" +
      "Misol: ADMIN_EMAIL=admin@asro.uz ADMIN_PASSWORD='kuchli-parol' npx tsx scripts/create-admin.ts"
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash(password!, 12);
  const user = await prisma.user.upsert({
    where: { email: email! },
    update: { passwordHash, role: "super_admin", isActive: true },
    create: {
      email: email!,
      fullName: "Super Admin",
      passwordHash,
      role: "super_admin",
      isActive: true,
    },
  });
  console.log("Super admin tayyor:", user.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
