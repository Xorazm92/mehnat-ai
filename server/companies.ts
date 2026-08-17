"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  isSeniorRole,
  isAdminRole,
  normalizeAssignmentRole,
  staffFitsAssignmentRole,
  ASSIGNMENT_ROLE_LABELS,
  type AssignmentRole,
} from "@/lib/permissions";
import { companyScopeWhere, assertCompanyPermission } from "@/lib/access";
import { recordAuditLog } from "@/lib/auditTrail";
import { updateTag } from "next/cache";
import type { TaxRegime, StatsType } from "@prisma/client";
import { serialize } from "@/lib/serialize";
import { decryptSecret } from "@/lib/crypto";
import { PRIMARY_SERVICE } from "@/lib/credentials";
import { notifyOneCBaseNeeded } from "@/lib/oneCBase";
import { telegramQueueDispatcher } from "@/lib/notifyDispatch";
import { logServerError } from "@/lib/logger";

// Shartnoma/pul maydonlari — o'zgarishi auditga yoziladi va faqat senior tahrirlaydi.
const MONEY_FIELDS = [
  "contractAmount", "paymentDay",
  "accountantPerc", "bankClientPerc", "chiefAccountantPerc", "supervisorPerc",
  "accountantSum", "bankClientSum", "chiefAccountantSum", "supervisorSum",
] as const;

interface CompanyAssignment {
  userId?: string;
  role: string;
  salaryType: string;
  salaryValue: number;
}

/** Kanonik rol imlosi bilan, xodimi tekshirilgan biriktiruv. */
interface NormalizedAssignment {
  userId: string;
  role: AssignmentRole;
  salaryType: "percent" | "fixed";
  salaryValue: number;
}

/**
 * Bazadagi eski imlolar. `ContractAssignment.role` — oddiy String, va tarixan
 * wizard 'chief'/'controller', drawer esa 'chief_accountant'/'supervisor'
 * yozgan. Yangi qator yozishdan oldin barcha variantni yopish kerak.
 */
const ALIASES_FOR_ROLE: Record<AssignmentRole, string[]> = {
  accountant: ["accountant"],
  chief_accountant: ["chief_accountant", "chief"],
  controller: ["controller", "supervisor"],
  bank_manager: ["bank_manager", "bank_client"],
};

/** Har bir rol uchun `Company` dagi ustunlar — fan-out bitta joydan boshqariladi. */
const ROLE_COLUMNS: Record<
  AssignmentRole,
  { id: string; perc: string; sum: string }
> = {
  accountant: { id: "accountantId", perc: "accountantPerc", sum: "accountantSum" },
  chief_accountant: { id: "chiefAccountantId", perc: "chiefAccountantPerc", sum: "chiefAccountantSum" },
  controller: { id: "supervisorId", perc: "supervisorPerc", sum: "supervisorSum" },
  bank_manager: { id: "bankClientId", perc: "bankClientPerc", sum: "bankClientSum" },
};

/**
 * Kirish biriktiruvlarini tozalaydi:
 *  - rol imlosini kanonik qiymatga keltiradi ('chief' → 'chief_accountant');
 *  - xodim bazada bor va faol ekanini tekshiradi;
 *  - xodimning `User.role` i biriktirish roliga mos kelishini tekshiradi.
 *
 * Ilgari bu yerda hech qanday tekshiruv yo'q edi — bank menejerni bosh
 * buxgalter qilib biriktirish mumkin edi va payroll uni jim hisoblab ketardi.
 */
