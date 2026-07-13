/**
 * YORQINOY BO'LIMI — firmalarni import qilish (idempotent, qayta ishga tushirsa bo'ladi).
 *
 * Manba: data/umumiy malumot firmalar.json (212 qator, JSON emas — `{...}, {...}` ketma-ketligi,
 * tashqi `[ ]` yo'q — shuning uchun avval o'rab olinadi).
 *
 * Pipeline: JSON parse → Userlarni upsert (Buxgalter/Bank-klient/Назоратчи) →
 *   Yorqinoy (bosh buxgalter) + "Yorqinoy bo'limi" department find-or-create →
 *   Companyni upsert (inn bo'yicha findFirst, chunki inn @unique emas) →
 *   ContractAssignment (4 rol) → validatsiya hisobot.
 *
 * XAVFSIZLIK:
 *  - Mavjud company/user yozuvlarini o'chirmaydi yoki deaktivatsiya qilmaydi.
 *  - Faqat resolveUser orqali topilgan userni isActive=true qiladi (reaktivatsiya).
 *  - IDEMPOTENT: qayta ishga tushirsa dublikat yaratmaydi (Company: findFirst+update/create,
 *    ContractAssignment: findFirst active guard, User: email/fullName bo'yicha topiladi).
 *
 * ISHLATISH:
 *   npx tsx scripts/import-yorqinoy-firmalar.ts --dry-run   (DB yozuvsiz, faqat hisobot)
 *   npx tsx scripts/import-yorqinoy-firmalar.ts              (haqiqiy import)
 *   npx tsx scripts/import-yorqinoy-firmalar.ts --rebuild               (import + 212 tadan tashqari companylarni o'chirish)
 *   npx tsx scripts/import-yorqinoy-firmalar.ts --rebuild --dry-run     (faqat hisobot, hech narsa o'chirilmaydi)
 *
 * HARD REBUILD (--rebuild):
 *  212 qator upsert qilingandan keyin, JSON'da YO'Q barcha Company (va uning bog'liq
 *  yozuvlari) o'chiriladi — DB aynan 212 ta companyda qoladi. Faqat --rebuild bilan
 *  (va --dry-run bo'lmasa) haqiqiy o'chirish sodir bo'ladi; aks holda faqat "would delete"
 *  hisobot ko'rsatiladi. Userlar HECH QACHON o'chirilmaydi/deaktivatsiya qilinmaydi.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: ".env.local" });
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })) });

const DRY_RUN = process.argv.includes("--dry-run");
const REBUILD = process.argv.includes("--rebuild");
const SOURCE_FILE = path.join(__dirname, "../data/umumiy malumot firmalar.json");
const CHIEF_EMAIL = "yorqinoy@mehnat.uz";
const CHIEF_NAME = "Yorqinoy";
const DEPT_NAME = "Yorqinoy bo'limi";
const DEFAULT_PASSWORD = "User2026!";

// =====================================================
// TYPES
// =====================================================

interface SourceRow {
  "№"?: number | string;
  "Korxona nomi "?: string;
  STIR?: number | string;
  "Soliq turi"?: string;
  "Xizmat haqi"?: number;
  Buxgalter?: string;
  "Buxgalter ulushi (%) "?: number;
  "Buxgalter ulushi (so'm) "?: number;
  " Bank-klient"?: string;
  "Bank-klient ulushi(%)"?: number;
  "Bank-klient ulushi(so'm)"?: number;
  "Назоратчи"?: string;
  "Nazoratchi ulushi (%) "?: number;
  "Nazoratchi ulushi (so'm) "?: number;
  "Bosh buxgalter ulushi(%)"?: number;
  "Bosh buxgalter ulushi(so'm)"?: number;
}

type NewUserRole = "accountant" | "supervisor" | "bank_manager";

// =====================================================
// REPORT ACCUMULATORS
// =====================================================

const report = {
  rowsParsed: 0,
  companiesCreated: 0,
  companiesUpdated: 0,
  usersCreated: [] as string[], // "Name <email>"
  usersReactivated: [] as string[], // "Name <email>"
  assignmentsCreated: 0,
  noStirKeys: [] as string[], // "row# -> NO-STIR-001"
  duplicateStirKeys: [] as string[], // "row# STIR 308852951 -> 308852951-DUP2"
  ambiguousNameMatches: [] as string[], // "Name (N matches)"
  missingNameOrContract: [] as string[], // "row# ..."
  // --- HARD REBUILD ---
  companiesInDbBefore: 0,
  companiesKept: 0,
  companiesDeleted: 0, // haqiqiy o'chirilgan (yoki would-delete, rejimga qarab)
  contractAssignmentDeleted: 0,
  monthlyPerformanceDeleted: 0,
  companyKpiRuleDeleted: 0,
  kassaEntryDeleted: 0,
  companyCountAfter: null as number | null, // faqat haqiqiy --rebuild rejimida to'ldiriladi
};

// =====================================================
// HELPERS
// =====================================================

/** Manba faylni o'qib, JSON massivga aylantiradi (tashqi [ ] yo'q bo'lishi mumkin). */
function loadSourceRows(): SourceRow[] {
  const raw0 = fs.readFileSync(SOURCE_FILE, "utf-8").trim();
  const raw = raw0.startsWith("[") ? raw0 : `[${raw0}]`;
  const data = JSON.parse(raw) as SourceRow[];
  if (data.length !== 212) {
    console.warn(`⚠️  Kutilgan 212 qator o'rniga ${data.length} qator topildi!`);
  }
  return data;
}

