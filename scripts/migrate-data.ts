/**
 * Data Migration Script
 * companies_dump.json va profiles_dump.json → PostgreSQL (via Prisma)
 *
 * Ishlatish:
 *   npx ts-node scripts/migrate-data.ts
 * yoki:
 *   npx tsx scripts/migrate-data.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as bcrypt from "bcryptjs";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: ".env.local" });

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Ma'lumot fayllarining joylashuvi (mehnat-ai papkasidan)
const SOURCE_DIR = path.join(__dirname, "../../");
const COMPANIES_DUMP = path.join(SOURCE_DIR, "companies_dump.json");
const PROFILES_DUMP = path.join(SOURCE_DIR, "profiles_dump.json");

const TAX_REGIME_MAP: Record<string, string> = {
  vat: "vat",
  nds: "vat",
  qqs: "vat",
  turnover: "turnover",
  aylanma: "turnover",
  fixed: "fixed",
  yatt: "yatt",
  income: "income",
  daromad: "income",
};

async function migrateProfiles() {
  console.log("📋 Profillarni ko'chirish boshlandi...");

  if (!fs.existsSync(PROFILES_DUMP)) {
    console.log("⚠️  profiles_dump.json topilmadi, o'tkazib yuborildi");
    return;
  }

  const raw = fs.readFileSync(PROFILES_DUMP, "utf-8");
  const profiles = JSON.parse(raw);
  const items = Array.isArray(profiles) ? profiles : profiles.data || [];

  let created = 0;
  let skipped = 0;

  for (const p of items) {
    try {
      let email = p.email?.toLowerCase().trim();
      if (!email) {
        const cleanName = (p.full_name || p.fullName || "user").toLowerCase().replace(/[^a-z0-9]/g, '');
        email = `${cleanName}_${p.id?.substring(0,4) || Math.floor(Math.random()*1000)}@mehnat.uz`;
      }

      // Default parol: "mehnat2026" — foydalanuvchi o'zi o'zgartirishi kerak
      const defaultPassword = "mehnat2026";
      const passwordHash = await bcrypt.hash(defaultPassword, 10);

      const roleMap: Record<string, string> = {
        super_admin: "super_admin",
        manager: "admin",
        admin: "admin",
        accountant: "accountant",
        auditor: "supervisor",
        chief_accountant: "chief_accountant",
        supervisor: "supervisor",
        bank_manager: "bank_manager",
      };

      await prisma.user.upsert({
        where: { email },
        create: {
          id: p.id || undefined,
          email,
          fullName: p.full_name || p.fullName || email.split("@")[0],
          passwordHash,
          role: (roleMap[p.role] || "accountant") as any,
          avatarColor: p.avatar_color || `hsl(${Math.floor(Math.random() * 360)}, 60%, 50%)`,
          phone: p.phone,
          department: p.department,
          isActive: p.is_active !== false,
        },
        update: {
          fullName: p.full_name || p.fullName || email.split("@")[0],
          role: (roleMap[p.role] || "accountant") as any,
          avatarColor: p.avatar_color,
          phone: p.phone,
          department: p.department,
        },
      });
      created++;
    } catch (err: any) {
      console.error(`  ❌ ${p.email}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`  ✅ ${created} profil ko'chirildi, ${skipped} o'tkazildi`);
}

async function migrateCompanies() {
  console.log("🏢 Firmalarni ko'chirish boshlandi...");

  if (!fs.existsSync(COMPANIES_DUMP)) {
    console.log("⚠️  companies_dump.json topilmadi, o'tkazib yuborildi");
    return;
  }

  const raw = fs.readFileSync(COMPANIES_DUMP, "utf-8");
  const companies = JSON.parse(raw);
  const items = Array.isArray(companies) ? companies : companies.data || [];

  // Accountant email → ID mapping
  const users = await prisma.user.findMany({
    select: { id: true, email: true, fullName: true },
  });
  const userByEmail = new Map(users.map((u) => [u.email, u]));
  const userByName = new Map(users.map((u) => [u.fullName.toLowerCase(), u]));

  let created = 0;
  let skipped = 0;

  for (const c of items) {
    try {
      const name = c.name?.trim();
      if (!name) {
        skipped++;
        continue;
      }

      // Tax regime normalizatsiyasi
      const taxRegimeRaw = (c.tax_regime || c.taxType || c.taxRegime || "vat")
        .toLowerCase()
        .replace(/[^a-z]/g, "");
      const taxRegime = (TAX_REGIME_MAP[taxRegimeRaw] || "vat") as any;

      // Accountant topish
      let accountantId: string | undefined;
      if (c.accountant_id || c.accountantId) {
        // Direct ID (Supabase UUID format)
        const uid = c.accountant_id || c.accountantId;
        // Try to find by old Supabase ID in email field
      }
      if (!accountantId && (c.accountant_name || c.accountantName)) {
        const aname = (c.accountant_name || c.accountantName || "").toLowerCase();
        const found = userByName.get(aname);
        if (found) accountantId = found.id;
      }

      if (c.id) {
        await prisma.company.upsert({
          where: { id: c.id },
          create: {
            id: c.id,
            name,
            inn: c.inn || "000000000",
            taxRegime,
            department: c.department,
            accountantId,
            login: c.login,
            password: c.password,
            notes: c.notes,
            contractAmount: c.contract_amount || c.contractAmount ? Number(c.contract_amount || c.contractAmount) : undefined,
            statsType: c.stats_type as any,
            serverInfo: c.server_info || c.serverInfo,
            serverName: c.server_name || c.serverName,
            kpiEnabled: c.kpi_enabled || c.kpiEnabled || false,
            directorName: c.director_name || c.directorName,
            directorPhone: c.director_phone || c.directorPhone,
            ownerName: c.owner_name || c.ownerName,
            brandName: c.brand_name || c.brandName,
            isActive: c.is_active !== false,
          },
          update: {
            name,
            inn: c.inn || "000000000",
            taxRegime,
            department: c.department,
            notes: c.notes,
            isActive: c.is_active !== false,
          },
        });
      } else {
        await prisma.company.create({
          data: {
            name,
            inn: c.inn || "000000000",
            taxRegime,
            department: c.department,
            accountantId,
            login: c.login,
            password: c.password,
            notes: c.notes,
            contractAmount: c.contract_amount || c.contractAmount ? Number(c.contract_amount || c.contractAmount) : undefined,
            statsType: c.stats_type as any,
            serverInfo: c.server_info || c.serverInfo,
            serverName: c.server_name || c.serverName,
            kpiEnabled: c.kpi_enabled || c.kpiEnabled || false,
            directorName: c.director_name || c.directorName,
            directorPhone: c.director_phone || c.directorPhone,
            ownerName: c.owner_name || c.ownerName,
            brandName: c.brand_name || c.brandName,
            isActive: c.is_active !== false,
          }
        });
      }
      created++;
    } catch (err: any) {
      console.error(`  ❌ ${c.name}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`  ✅ ${created} firma ko'chirildi, ${skipped} o'tkazildi`);
}

async function createSuperAdmin() {
  console.log("👑 Super admin tekshirilmoqda...");

  const passwordHash = await bcrypt.hash("Admin2026!", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@mehnat.uz" },
    update: {
      passwordHash,
      role: "super_admin",
      isActive: true,
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

  console.log(`  ✅ Super admin tayyor: ${admin.email} / Admin2026!`);
}

async function main() {
  console.log("\n🚀 Mehnat-ERP Data Migration\n");
  console.log("=".repeat(40));

  try {
    await prisma.$connect();
    console.log("✅ Database ulanish o'rnatildi\n");

    await migrateProfiles();
    await migrateCompanies();
    await createSuperAdmin();

    console.log("\n" + "=".repeat(40));
    console.log("✅ Migration muvaffaqiyatli yakunlandi!\n");

    const stats = {
      users: await prisma.user.count(),
      companies: await prisma.company.count(),
    };
    console.log(`📊 Jami: ${stats.users} foydalanuvchi, ${stats.companies} firma\n`);
  } catch (err) {
    console.error("\n❌ Migration xatosi:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