async function normalizeAssignments(
  assignments: CompanyAssignment[]
): Promise<NormalizedAssignment[]> {
  const filled = assignments.filter((a) => a.userId);
  if (filled.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: filled.map((a) => a.userId as string) } },
    select: { id: true, role: true, fullName: true, isActive: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  const seen = new Set<AssignmentRole>();
  const result: NormalizedAssignment[] = [];

  for (const asgn of filled) {
    const role = normalizeAssignmentRole(asgn.role);
    if (!role) throw new Error(`Noma'lum biriktirish roli: ${asgn.role}`);
    if (seen.has(role)) {
      throw new Error(`"${ASSIGNMENT_ROLE_LABELS[role]}" roli ikki marta berilgan`);
    }
    seen.add(role);

    const user = byId.get(asgn.userId as string);
    if (!user) throw new Error("Tanlangan xodim topilmadi");
    if (!user.isActive) throw new Error(`${user.fullName} faol emas`);
    if (!staffFitsAssignmentRole(user.role, role)) {
      throw new Error(
        `${user.fullName} "${ASSIGNMENT_ROLE_LABELS[role]}" roliga biriktirilmaydi`
      );
    }

    const salaryType = asgn.salaryType === "fixed" ? "fixed" : "percent";
    const salaryValue = Number(asgn.salaryValue) || 0;
    if (salaryValue < 0) throw new Error("Ish haqi qiymati manfiy bo'lmaydi");
    // Company.*Perc — Decimal(5,2); 100 dan katta foiz DB darajasida yiqiladi.
    if (salaryType === "percent" && salaryValue > 100) {
      throw new Error("Foiz 100 dan oshmasligi kerak");
    }

    result.push({ userId: asgn.userId as string, role, salaryType, salaryValue });
  }

  return result;
}

/** Biriktiruvlarni `Company` ustunlariga yoyadi (qarama-qarshi ustun null qilinadi). */
function applyAssignmentsToCompanyData(
  data: Record<string, unknown>,
  assignments: NormalizedAssignment[]
): void {
  for (const asgn of assignments) {
    const col = ROLE_COLUMNS[asgn.role];
    data[col.id] = asgn.userId;
    if (asgn.salaryType === "percent") {
      data[col.perc] = asgn.salaryValue;
      data[col.sum] = null;
    } else {
      data[col.sum] = asgn.salaryValue;
      data[col.perc] = null;
    }
  }
}

// =====================================================
// ASOSIY (soliq.uz) CREDENTIAL — o'qish qatlami
// =====================================================
// `Company.login` / `Company.password` ustunlari OCHIQ MATNDA edi va bu
// funksiyalar butun Company qatorini qaytargani uchun parol firmalar ro'yxatini
// ko'ra oladigan HAR BIR foydalanuvchining brauzeriga tushardi (Excel eksportga
// ham). Endi qiymat shifrlangan vault'dan (`ClientCredential`) o'qiladi va faqat
// server/credentials.ts dagi bilan bir xil huquq qoidasi bo'yicha ochiladi:
// senior rol YOKI shu firmaga biriktirilgan buxgalter/bank-klient.
//
// Huquqi yo'q foydalanuvchi uchun `login`/`password` = null (UI "—" ko'rsatadi),
// xom ustunlar esa javobdan butunlay olib tashlanadi.

interface CredentialCarrier {
  id: string;
  accountantId: string | null;
  bankClientId: string | null;
  login: string | null;
  password: string | null;
}

// Faqat ADMIN, yoki AYNAN SHU firmaning buxgalteri/bank-klienti. Nazoratchi va
// bosh buxgalter ko'ra olmaydi: ular parol bilan ishlamaydi, lekin ilgari
// `isSeniorRole` orqali barcha firmalarning soliq.uz parolini olardi (Excel
// eksportga ham tushardi).
function canSeeCredentials(row: CredentialCarrier, userId: string, role: string): boolean {
  return isAdminRole(role) || row.accountantId === userId || row.bankClientId === userId;
}

