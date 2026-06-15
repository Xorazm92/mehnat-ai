import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import * as bcrypt from "bcryptjs";

dotenv.config({ path: ".env.local" });

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const JSON_PATH = path.join(process.cwd(), "public", "Фирмалар 01.06.2026.json");

function cleanName(name: string) {
  // Lotin harflari va raqamlarni qoldiramiz. O'zbek ismlari uchun qo'pol bo'lsada ishlaydi.
  return name.trim().toLowerCase()
    .replace(/o'|g'/g, "o") // o' -> o
    .replace(/[^a-z0-9]/g, "");
}

async function main() {
  if (!fs.existsSync(JSON_PATH)) {
    console.error("JSON fayl topilmadi!");
    return;
  }

  console.log("📂 JSON o'qilmoqda...");
  const rawData = fs.readFileSync(JSON_PATH, "utf-8");
  const parsedData = JSON.parse(rawData);
  const royxat = parsedData["Royxat"];

  if (!royxat || !Array.isArray(royxat)) {
    console.error("Royxat varag'i topilmadi yoki xato formatda!");
    return;
  }

  console.log(`Jami ${royxat.length} ta firma ma'lumoti o'qildi.`);

  // 1. Gather all unique user names and their presumed roles
  const usersToCreate = new Map<string, { fullName: string; role: string }>();

  for (const row of royxat) {
    if (!row) continue;
    if (row["Ijrochi buxgalter"]) {
      const name = row["Ijrochi buxgalter"].toString().trim();
      usersToCreate.set(name, { fullName: name, role: "accountant" });
    }
    if (row["Bank-klient operatori"]) {
      const name = row["Bank-klient operatori"].toString().trim();
      if (!usersToCreate.has(name)) {
        usersToCreate.set(name, { fullName: name, role: "bank_manager" });
      }
    }
    if (row["Nazoratchi"]) {
      const name = row["Nazoratchi"].toString().trim();
      if (!usersToCreate.has(name)) {
        usersToCreate.set(name, { fullName: name, role: "supervisor" });
      } else {
        usersToCreate.get(name)!.role = "supervisor";
      }
    }
  }

  console.log(`Jami ${usersToCreate.size} ta xodim aniqlandi. Bazaga yozilmoqda...`);

  const defaultPassword = "User2026!";
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  // Users cache to get IDs later
  const userMap = new Map<string, string>(); // fullName -> id

  // Get existing users
  const existingUsers = await prisma.user.findMany();
  for (const u of existingUsers) {
    userMap.set(u.fullName.toLowerCase().trim(), u.id);
  }

  let usersCreated = 0;

  for (const [name, data] of usersToCreate.entries()) {
    const clean = cleanName(name) || "user";
    const email = `${clean}@mehnat.uz`;

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { fullName: { equals: name, mode: 'insensitive' } }
        ]
      }
    });

    if (existing) {
      userMap.set(name.toLowerCase(), existing.id);
      // We will preserve their current role if they are super_admin or chief_accountant, 
      // but otherwise update to supervisor if that's what the JSON says.
      if (existing.role === "accountant" && data.role === "supervisor") {
         await prisma.user.update({
           where: { id: existing.id },
           data: { role: "supervisor" }
         });
      }
    } else {
      const newUser = await prisma.user.create({
        data: {
          email,
          fullName: name,
          passwordHash,
          role: data.role as any,
          isActive: true
        }
      });
      userMap.set(name.toLowerCase(), newUser.id);
      usersCreated++;
      console.log(`   + Yangi xodim: ${name} (${email})`);
    }
  }

  console.log(`✅ Xodimlar bazasi sinxronizatsiya qilindi. (${usersCreated} ta yangi qo'shildi). Firmalarga o'tilmoqda...`);

  let companiesCreated = 0;
  let companiesUpdated = 0;

  for (const row of royxat) {
    if (!row) continue;
    const innRaw = row["STIR (INN)"]?.toString().trim();
    // Some INNs might have weird characters, strip them
    const inn = innRaw ? innRaw.replace(/[^0-9]/g, "") : undefined;
    let name = row["Tashkilot nomi"]?.toString().trim();

    if (!name) continue; 

    // Ijrochi buxgalter
    const accName = row["Ijrochi buxgalter"]?.toString().trim().toLowerCase();
    const accountantId = accName ? userMap.get(accName) : undefined;

    // Nazoratchi
    const supName = row["Nazoratchi"]?.toString().trim().toLowerCase();
    const supervisorId = supName ? userMap.get(supName) : undefined;

    // Bank-klient
    const bankName = row["Bank-klient operatori"]?.toString().trim();
    const bankNameLower = bankName?.toLowerCase();
    const bankClientId = bankNameLower ? userMap.get(bankNameLower) : undefined;

    const contractAmountStr = row["Shartnoma summasi (UZS)"]?.toString().replace(/[^0-9.]/g, "");
    const contractAmount = contractAmountStr ? Number(contractAmountStr) : undefined;

    if (inn) {
      const existingCompany = await prisma.company.findFirst({ where: { inn } });

      if (existingCompany) {
        await prisma.company.update({
          where: { id: existingCompany.id },
          data: {
            name: name || existingCompany.name,
            accountantId,
            supervisorId,
            bankClientId,
            bankClientName: bankName,
            contractAmount
          }
        });
        companiesUpdated++;
      } else {
        await prisma.company.create({
          data: {
            inn,
            name: name,
            accountantId,
            supervisorId,
            bankClientId,
            bankClientName: bankName,
            contractAmount,
            taxRegime: "vat"
          }
        });
        companiesCreated++;
      }
    } else {
      // INN yo'q bo'lsa nom bo'yicha qidiramiz
      const existingCompany = await prisma.company.findFirst({ where: { name } });
      if (existingCompany) {
        await prisma.company.update({
          where: { id: existingCompany.id },
          data: {
            accountantId,
            supervisorId,
            bankClientId,
            bankClientName: bankName,
            contractAmount
          }
        });
        companiesUpdated++;
      } else {
        await prisma.company.create({
          data: {
            inn: "NO_INN_" + Math.floor(Math.random() * 1000000),
            name: name,
            accountantId,
            supervisorId,
            bankClientId,
            bankClientName: bankName,
            contractAmount,
            taxRegime: "vat"
          }
        });
        companiesCreated++;
      }
    }
  }

  console.log(`✅ Firmalar sinxronizatsiyasi tugadi:`);
  console.log(`   - Yangi qo'shilganlar: ${companiesCreated}`);
  console.log(`   - Yangilanganlar: ${companiesUpdated}`);
  console.log(`\n🎉 01.06.2026 holatiga ma'lumotlar bazasi to'laqonli tayyor!`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