/** TaxRegime enum: "Aylanma" -> turnover, "НДС" -> vat, aks holda default turnover. */
function mapTaxRegime(raw?: string): "turnover" | "vat" {
  const v = (raw || "").trim().toLowerCase();
  if (v === "ндс" || v === "nds" || v === "vat") return "vat";
  if (v === "aylanma" || v === "turnover") return "turnover";
  return "turnover";
}

/** Float summalarni butun so'mga yaxlitlaydi (masalan 49000.00000000001 -> 49000). */
function roundSum(v: number | undefined | null): number {
  if (!v) return 0;
  return Math.round(v);
}

/** Ismni email-uchun slug qiladi: kichik harf, apostrof/diakritika olib tashlanadi, alfanumerik bo'lmagan belgi olib tashlanadi. */
function slugifyName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // diakritika
    .toLowerCase()
    .replace(/['`ʻʼ’]/g, "") // apostroflar
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function randomSuffix(len = 4): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/** Massivni size o'lchamdagi bo'laklarga (chunk) bo'ladi — katta IN(...) so'rovlarning oldini olish uchun. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// =====================================================
// USER RESOLUTION (cached per distinct normalized name)
// =====================================================

const userCache = new Map<string, string | null>(); // normalized name -> userId | null ("o'zida"/bo'sh)

/**
 * Manbadagi ismni User yozuviga bog'laydi.
 * - Bo'sh yoki "o'zida" -> null (o'zi, user yaratilmaydi/bog'lanmaydi).
 * - Mavjud user (fullName case-insensitive) topilsa -> reaktivatsiya (isActive=true), qaytariladi.
 * - Topilmasa -> yangi user yaratiladi (role = roleForNewUser).
 * Dry-run rejimida DB yozuv qilinmaydi — faqat mavjud userlarni o'qib, "would create" deb belgilanadi.
 */
async function resolveUser(rawName: string | undefined, roleForNewUser: NewUserRole): Promise<string | null> {
  const name = (rawName || "").trim();
  if (!name || name.toLowerCase() === "o'zida" || name.toLowerCase() === "o‘zida") return null;

  const cacheKey = name.toLowerCase();
  if (userCache.has(cacheKey)) return userCache.get(cacheKey)!;

  const matches = await prisma.user.findMany({
    where: { fullName: { equals: name, mode: "insensitive" } },
  });

  if (matches.length > 0) {
    const chosen = matches.find((m) => m.isActive) || matches[0];
    if (matches.length > 1) {
      const msg = `${name} (${matches.length} ta mos user topildi)`;
      console.warn(`⚠️  Noaniq user moslik: ${msg}`);
      report.ambiguousNameMatches.push(msg);
    }
    if (!DRY_RUN && !chosen.isActive) {
      await prisma.user.update({ where: { id: chosen.id }, data: { isActive: true } });
    }
    if (!chosen.isActive) {
      report.usersReactivated.push(`${chosen.fullName} <${chosen.email}>`);
    }
    userCache.set(cacheKey, chosen.id);
    return chosen.id;
  }

  // Yangi user yaratish
  const baseSlug = slugifyName(name) || "user";
  let email = `${baseSlug}@mehnat.uz`;
  if (DRY_RUN) {
    // Dry-run: emailning bandligini tekshiramiz (o'qish, yozuv yo'q), lekin haqiqiy yaratish qilinmaydi.
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) email = `${baseSlug}${randomSuffix()}@mehnat.uz`;
    report.usersCreated.push(`${name} <${email}> (would create, role=${roleForNewUser})`);
    userCache.set(cacheKey, null); // dry-run: haqiqiy id yo'q
    return null;
  }

  let attempt = 0;
  // Email band bo'lsa, tasodifiy suffiks bilan qayta urinamiz.
  while (attempt < 5) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) break;
    email = `${baseSlug}${randomSuffix()}@mehnat.uz`;
    attempt++;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
  const created = await prisma.user.create({
    data: { email, fullName: name, passwordHash, role: roleForNewUser, isActive: true },
  });
  report.usersCreated.push(`${name} <${email}>`);
  userCache.set(cacheKey, created.id);
  return created.id;
}