async function withPrimaryCredential<T extends CredentialCarrier>(
  rows: T[],
  userId: string,
  role: string
): Promise<T[]> {
  const visibleIds = rows.filter((r) => canSeeCredentials(r, userId, role)).map((r) => r.id);

  const creds = visibleIds.length
    ? await prisma.clientCredential.findMany({
        where: { companyId: { in: visibleIds }, serviceName: PRIMARY_SERVICE },
        orderBy: { updatedAt: "desc" },
        select: { companyId: true, loginId: true, encryptedPassword: true },
      })
    : [];

  // Tarixiy dublikat bo'lsa eng oxirgi yangilangani (orderBy desc) yutadi.
  const byCompany = new Map<string, (typeof creds)[number]>();
  for (const c of creds) if (!byCompany.has(c.companyId)) byCompany.set(c.companyId, c);

  const visible = new Set(visibleIds);
  return rows.map((r) => {
    if (!visible.has(r.id)) return { ...r, login: null, password: null };
    const c = byCompany.get(r.id);
    // Vault bo'sh — bu firma hali ko'chirilmagan (scripts/migrate-company-credentials.ts).
    // Ish oqimi buzilmasligi uchun eski ustunlardan o'qiymiz.
    if (!c) return r;
    return { ...r, login: c.loginId || null, password: decryptSecret(c.encryptedPassword) || null };
  });
}

export async function getCompanies() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const role = session.user.role as string;

  // Portfel: odam HAR QANDAY mas'uliyat bilan biriktirilgan firmalar
  // (nazorat + buxgalteriya + bank birlashmasi). Admin uchun — hammasi.
  const rows = await prisma.company.findMany({
    where: { isActive: true, ...companyScopeWhere({ id: userId, role }) },
    include: {
      accountant: { select: { id: true, fullName: true, avatarColor: true } },
      supervisor: { select: { id: true, fullName: true } },
      chiefAccountant: { select: { id: true, fullName: true } },
      bankClient: { select: { id: true, fullName: true } },
      departmentRef: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });
  return serialize(await withPrimaryCredential(rows, userId, role));
}

export async function getCompanyById(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const role = session.user.role as string;

  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      accountant: { select: { id: true, fullName: true, avatarColor: true } },
      supervisor: { select: { id: true, fullName: true } },
      chiefAccountant: { select: { id: true, fullName: true } },
      bankClient: { select: { id: true, fullName: true, role: true } },
      departmentRef: { select: { id: true, name: true } },
      contractAssignments: {
        where: { isActive: true },
        include: { user: { select: { id: true, fullName: true, role: true } } },
      },
      // `credentials: true` ATAYLAB olib tashlandi: u butun vault qatorini
      // (shifrmatn bilan) klientga yuborardi va hech qayerda ishlatilmasdi.
      // UI ularni gated `getClientCredentials()` orqali oladi.
    },
  });

  if (!company) throw new Error("Company not found");

  // Obyekt-scope: portfelda bo'lishi shart. Ilgari bu yerda faqat `accountantId`
  // tekshirilardi — bank-klient ro'yxatda ko'rgan firmasini ochib ham bo'lmasdi.
  await assertCompanyPermission(prisma, { id: userId, role }, id, "company:read");

  const [withCred] = await withPrimaryCredential([company], userId, role);
  return serialize(withCred);
}

const mapTaxRegime = (val: unknown): TaxRegime => {
  if (!val) return "vat";
  const normalized = String(val).toLowerCase();
  if (normalized === "nds_profit" || normalized === "vat") return "vat";
  if (normalized === "turnover") return "turnover";
  if (normalized === "fixed") return "fixed";
  if (normalized === "yatt") return "yatt";
  if (normalized === "income") return "income";
  return "vat";
};

const mapStatsType = (val: unknown): StatsType | null => {
  if (!val) return null;
  const normalized = String(val).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized === "1kb" || normalized === "kb1") return "kb1";
  if (normalized === "micro") return "micro";
  if (normalized === "1mehnat" || normalized === "mehnat1") return "mehnat1";
  if (normalized === "small") return "small";
  return null;
};

