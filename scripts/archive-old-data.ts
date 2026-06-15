import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: ".env.local" });

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const JSON_PATH = path.join(process.cwd(), "public", "Фирмалар 01.06.2026.json");

function cleanName(name: string) {
  return name.trim().toLowerCase()
    .replace(/o'|g'/g, "o")
    .replace(/[^a-z0-9]/g, "");
}

async function main() {
  if (!fs.existsSync(JSON_PATH)) {
    console.error("JSON fayl topilmadi!");
    return;
  }

  const rawData = fs.readFileSync(JSON_PATH, "utf-8");
  const parsedData = JSON.parse(rawData);
  const royxat = parsedData["Royxat"];

  if (!royxat || !Array.isArray(royxat)) {
    console.error("Royxat varag'i topilmadi!");
    return;
  }

  const activeInns = new Set<string>();
  const activeCompanyNames = new Set<string>();
  const activeUserEmails = new Set<string>();

  // Parse JSON to gather active entities
  for (const row of royxat) {
    if (!row) continue;

    const innRaw = row["STIR (INN)"]?.toString().trim();
    const inn = innRaw ? innRaw.replace(/[^0-9]/g, "") : undefined;
    const name = row["Tashkilot nomi"]?.toString().trim();

    if (inn) activeInns.add(inn);
    if (name) activeCompanyNames.add(name);

    // Users
    if (row["Ijrochi buxgalter"]) {
      const email = `${cleanName(row["Ijrochi buxgalter"].toString().trim())}@mehnat.uz`;
      activeUserEmails.add(email);
    }
    if (row["Bank-klient operatori"]) {
      const email = `${cleanName(row["Bank-klient operatori"].toString().trim())}@mehnat.uz`;
      activeUserEmails.add(email);
    }
    if (row["Nazoratchi"]) {
      const email = `${cleanName(row["Nazoratchi"].toString().trim())}@mehnat.uz`;
      activeUserEmails.add(email);
    }
  }

  console.log(`Jadvalda ${activeInns.size} ta unikal STIR va ${activeUserEmails.size} ta xodim aniqlandi.`);

  // ARCHIVE COMPANIES
  const allCompanies = await prisma.company.findMany();
  let companiesArchived = 0;

  for (const comp of allCompanies) {
    let isInnActive = comp.inn && activeInns.has(comp.inn);
    const isNameActive = comp.name && activeCompanyNames.has(comp.name);
    
    // If INN is a placeholder like 000000000, rely strictly on name
    if (comp.inn === "000000000" || comp.inn === "1") {
      isInnActive = false;
    }
    
    // Ignore companies starting with NO_INN_ if their name isn't active
    if (!isInnActive && !isNameActive && comp.isActive) {
      await prisma.company.update({
        where: { id: comp.id },
        data: { 
          isActive: false,
          companyStatus: "archived"
        }
      });
      companiesArchived++;
    }
  }

  console.log(`✅ ${companiesArchived} ta eski firma arxivlandi.`);

  // ARCHIVE USERS
  const allUsers = await prisma.user.findMany();
  let usersArchived = 0;

  for (const user of allUsers) {
    // Keep admins and super_admins alive
    if (user.role === "super_admin" || user.role === "admin") {
      continue;
    }

    if (!activeUserEmails.has(user.email) && user.isActive) {
      await prisma.user.update({
        where: { id: user.id },
        data: { isActive: false }
      });
      usersArchived++;
      console.log(`   - Arxivlandi (xodim): ${user.fullName} (${user.email})`);
    }
  }

  console.log(`✅ ${usersArchived} ta eski xodim arxivlandi.`);
  console.log(`\n🎉 Barcha eski ma'lumotlar arxivlanib, faqat 01.06.2026 holatidagilari asosiy bo'lib qoldi!`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