// =====================================================
// CHIEF ACCOUNTANT (Yorqinoy) + DEPARTMENT
// =====================================================

async function resolveChiefAndDepartment(): Promise<{ chiefId: string; departmentId: string }> {
  if (DRY_RUN) {
    const existingChief = await prisma.user.findUnique({ where: { email: CHIEF_EMAIL } });
    const chiefId = existingChief?.id ?? "(would create) yorqinoy";
    if (!existingChief) report.usersCreated.push(`${CHIEF_NAME} <${CHIEF_EMAIL}> (would create, role=chief_accountant)`);
    const existingDept = await prisma.department.findFirst({ where: { name: DEPT_NAME } });
    const departmentId = existingDept?.id ?? "(would create) yorqinoy-bolimi";
    return { chiefId, departmentId };
  }

  let chief = await prisma.user.findUnique({ where: { email: CHIEF_EMAIL } });
  if (!chief) {
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
    chief = await prisma.user.create({
      data: { email: CHIEF_EMAIL, fullName: CHIEF_NAME, passwordHash, role: "chief_accountant", isActive: true },
    });
    report.usersCreated.push(`${CHIEF_NAME} <${CHIEF_EMAIL}>`);
  } else if (!chief.isActive) {
    chief = await prisma.user.update({ where: { id: chief.id }, data: { isActive: true } });
    report.usersReactivated.push(`${chief.fullName} <${chief.email}>`);
  }

  let dept = await prisma.department.findFirst({ where: { name: DEPT_NAME } });
  if (!dept) {
    dept = await prisma.department.create({ data: { name: DEPT_NAME, chiefAccountantId: chief.id, isActive: true } });
  }

  return { chiefId: chief.id, departmentId: dept.id };
}

// =====================================================
// KEY SYNTHESIS (STIR yo'q / dublikat holatlar)
// =====================================================

function computeImportKeys(rows: SourceRow[]): string[] {
  const keys: string[] = [];
  const seenCount = new Map<string, number>();
  let noStirCounter = 0;

  rows.forEach((row, idx) => {
    const rowNum = row["№"] ?? idx + 1;
    const stir = row.STIR;
    let key: string;

    if (stir !== undefined && stir !== null && String(stir).trim() !== "") {
      const baseKey = String(stir).trim();
      const seen = seenCount.get(baseKey) || 0;
      seenCount.set(baseKey, seen + 1);
      if (seen === 0) {
        key = baseKey;
      } else {
        key = `${baseKey}-DUP${seen + 1}`;
        report.duplicateStirKeys.push(`qator ${rowNum}: STIR ${baseKey} -> ${key}`);
      }
    } else {
      noStirCounter++;
      key = `NO-STIR-${String(noStirCounter).padStart(3, "0")}`;
      report.noStirKeys.push(`qator ${rowNum}: STIR yo'q -> ${key}`);
    }

    keys.push(key);
  });

  return keys;
}

// =====================================================
// MAIN IMPORT
// =====================================================