function sanitizeCompanyData(raw: Record<string, unknown>) {
  const data: any = {};

  if (raw.name !== undefined) data.name = String(raw.name);
  if (raw.inn !== undefined) data.inn = String(raw.inn);
  if (raw.department !== undefined) data.department = raw.department ? String(raw.department) : null;
  // DIQQAT: `login` / `password` ATAYLAB e'tiborsiz qoldiriladi. Bu ustunlar
  // deprecated (ochiq matn) — yangi qiymat faqat shifrlangan vault'ga,
  // `setPrimaryCredential()` orqali yoziladi. Payload'da kelib qolsa jimgina
  // tashlanadi: eski klient kodi ham xato bermasdan ishlashda davom etadi va
  // mavjud ustun qiymatini tozalab yubormaydi.
  if (raw.brandName !== undefined) data.brandName = raw.brandName ? String(raw.brandName) : null;
  if (raw.directorName !== undefined) data.directorName = raw.directorName ? String(raw.directorName) : null;
  if (raw.directorPhone !== undefined) data.directorPhone = raw.directorPhone ? String(raw.directorPhone) : null;
  if (raw.legalAddress !== undefined) data.legalAddress = raw.legalAddress ? String(raw.legalAddress) : null;
  if (raw.founderName !== undefined) data.founderName = raw.founderName ? String(raw.founderName) : null;
  if (raw.ownerName !== undefined) data.ownerName = raw.ownerName ? String(raw.ownerName) : null;
  if (raw.bankClientName !== undefined) data.bankClientName = raw.bankClientName ? String(raw.bankClientName) : null;
  if (raw.serverInfo !== undefined) data.serverInfo = raw.serverInfo ? String(raw.serverInfo) : null;
  if (raw.serverName !== undefined) data.serverName = raw.serverName ? String(raw.serverName) : null;
  if (raw.baseName1c !== undefined) data.baseName1c = raw.baseName1c ? String(raw.baseName1c) : null;
  if (raw.contractNumber !== undefined) data.contractNumber = raw.contractNumber ? String(raw.contractNumber) : null;
  if (raw.vatCertificateDate !== undefined) data.vatCertificateDate = raw.vatCertificateDate ? String(raw.vatCertificateDate) : null;
  if (raw.oneCStatus !== undefined) data.oneCStatus = raw.oneCStatus ? String(raw.oneCStatus) : null;
  if (raw.oneCLocation !== undefined) data.oneCLocation = raw.oneCLocation ? String(raw.oneCLocation) : null;
  if (raw.companyStatus !== undefined) data.companyStatus = raw.companyStatus ? String(raw.companyStatus) : null;
  if (raw.riskLevel !== undefined) data.riskLevel = raw.riskLevel ? String(raw.riskLevel) : null;
  if (raw.riskNotes !== undefined) data.riskNotes = raw.riskNotes ? String(raw.riskNotes) : null;
  if (raw.notes !== undefined) data.notes = raw.notes ? String(raw.notes) : null;

  if (raw.kpiEnabled !== undefined) data.kpiEnabled = Boolean(raw.kpiEnabled);
  if (raw.hasLandTax !== undefined) data.hasLandTax = Boolean(raw.hasLandTax);
  if (raw.hasWaterTax !== undefined) data.hasWaterTax = Boolean(raw.hasWaterTax);
  if (raw.hasPropertyTax !== undefined) data.hasPropertyTax = Boolean(raw.hasPropertyTax);
  if (raw.hasExciseTax !== undefined) data.hasExciseTax = Boolean(raw.hasExciseTax);
  if (raw.isInternalContractor !== undefined) data.isInternalContractor = Boolean(raw.isInternalContractor);
  if (raw.isActive !== undefined) data.isActive = Boolean(raw.isActive);

  if (raw.contractAmount !== undefined) data.contractAmount = raw.contractAmount !== null ? Number(raw.contractAmount) : null;
  if (raw.paymentDay !== undefined) data.paymentDay = raw.paymentDay !== null ? Number(raw.paymentDay) : null;
  if (raw.accountantPerc !== undefined) data.accountantPerc = raw.accountantPerc !== null ? Number(raw.accountantPerc) : null;
  if (raw.bankClientPerc !== undefined) data.bankClientPerc = raw.bankClientPerc !== null ? Number(raw.bankClientPerc) : null;
  if (raw.chiefAccountantPerc !== undefined) data.chiefAccountantPerc = raw.chiefAccountantPerc !== null ? Number(raw.chiefAccountantPerc) : null;
  if (raw.supervisorPerc !== undefined) data.supervisorPerc = raw.supervisorPerc !== null ? Number(raw.supervisorPerc) : null;

  if (raw.accountantSum !== undefined) data.accountantSum = raw.accountantSum !== null ? Number(raw.accountantSum) : null;
  if (raw.bankClientSum !== undefined) data.bankClientSum = raw.bankClientSum !== null ? Number(raw.bankClientSum) : null;
  if (raw.chiefAccountantSum !== undefined) data.chiefAccountantSum = raw.chiefAccountantSum !== null ? Number(raw.chiefAccountantSum) : null;
  if (raw.supervisorSum !== undefined) data.supervisorSum = raw.supervisorSum !== null ? Number(raw.supervisorSum) : null;

  if (raw.requiredReports !== undefined) {
    data.requiredReports = Array.isArray(raw.requiredReports) ? raw.requiredReports.map(String) : [];
  }
  if (raw.activeServices !== undefined) {
    data.activeServices = Array.isArray(raw.activeServices) ? raw.activeServices.map(String) : [];
  }

  if (raw.contractDate !== undefined) {
    data.contractDate = raw.contractDate ? new Date(raw.contractDate as string | number | Date) : null;
  }

  if (raw.taxRegime !== undefined) {
    data.taxRegime = mapTaxRegime(raw.taxRegime);
  } else if (raw.taxType !== undefined) {
    data.taxRegime = mapTaxRegime(raw.taxType);
  }

  if (raw.statsType !== undefined) {
    data.statsType = mapStatsType(raw.statsType);
  }

  if (raw.itParkResident !== undefined) {
    if (typeof raw.itParkResident === "boolean") {
      data.itParkResident = raw.itParkResident ? "yes" : "no";
    } else {
      data.itParkResident = raw.itParkResident ? String(raw.itParkResident) : null;
    }
  }

  if (raw.accountantId !== undefined) data.accountantId = raw.accountantId ? String(raw.accountantId) : null;
  if (raw.supervisorId !== undefined) data.supervisorId = raw.supervisorId ? String(raw.supervisorId) : null;
  if (raw.chiefAccountantId !== undefined) data.chiefAccountantId = raw.chiefAccountantId ? String(raw.chiefAccountantId) : null;
  if (raw.bankClientId !== undefined) data.bankClientId = raw.bankClientId ? String(raw.bankClientId) : null;
  if (raw.bankClientLogin !== undefined) data.bankClientLogin = raw.bankClientLogin ? String(raw.bankClientLogin) : null;
  if (raw.bankClientPassword !== undefined) data.bankClientPassword = raw.bankClientPassword ? String(raw.bankClientPassword) : null;
  if (raw.departmentId !== undefined) data.departmentId = raw.departmentId ? String(raw.departmentId) : null;

  return data;
}

