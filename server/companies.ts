"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole, isAdminRole } from "@/lib/permissions";
import { revalidateTag } from "next/cache";
import type { TaxRegime, StatsType } from "@prisma/client";

interface CompanyAssignment {
  userId?: string;
  role: string;
  salaryType: string;
  salaryValue: number;
}

export async function getCompanies() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const role = session.user.role as string;

  // Super admin, admin, chief, supervisor — all companies
  if (isSeniorRole(role)) {
    return prisma.company.findMany({
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
  }

  // Bank manager
  if (role === "bank_manager") {
    return prisma.company.findMany({
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
  }

  // Accountant — own companies only
  return prisma.company.findMany({
    where: { accountantId: userId, isActive: true },
    include: {
      accountant: { select: { id: true, fullName: true, avatarColor: true } },
    },
    orderBy: { name: "asc" },
  });
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
      credentials: true,
      documents: { orderBy: { uploadedAt: "desc" } },
    },
  });

  if (!company) throw new Error("Company not found");

  // Access check
  if (!isSeniorRole(role) && company.accountantId !== userId) {
    throw new Error("Forbidden");
  }

  return company;
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
  if (raw.login !== undefined) data.login = raw.login ? String(raw.login) : null;
  if (raw.password !== undefined) data.password = raw.password ? String(raw.password) : null;
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
      if (asgn.role === "accountant") {
        data.accountantId = asgn.userId;
        if (asgn.salaryType === "percent") {
          data.accountantPerc = asgn.salaryValue;
        }
      } else if (asgn.role === "chief") {
        data.chiefAccountantId = asgn.userId;
        if (asgn.salaryType === "percent") {
          data.chiefAccountantPerc = asgn.salaryValue;
        }
      } else if (asgn.role === "controller") {
        data.supervisorId = asgn.userId;
        if (asgn.salaryType === "percent") {
          data.supervisorPerc = asgn.salaryValue;
        }
      } else if (asgn.role === "bank_manager") {
        data.bankClientId = asgn.userId;
        if (asgn.salaryType === "percent") {
          data.bankClientPerc = asgn.salaryValue;
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
  return result;
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

  // Map assignments to company direct fields/percentages
  if (assignments && assignments.length > 0) {
    for (const asgn of assignments) {
      if (!asgn.userId) continue;
      if (asgn.role === "accountant") {
        data.accountantId = asgn.userId;
        if (asgn.salaryType === "percent") {
          data.accountantPerc = asgn.salaryValue;
        }
      } else if (asgn.role === "chief") {
        data.chiefAccountantId = asgn.userId;
        if (asgn.salaryType === "percent") {
          data.chiefAccountantPerc = asgn.salaryValue;
        }
      } else if (asgn.role === "controller") {
        data.supervisorId = asgn.userId;
        if (asgn.salaryType === "percent") {
          data.supervisorPerc = asgn.salaryValue;
        }
      } else if (asgn.role === "bank_manager") {
        data.bankClientId = asgn.userId;
        if (asgn.salaryType === "percent") {
          data.bankClientPerc = asgn.salaryValue;
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

  revalidateTag("companies", "max");
  return result;
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
  return result;
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

  return { total, byTaxRegime, byRisk };
}