async function run() {
  report.companiesInDbBefore = await prisma.company.count();

  const rows = loadSourceRows();
  report.rowsParsed = rows.length;

  const keys = computeImportKeys(rows);
  const { chiefId, departmentId } = await resolveChiefAndDepartment();

  // HARD REBUILD uchun: shu run davomida "ushlab qolinadigan" (JSON'dagi 212) company id'lari.
  // Faqat MAVJUD (allaqachon DB'da bo'lgan) companylar id'i kerak — dry-run'da yangi
  // yaratiladigan companyning hali id'i yo'q, lekin u DB'da mavjud bo'lmagani uchun
  // "delete candidate" so'rovida ham chiqmaydi — demak keepIds'ga qo'shmasak ham xavfsiz.
  const keepIds: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const key = keys[i];
    const rowNum = row["№"] ?? i + 1;

    const name = (row["Korxona nomi "] || "").trim().replace(/^["']+|["']+$/g, "");
    const contractAmount = row["Xizmat haqi"] || 0;
    if (!name || !contractAmount) {
      report.missingNameOrContract.push(
        `qator ${rowNum} (${key}): ${!name ? "nomi yo'q" : `nomi="${name}"`}, contractAmount=${contractAmount || 0}`
      );
    }

    const taxRegime = mapTaxRegime(row["Soliq turi"]);
    const accountantId = await resolveUser(row["Buxgalter"], "accountant");
    const bankClientRaw = row[" Bank-klient"];
    const bankClientId = await resolveUser(bankClientRaw, "bank_manager");
    const supervisorId = await resolveUser(row["Назоратчи"], "supervisor");

    const accountantPerc = row["Buxgalter ulushi (%) "] || 0;
    const accountantSum = roundSum(row["Buxgalter ulushi (so'm) "]);
    const bankClientPerc = row["Bank-klient ulushi(%)"] || 0;
    const bankClientSum = roundSum(row["Bank-klient ulushi(so'm)"]);
    const supervisorPerc = row["Nazoratchi ulushi (%) "] || 0;
    const supervisorSum = roundSum(row["Nazoratchi ulushi (so'm) "]);
    const chiefAccountantPerc = row["Bosh buxgalter ulushi(%)"] || 7;
    const chiefAccountantSum = roundSum(row["Bosh buxgalter ulushi(so'm)"]);

    const companyData = {
      name: name || `(nomsiz #${key})`,
      inn: key,
      taxRegime: taxRegime as never,
      contractAmount,
      accountantId,
      bankClientId,
      bankClientName: bankClientRaw ? String(bankClientRaw).trim() : null,
      supervisorId,
      chiefAccountantId: chiefId,
      accountantPerc,
      accountantSum,
      bankClientPerc,
      bankClientSum,
      supervisorPerc,
      supervisorSum,
      chiefAccountantPerc,
      chiefAccountantSum,
      departmentId,
      kpiEnabled: true,
      isActive: true,
    };

    if (DRY_RUN) {
      const existing = await prisma.company.findFirst({ where: { inn: key } });
      if (existing) {
        report.companiesUpdated++;
        keepIds.push(existing.id); // mavjud company — keep set'ga kiradi
      } else {
        report.companiesCreated++;
      }
      continue;
    }

    let company = await prisma.company.findFirst({ where: { inn: key } });
    if (company) {
      company = await prisma.company.update({ where: { id: company.id }, data: companyData });
      report.companiesUpdated++;
    } else {
      company = await prisma.company.create({ data: companyData });
      report.companiesCreated++;
    }
    keepIds.push(company.id);

    // ContractAssignment — har rol uchun (null userId bo'lgan rollar o'tkazib yuboriladi)
    const assignments: { userId: string | null; role: string; value: number }[] = [
      { userId: accountantId, role: "accountant", value: accountantPerc },
      { userId: bankClientId, role: "bank_manager", value: bankClientPerc },
      { userId: supervisorId, role: "supervisor", value: supervisorPerc },
      { userId: chiefId, role: "chief_accountant", value: chiefAccountantPerc },
    ];

    for (const a of assignments) {
      if (!a.userId) continue;
      const exists = await prisma.contractAssignment.findFirst({
        where: { companyId: company.id, userId: a.userId, role: a.role, isActive: true },
      });
      if (!exists) {
        await prisma.contractAssignment.create({
          data: {
            companyId: company.id,
            userId: a.userId,
            role: a.role,
            salaryType: "percent",
            salaryValue: a.value || 0,
            startDate: new Date(),
            isActive: true,
          },
        });
        report.assignmentsCreated++;
      }
    }
  }

  await reconcileHardRebuild(keepIds);
}

// =====================================================
// HARD REBUILD — JSON'dan tashqari companylarni topish/o'chirish
// =====================================================

/**
 * 212 qator upsert qilingandan keyin chaqiriladi (keepIds — shu run'da moslangan mavjud
 * companylarning id'lari). DB'dagi barcha companylardan keepIds'da yo'qlarini topadi va,
 * agar --rebuild && !DRY_RUN bo'lsa, ularni (va bog'liq yozuvlarini) o'chiradi.
 * Aks holda faqat "would delete" hisobotini o'qish (read-only) orqali tayyorlaydi.
 */
async function reconcileHardRebuild(keepIds: string[]) {
  // Diqqat: keepIds faqat "shu run'da DB'da MAVJUD bo'lgan (update qilingan)" company id'larini
  // o'z ichiga oladi (dry-run'da yangi yaratiladigan 143 tasining hali id'i yo'q). Bu notIn
  // so'rovi uchun yetarli (mavjud bo'lmagan id barbir DB'da yo'q), lekin "saqlab qolindi" deb
  // HISOBOTDA ko'rsatiladigan son 212 (jami qayta ishlangan) bo'lishi kerak — shuning uchun
  // report.companiesKept'ni keepIds.length'dan emas, to'liq qayta ishlangan sondan hisoblaymiz.
  report.companiesKept = report.companiesCreated + report.companiesUpdated;

  const deleteCandidates = await prisma.company.findMany({
    where: { id: { notIn: keepIds } },
    select: { id: true },
  });
  const deleteIds = deleteCandidates.map((c) => c.id);

  if (REBUILD && !DRY_RUN) {
    // Haqiqiy o'chirish — schema.prisma bo'yicha tasdiqlangan tartibda (qayta tartiblanmasin):
    // a) ContractAssignment — FK bor, onDelete cascade YO'Q -> birinchi o'chirilishi SHART.
    // b) MonthlyPerformance — companyId oddiy String, FK yo'q -> yetim yozuvlarni tozalash.
    // c) CompanyKpiRule — companyId oddiy String, FK yo'q -> yetim yozuvlarni tozalash.
    // d) KassaEntry — companyId String?, FK yo'q -> yetim yozuvlarni tozalash.
    // e) Company — MonthlyReport/Payment/Operation/ClientCredential/Document'ga onDelete:
    //    Cascade bor, shuning uchun ular avtomatik o'chadi, qo'lda o'chirish kerak emas.
    for (const idsChunk of chunk(deleteIds, 500)) {
      const r1 = await prisma.contractAssignment.deleteMany({ where: { companyId: { in: idsChunk } } });
      report.contractAssignmentDeleted += r1.count;

      const r2 = await prisma.monthlyPerformance.deleteMany({ where: { companyId: { in: idsChunk } } });
      report.monthlyPerformanceDeleted += r2.count;

      const r3 = await prisma.companyKpiRule.deleteMany({ where: { companyId: { in: idsChunk } } });
      report.companyKpiRuleDeleted += r3.count;

      const r4 = await prisma.kassaEntry.deleteMany({ where: { companyId: { in: idsChunk } } });
      report.kassaEntryDeleted += r4.count;

      const r5 = await prisma.company.deleteMany({ where: { id: { in: idsChunk } } });
      report.companiesDeleted += r5.count;
    }

    report.companyCountAfter = await prisma.company.count();
    if (report.companyCountAfter !== keepIds.length) {
      console.warn(
        `⚠️⚠️⚠️  REBUILD dan keyin company.count() (${report.companyCountAfter}) keepIds.length (${keepIds.length}) ga teng emas! Sababini tekshiring.`
      );
    }
  } else {
    // Dry-run yoki --rebuild berilmagan — faqat "would delete" hisobotini o'qib chiqamiz (yozuv yo'q).
    report.companiesDeleted = deleteIds.length;
    for (const idsChunk of chunk(deleteIds, 500)) {
      report.contractAssignmentDeleted += await prisma.contractAssignment.count({ where: { companyId: { in: idsChunk } } });
      report.monthlyPerformanceDeleted += await prisma.monthlyPerformance.count({ where: { companyId: { in: idsChunk } } });
      report.companyKpiRuleDeleted += await prisma.companyKpiRule.count({ where: { companyId: { in: idsChunk } } });
      report.kassaEntryDeleted += await prisma.kassaEntry.count({ where: { companyId: { in: idsChunk } } });
    }
  }
}

// =====================================================
// VALIDATION REPORT
// =====================================================

function printReport() {
  console.log("\n" + "=".repeat(60));
  console.log(`📊 IMPORT HISOBOTI ${DRY_RUN ? "(DRY-RUN — DB'ga yozilmadi)" : ""}`);
  console.log("=".repeat(60));
  console.log(`Jami qator o'qildi:        ${report.rowsParsed}`);
  console.log(`Company yaratildi:         ${report.companiesCreated}`);
  console.log(`Company yangilandi:        ${report.companiesUpdated}`);
  console.log(`Jami company qayta ishlandi: ${report.companiesCreated + report.companiesUpdated}`);
  console.log(`ContractAssignment yaratildi: ${report.assignmentsCreated}`);
  console.log(`\nUser yangi yaratildi (${report.usersCreated.length}):`);
  report.usersCreated.forEach((u) => console.log(`  + ${u}`));
  console.log(`\nUser reaktivatsiya qilindi (${report.usersReactivated.length}):`);
  report.usersReactivated.forEach((u) => console.log(`  ~ ${u}`));

  console.log("\n" + "-".repeat(60));
  console.log("⚠️  NEEDS REVIEW");
  console.log("-".repeat(60));

  console.log(`\nSTIR yo'q (sintez qilingan NO-STIR-* kalitlar) — ${report.noStirKeys.length} ta:`);
  report.noStirKeys.forEach((s) => console.log(`  - ${s}`));

  console.log(`\nTakror STIR (DUP suffiks bilan) — ${report.duplicateStirKeys.length} ta:`);
  report.duplicateStirKeys.forEach((s) => console.log(`  - ${s}`));

  console.log(`\nNoaniq ism moslik (bir nechta user topildi) — ${report.ambiguousNameMatches.length} ta:`);
  report.ambiguousNameMatches.forEach((s) => console.log(`  - ${s}`));

  console.log(`\nNomi yo'q yoki contractAmount=0/yo'q — ${report.missingNameOrContract.length} ta:`);
  report.missingNameOrContract.forEach((s) => console.log(`  - ${s}`));

  const realRebuild = REBUILD && !DRY_RUN;
  const deleteLabel = realRebuild ? "o'chirildi" : "o'chirilgan bo'lardi (would delete)";
  console.log("\n" + "-".repeat(60));
  console.log(`🧹 REBUILD${realRebuild ? "" : " (hisobot, hech narsa o'chirilmadi)"}`);
  console.log("-".repeat(60));
  console.log(`DB'dagi companylar (rekonsilatsiyagacha): ${report.companiesInDbBefore}`);
  console.log(`Companylar saqlab qolindi (keepIds):       ${report.companiesKept}`);
  console.log(`Companylar ${deleteLabel}:            ${report.companiesDeleted}`);
  console.log(`  - contractAssignment ${deleteLabel}:  ${report.contractAssignmentDeleted}`);
  console.log(`  - monthlyPerformance ${deleteLabel}:  ${report.monthlyPerformanceDeleted}`);
  console.log(`  - companyKpiRule ${deleteLabel}:      ${report.companyKpiRuleDeleted}`);
  console.log(`  - kassaEntry ${deleteLabel}:          ${report.kassaEntryDeleted}`);
  if (realRebuild) {
    const ok = report.companyCountAfter === report.companiesKept;
    console.log(
      `company.count() dan keyin == keepIds.length (${report.companiesKept})?  ${ok ? "Ha ✅" : `Yo'q ⚠️ (${report.companyCountAfter})`}`
    );
  } else if (!REBUILD) {
    console.log(`ℹ️  --rebuild bilan ishga tushiring, ${report.companiesDeleted} ta JSON'dan tashqari company o'chiriladi.`);
  }

  const totalProcessed = report.companiesCreated + report.companiesUpdated;
  console.log("\n" + "=".repeat(60));
  if (totalProcessed === 212 && report.rowsParsed === 212) {
    console.log(`✅ Hisob to'g'ri keladi: 212 qator o'qildi, 212 company qayta ishlandi.`);
  } else {
    console.log(
      `⚠️  Hisob NOMUVOFIQ: ${report.rowsParsed} qator o'qildi, lekin ${totalProcessed} company qayta ishlandi. Sababini tekshiring!`
    );
  }
  console.log("=".repeat(60) + "\n");
}

// =====================================================
// ENTRY POINT
// =====================================================

async function main() {
  if (DRY_RUN) console.log("🔎 DRY-RUN rejimi: hech qanday DB yozuv amalga oshirilmaydi.\n");
  await run();
  printReport();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