/**
 * Shu INN bilan FAOL firma allaqachon bormi?
 *
 * `Company.inn` da DB darajasida unique cheklov YO'Q (faqat `@@index`), shuning
 * uchun bir xil STIR bilan ikkinchi firma yaratish mumkin edi. 2026-08 da prodda
 * shu sababli 10 ta dublikat yig'ilgan: xodim mavjud firmani TAHRIRLASH o'rniga
 * yangisini yaratgan, natijada bitta firma uchun ikki karra majburiyat hosil
 * bo'lgan va hisobotlar ikki qatorga bo'linib ketgan
 * (`scripts/sql/2026-08-dublikat-va-bank-tozalash.sql` bilan tozalandi).
 *
 * ARXIVLANGAN qatorlar ATAYLAB hisobga olinmaydi: tozalashdan keyin ular aynan
 * shu INN'ni saqlab turibdi, ya'ni ularni ham qamrasak yangi firma ochib
 * bo'lmasdi.
 */
async function assertInnFree(inn: string, exceptId?: string): Promise<void> {
  const trimmed = inn.trim();
  if (!trimmed) return;

  const clash = await prisma.company.findFirst({
    where: {
      inn: trimmed,
      isActive: true,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { name: true },
  });

  if (clash) {
    throw new Error(
      `"${trimmed}" STIR bilan faol firma allaqachon bor: "${clash.name}". ` +
        `Yangi firma yaratish o'rniga o'shani tahrirlang.`
    );
  }
}

/**
 * YANGI firma to'liq ochilganmi.
 *
 * Wizard'da tekshiruv umuman yo'q edi va buxgalteri biriktirilmagan firma
 * yaratilib ketardi. Bunday firma EGASIZ qoladi: matritsada uni kim
 * to'ldirishi noma'lum, majburiyat dvigateli mas'ulni topmaydi, oylikda esa
 * shartnoma summasi hech kimga taqsimlanmaydi.
 *
 * Chegara SERVERDA ham turishi shart — mijoz tekshiruvi faqat qulaylik, uni
 * bitta so'rov bilan chetlab o'tish mumkin.
 *
 * ATAYLAB faqat YARATISHDA: mavjud firmalar orasida buxgalteri yo'qlari bor,
 * ularni ham qamrasak boshqa maydonni tuzatish uchun ochilgan firma
 * saqlanmay qolardi (`updateCompany` shu sababli tekshirilmaydi).
 */
function assertNewCompanyComplete(
  data: Record<string, unknown>,
  assignments?: CompanyAssignment[]
): void {
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!name) throw new Error("Firma nomi kiritilishi shart");

  const inn = typeof data.inn === "string" ? data.inn.trim() : "";
  if (!inn) throw new Error("INN kiritilishi shart");
  if (!/^\d{9}$/.test(inn)) {
    throw new Error("INN 9 ta raqamdan iborat bo'lishi kerak");
  }

  const hasAccountant = (assignments ?? []).some(
    (a) => normalizeAssignmentRole(a.role) === "accountant" && a.userId
  );
  if (!hasAccountant) {
    throw new Error(
      "Buxgalter tanlanishi shart — firma egasiz qolmasligi kerak " +
        "(Jamoa qadamidagi \"Buxgalter\" qatori)."
    );
  }
}

