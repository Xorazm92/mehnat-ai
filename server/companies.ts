"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole, isAdminRole } from "@/lib/permissions";
import { revalidateTag } from "next/cache";
import type { TaxRegime, StatsType } from "@prisma/client";

export async function getCompanies() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = (session.user as any).id;
  const role = (session.user as any).role as string;

  // Super admin, admin, chief, supervisor — all companies
  if (isSeniorRole(role)) {
    return prisma.company.findMany({
      where: { isActive: true },
      include: {
        accountant: { select: { id: true, fullName: true, avatarColor: true } },
        supervisor: { select: { id: true, fullName: true } },
        chiefAccountant: { select: { id: true, fullName: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  // Bank manager
  if (role === "bank_manager") {
    return prisma.company.findMany({
      where: {
        isActive: true,
        contractAssignments: {
          some: { userId, isActive: true, role: "bank_manager" },
        },
      },
      include: {
        accountant: { select: { id: true, fullName: true, avatarColor: true } },
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

  const userId = (session.user as any).id;
  const role = (session.user as any).role as string;

  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      accountant: { select: { id: true, fullName: true, avatarColor: true } },
      supervisor: { select: { id: true, fullName: true } },
      chiefAccountant: { select: { id: true, fullName: true } },
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

export async function createCompany(data: {
  name: string;
  inn: string;
  taxRegime: TaxRegime;
  department?: string;
  accountantId?: string;
  notes?: string;
  contractAmount?: number;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = (session.user as any).role as string;
  if (!isAdminRole(role)) throw new Error("Forbidden");

  const result = await prisma.company.create({ data });
  revalidateTag("companies", "max");
  return result;
}

export async function updateCompany(
  id: string,
  data: Partial<{
    name: string;
    inn: string;
    taxRegime: TaxRegime;
    department: string;
    accountantId: string;
    supervisorId: string;
    chiefAccountantId: string;
    login: string;
    password: string;
    notes: string;
    contractAmount: number;
    contractNumber: string;
    contractDate: Date;
    statsType: StatsType;
    kpiEnabled: boolean;
    serverInfo: string;
    companyStatus: string;
    riskLevel: string;
    riskNotes: string;
    isActive: boolean;
    brandName: string;
    directorName: string;
    directorPhone: string;
    ownerName: string;
    requiredReports: string[];
    activeServices: string[];
    accountantPerc: number;
    supervisorPerc: number;
    chiefAccountantPerc: number;
    bankClientPerc: number;
  }>
) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = (session.user as any).id;
  const role = (session.user as any).role as string;

  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) throw new Error("Company not found");

  // Permission check
  if (!isSeniorRole(role) && company.accountantId !== userId) {
    throw new Error("Forbidden");
  }

  const result = await prisma.company.update({ where: { id }, data });
  revalidateTag("companies", "max");
  return result;
}

export async function deleteCompany(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = (session.user as any).role as string;
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

  const userId = (session.user as any).id;
  const role = (session.user as any).role as string;

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
