"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole, isAdminRole } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/auditTrail";
import { revalidateTag } from "next/cache";
import type { TaxRegime, StatsType } from "@prisma/client";
import { serialize } from "@/lib/serialize";
import { decryptSecret } from "@/lib/crypto";
import { PRIMARY_SERVICE } from "@/lib/credentials";

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

function canSeeCredentials(row: CredentialCarrier, userId: string, role: string): boolean {
  return isSeniorRole(role) || row.accountantId === userId || row.bankClientId === userId;
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

  // Super admin, admin, chief, supervisor — all companies
  if (isSeniorRole(role)) {
    const rows = await prisma.company.findMany({
      where: { isActive: true },
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

  // Bank manager
  if (role === "bank_manager") {
    const rows = await prisma.company.findMany({
      where: {
        isActive: true,
        OR: [
          { bankClientId: userId },
          { contractAssignments: { some: { userId, isActive: true, role: "bank_manager" } } },
        ],
      },
      include: {
        accountant: { select: { id: true, fullName: true, avatarColor: true } },
        bankClient: { select: { id: true, fullName: true } },
      },
      orderBy: { name: "asc" },
    });
    return serialize(await withPrimaryCredential(rows, userId, role));
  }

  // Accountant — own companies (primary accountantId or JAMOA-tab team assignment)
  const rows = await prisma.company.findMany({
    where: {
      isActive: true,
      OR: [
        { accountantId: userId },
        { contractAssignments: { some: { userId, isActive: true, role: "accountant" } } },
      ],
    },
    include: {
      accountant: { select: { id: true, fullName: true, avatarColor: true } },
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
      documents: { orderBy: { uploadedAt: "desc" } },
    },
  });

  if (!company) throw new Error("Company not found");

  // Access check
  if (!isSeniorRole(role) && company.accountantId !== userId) {
    throw new Error("Forbidden");
  }

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

export async function createCompany(companyData: Record<string, unknown>, assignments?: CompanyAssignment[]) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isAdminRole(role)) throw new Error("Forbidden");

  const data = sanitizeCompanyData(companyData);

  // Map assignments to company direct fields/percentages
  if (assignments && assignments.length > 0) {
    for (const asgn of assignments) {
      if (!asgn.userId) continue;
      // Qarama-qarshi maydonni null qilamiz — aks holda eski perc/sum qolib,
      // Jamoa va Shartnoma tablari ikki xil qiymat ko'rsatadi.
      if (asgn.role === "accountant") {
        data.accountantId = asgn.userId;
        if (asgn.salaryType === "percent") {
          data.accountantPerc = asgn.salaryValue;
          data.accountantSum = null;
        } else {
          data.accountantSum = asgn.salaryValue;
          data.accountantPerc = null;
        }
      } else if (asgn.role === "chief" || asgn.role === "chief_accountant") {
        data.chiefAccountantId = asgn.userId;
        if (asgn.salaryType === "percent") {
          data.chiefAccountantPerc = asgn.salaryValue;
          data.chiefAccountantSum = null;
        } else {
          data.chiefAccountantSum = asgn.salaryValue;
          data.chiefAccountantPerc = null;
        }
      } else if (asgn.role === "controller") {
        data.supervisorId = asgn.userId;
        if (asgn.salaryType === "percent") {
          data.supervisorPerc = asgn.salaryValue;
          data.supervisorSum = null;
        } else {
          data.supervisorSum = asgn.salaryValue;
          data.supervisorPerc = null;
        }
      } else if (asgn.role === "bank_manager") {
        data.bankClientId = asgn.userId;
        if (asgn.salaryType === "percent") {
          data.bankClientPerc = asgn.salaryValue;
          data.bankClientSum = null;
        } else {
          data.bankClientSum = asgn.salaryValue;
          data.bankClientPerc = null;
        }
      }
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const newCompany = await tx.company.create({ data });

    if (assignments && assignments.length > 0) {
      for (const asgn of assignments) {
        if (!asgn.userId) continue;
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
    }

    return newCompany;
  });

  revalidateTag("companies", "max");
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

  if (!isSeniorRole(role) && company.accountantId !== userId) {
    throw new Error("Forbidden");
  }

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

  // Map assignments to company direct fields/percentages
  if (assignments && assignments.length > 0) {
    for (const asgn of assignments) {
      if (!asgn.userId) continue;
      // Qarama-qarshi maydonni null qilamiz — aks holda eski perc/sum qolib,
      // Jamoa va Shartnoma tablari ikki xil qiymat ko'rsatadi.
      if (asgn.role === "accountant") {
        data.accountantId = asgn.userId;
        if (asgn.salaryType === "percent") {
          data.accountantPerc = asgn.salaryValue;
          data.accountantSum = null;
        } else {
          data.accountantSum = asgn.salaryValue;
          data.accountantPerc = null;
        }
      } else if (asgn.role === "chief" || asgn.role === "chief_accountant") {
        data.chiefAccountantId = asgn.userId;
        if (asgn.salaryType === "percent") {
          data.chiefAccountantPerc = asgn.salaryValue;
          data.chiefAccountantSum = null;
        } else {
          data.chiefAccountantSum = asgn.salaryValue;
          data.chiefAccountantPerc = null;
        }
      } else if (asgn.role === "controller") {
        data.supervisorId = asgn.userId;
        if (asgn.salaryType === "percent") {
          data.supervisorPerc = asgn.salaryValue;
          data.supervisorSum = null;
        } else {
          data.supervisorSum = asgn.salaryValue;
          data.supervisorPerc = null;
        }
      } else if (asgn.role === "bank_manager") {
        data.bankClientId = asgn.userId;
        if (asgn.salaryType === "percent") {
          data.bankClientPerc = asgn.salaryValue;
          data.bankClientSum = null;
        } else {
          data.bankClientSum = asgn.salaryValue;
          data.bankClientPerc = null;
        }
      }
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedCompany = await tx.company.update({ where: { id }, data });

    if (assignments && assignments.length > 0) {
      for (const asgn of assignments) {
        if (!asgn.userId) continue;

        const existing = await tx.contractAssignment.findFirst({
          where: {
            companyId: id,
            role: asgn.role,
            isActive: true,
          },
        });

        if (
          existing &&
          existing.userId === asgn.userId &&
          existing.salaryType === asgn.salaryType &&
          Number(existing.salaryValue) === Number(asgn.salaryValue)
        ) {
          continue;
        }

        await tx.contractAssignment.updateMany({
          where: {
            companyId: id,
            role: asgn.role,
            isActive: true,
          },
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

  revalidateTag("companies", "max");
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
  revalidateTag("companies", "max");
  return serialize(result);
}

export async function getCompanyStats() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const role = session.user.role as string;

  const where = isSeniorRole(role)
    ? { isActive: true }
    : { accountantId: userId, isActive: true };

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