export async function createCompany(companyData: Record<string, unknown>, assignments?: CompanyAssignment[]) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isAdminRole(role)) throw new Error("Forbidden");

  const data = sanitizeCompanyData(companyData);
  assertNewCompanyComplete(data, assignments);
  if (typeof data.inn === "string") await assertInnFree(data.inn);

  const normalized = assignments?.length ? await normalizeAssignments(assignments) : [];
  applyAssignmentsToCompanyData(data, normalized);

  const result = await prisma.$transaction(async (tx) => {
    const newCompany = await tx.company.create({ data });

    for (const asgn of normalized) {
      await tx.contractAssignment.create({
        data: {
          companyId: newCompany.id,
          userId: asgn.userId,
          role: asgn.role,
          salaryType: asgn.salaryType,
          salaryValue: asgn.salaryValue,
          startDate: new Date(),
          isActive: true,
        },
      });
    }

    return newCompany;
  });

  await recordAuditLog({
    userId: session.user.id,
    action: "create",
    tableName: "Company",
    recordId: result.id,
    newData: { name: result.name, inn: result.inn },
  });

  // 1C baza ochish xabarnomasi — sayt + Telegram. Yiqilsa firma yaratilgani
  // bekor qilinmaydi: xabar yordamchi, firma esa asosiy natija.
  try {
    await notifyOneCBaseNeeded(
      prisma,
      {
        companyId: result.id,
        companyName: result.name,
        inn: result.inn,
        createdByName: session.user.name ?? null,
      },
      { dispatchTelegram: telegramQueueDispatcher }
    );
    updateTag("notifications");
  } catch (err) {
    logServerError("companies.notifyOneCBase", err, { companyId: result.id });
  }

  updateTag("companies");
  return serialize(result);
}

export async function updateCompany(
  id: string,
  companyData: Record<string, unknown>,
  assignments?: CompanyAssignment[]
) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const role = session.user.role as string;

  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) throw new Error("Company not found");

  await assertCompanyPermission(prisma, { id: userId, role }, id, "company:update");

  const data = sanitizeCompanyData(companyData);

  // Buxgalter o'z firmasining OPERATSION maydonlarini tahrirlaydi, lekin pul
  // maydonlarini (shartnoma summasi, ulush foizlari/summalari) va shtat
  // biriktiruvlarini emas — aks holda o'z maoshi bazasini o'zi ko'tara olardi.
  if (!isSeniorRole(role)) {
    const RESTRICTED_FIELDS = [
      ...MONEY_FIELDS,
      "contractNumber", "contractDate",
      "accountantId", "supervisorId", "chiefAccountantId", "bankClientId",
      "isActive",
    ] as const;
    for (const f of RESTRICTED_FIELDS) delete data[f];
    assignments = undefined;
  }

  // Tahrirlashda ham: STIRni boshqa FAOL firmanikiga o'zgartirib bo'lmaydi.
  if (typeof data.inn === "string") await assertInnFree(data.inn, id);

  const normalized = assignments?.length ? await normalizeAssignments(assignments) : [];
  applyAssignmentsToCompanyData(data, normalized);

  const result = await prisma.$transaction(async (tx) => {
    const updatedCompany = await tx.company.update({ where: { id }, data });

    for (const asgn of normalized) {
      // Eski imlodagi qatorlar ham yopilishi kerak, aks holda firmada ikkita
      // faol bosh buxgalter qolib ketadi ('chief' va 'chief_accountant').
      const roleAliases = ALIASES_FOR_ROLE[asgn.role];

      const existing = await tx.contractAssignment.findFirst({
        where: { companyId: id, role: { in: roleAliases }, isActive: true },
      });

      if (
        existing &&
        existing.role === asgn.role &&
        existing.userId === asgn.userId &&
        existing.salaryType === asgn.salaryType &&
        Number(existing.salaryValue) === Number(asgn.salaryValue)
      ) {
        continue;
      }

      await tx.contractAssignment.updateMany({
        where: { companyId: id, role: { in: roleAliases }, isActive: true },
        data: { isActive: false, endDate: new Date() },
      });

      await tx.contractAssignment.create({
        data: {
          companyId: id,
          userId: asgn.userId,
          role: asgn.role,
          salaryType: asgn.salaryType,
          salaryValue: asgn.salaryValue,
          startDate: new Date(),
          isActive: true,
        },
      });
    }

    return updatedCompany;
  });

  // Pul maydonlari o'zgargan bo'lsa — kim, qachon, nimadan nimaga (audit izi).
  const moneyChanges: Record<string, { old: number | null; new: number | null }> = {};
  for (const f of MONEY_FIELDS) {
    if (data[f] === undefined) continue;
    const oldVal = company[f] === null ? null : Number(company[f]);
    const newVal = data[f] === null ? null : Number(data[f]);
    if (oldVal !== newVal) moneyChanges[f] = { old: oldVal, new: newVal };
  }
  if (Object.keys(moneyChanges).length > 0 || (assignments && assignments.length > 0)) {
    await recordAuditLog({
      userId,
      action: "update",
      tableName: "Company",
      recordId: id,
      newData: {
        moneyChanges,
        ...(assignments && assignments.length > 0
          ? { assignments: assignments.map((a) => ({ userId: a.userId, role: a.role, salaryType: a.salaryType, salaryValue: a.salaryValue })) }
          : {}),
      },
    });
  }

  updateTag("companies");
  return serialize(result);
}

export async function deleteCompany(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isAdminRole(role)) throw new Error("Forbidden");

  const result = await prisma.company.update({
    where: { id },
    data: { isActive: false },
  });
  updateTag("companies");
  return serialize(result);
}

export async function getCompanyStats() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const role = session.user.role as string;

  const where = { isActive: true, ...companyScopeWhere({ id: userId, role }) };

  const [total, byTaxRegime, byRisk] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.groupBy({
      by: ["taxRegime"],
      where,
      _count: true,
    }),
    prisma.company.groupBy({
      by: ["riskLevel"],
      where,
      _count: true,
    }),
  ]);

  return serialize({ total, byTaxRegime, byRisk });
}
