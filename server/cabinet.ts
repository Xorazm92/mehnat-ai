"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";
import { serialize } from "@/lib/serialize";

// ─────────────────────────────────────────────
// BUXGALTER KABINETI uchun ma'lumotlar
// ─────────────────────────────────────────────
export async function getAccountantCabinetData() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const currentMonth = new Date().toISOString().slice(0, 7); // "2026-06"

  const [companies, recentPerformance, adjustments] = await Promise.all([
    // O'ziga biriktirilgan firmalar
    prisma.company.findMany({
      where: { accountantId: userId, isActive: true },
      select: {
        id: true,
        name: true,
        inn: true,
        taxRegime: true,
        riskLevel: true,
        kpiEnabled: true,
        requiredReports: true,
        monthlyReports: {
          where: { period: currentMonth },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    }),

    // Joriy oy KPI ko'rsatkichlari
    prisma.monthlyPerformance.findMany({
      where: {
        employeeId: userId,
        month: { startsWith: currentMonth },
      },
      include: { rule: true },
      orderBy: { recordedAt: "desc" },
      take: 10,
    }),

    // Oylik tuzatmalar (bonus/jarima)
    prisma.payrollAdjustment.findMany({
      where: {
        employeeId: userId,
        month: { startsWith: currentMonth },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  // KPI umumiy hisob
  const totalScore = recentPerformance.reduce(
    (sum, p) => sum + Number(p.calculatedScore),
    0
  );
  const approvedCount = recentPerformance.filter(
    (p) => p.status === "approved"
  ).length;
  const pendingCount = recentPerformance.filter(
    (p) => p.status === "draft"
  ).length;

  return serialize({
    companies,
    companiesCount: companies.length,
    kpi: { totalScore, approvedCount, pendingCount, records: recentPerformance },
    adjustments,
    currentMonth,
  });
}

// ─────────────────────────────────────────────
// BANK-KLIENT KABINETI uchun ma'lumotlar
// ─────────────────────────────────────────────
export async function getBankCabinetData() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const currentMonth = new Date().toISOString().slice(0, 7);

  const [assignedCompanies, kassaEntries, myPerformance] = await Promise.all([
    // Bank-klient sifatida biriktirilgan firmalar
    prisma.company.findMany({
      where: {
        isActive: true,
        OR: [
          { bankClientId: userId },
          {
            contractAssignments: {
              some: { userId, isActive: true, role: { in: ["bank_manager", "bank_client"] } },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        inn: true,
        bankClientName: true,
        bankClientId: true,
        contractAssignments: {
          where: { userId, isActive: true },
          select: { salaryType: true, salaryValue: true, role: true },
        },
      },
      orderBy: { name: "asc" },
    }),

    // Kassa yozuvlari (bank operatsiyalari)
    prisma.kassaEntry.findMany({
      where: {
        createdBy: userId,
        date: {
          gte: new Date(`${currentMonth}-01`),
        },
      },
      orderBy: { date: "desc" },
      take: 20,
    }),

    // Joriy oy KPI
    prisma.monthlyPerformance.findMany({
      where: {
        employeeId: userId,
        month: { startsWith: currentMonth },
      },
      include: { rule: { select: { nameUz: true, category: true } } },
      orderBy: { recordedAt: "desc" },
    }),
  ]);

  const totalIncome = kassaEntries
    .filter((k) => k.type === "income")
    .reduce((sum, k) => sum + Number(k.amount), 0);

  const totalExpense = kassaEntries
    .filter((k) => k.type === "expense")
    .reduce((sum, k) => sum + Number(k.amount), 0);

  return serialize({
    assignedCompanies,
    companiesCount: assignedCompanies.length,
    kassaEntries,
    kpiRecords: myPerformance,
    balance: { income: totalIncome, expense: totalExpense, net: totalIncome - totalExpense },
    currentMonth,
  });
}

// ─────────────────────────────────────────────
// NAZORATCHI KABINETI uchun ma'lumotlar
// ─────────────────────────────────────────────
export async function getSupervisorCabinetData() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const currentMonth = new Date().toISOString().slice(0, 7);

  const [supervisedCompanies, accountants, pendingKpi, riskStats] = await Promise.all([
    // Nazorat ostidagi firmalar
    prisma.company.findMany({
      where: { supervisorId: userId, isActive: true },
      select: {
        id: true,
        name: true,
        inn: true,
        riskLevel: true,
        companyStatus: true,
        accountant: { select: { id: true, fullName: true, avatarColor: true } },
      },
      orderBy: { name: "asc" },
    }),

    // Buxgalterlar ro'yxati (supervisor nazorat qiladigan)
    prisma.user.findMany({
      where: {
        role: "accountant",
        isActive: true,
        assignedCompanies: {
          some: { supervisorId: userId },
        },
      },
      select: {
        id: true,
        fullName: true,
        avatarColor: true,
        status: true,
        rating: true,
        _count: { select: { assignedCompanies: true } },
        performanceRecords: {
          where: { month: { startsWith: currentMonth } },
          select: { calculatedScore: true, status: true },
        },
      },
    }),

    // Tasdiqlash kutayotgan KPI lar
    prisma.monthlyPerformance.findMany({
      where: {
        status: "submitted",
        month: { startsWith: currentMonth },
        employee: {
          assignedCompanies: { some: { supervisorId: userId } },
        },
      },
      include: {
        employee: { select: { fullName: true, avatarColor: true } },
        rule: { select: { nameUz: true } },
      },
      orderBy: { submittedAt: "desc" },
      take: 15,
    }),

    // Risk statistikasi
    prisma.company.groupBy({
      by: ["riskLevel"],
      where: { supervisorId: userId, isActive: true },
      _count: true,
    }),
  ]);

  return serialize({
    supervisedCompanies,
    companiesCount: supervisedCompanies.length,
    accountants,
    pendingKpi,
    riskStats,
    currentMonth,
  });
}

// ─────────────────────────────────────────────
// BOSH BUXGALTER KABINETI uchun ma'lumotlar
// ─────────────────────────────────────────────
export async function getChiefAccountantCabinetData() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const currentMonth = new Date().toISOString().slice(0, 7);

  const [chiefCompanies, teamMembers, pendingApprovals, payrollSummary] = await Promise.all([
    // Bosh buxgalter sifatida biriktirilgan firmalar
    prisma.company.findMany({
      where: { chiefAccountantId: userId, isActive: true },
      select: {
        id: true,
        name: true,
        inn: true,
        taxRegime: true,
        riskLevel: true,
        accountantPerc: true,
        chiefAccountantPerc: true,
        accountant: { select: { id: true, fullName: true, avatarColor: true } },
      },
      orderBy: { name: "asc" },
    }),

    // Jamoa a'zolari (buxgalterlar + bank-klientlar)
    prisma.user.findMany({
      where: {
        role: { in: ["accountant", "bank_manager"] },
        isActive: true,
        assignedCompanies: { some: { chiefAccountantId: userId } },
      },
      select: {
        id: true,
        fullName: true,
        role: true,
        avatarColor: true,
        rating: true,
        status: true,
        _count: { select: { assignedCompanies: true } },
        performanceRecords: {
          where: { month: { startsWith: currentMonth } },
          select: { calculatedScore: true, status: true },
        },
      },
    }),

    // Tasdiqlash kutayotgan KPI lar (bosh buxgalter uchun)
    prisma.monthlyPerformance.findMany({
      where: {
        status: "submitted",
        month: { startsWith: currentMonth },
      },
      include: {
        employee: { select: { fullName: true, avatarColor: true, role: true } },
        rule: { select: { nameUz: true, category: true } },
      },
      orderBy: { submittedAt: "desc" },
      take: 20,
    }),

    // Oylik maosh umumiy (joriy oy)
    prisma.payrollAdjustment.findMany({
      where: {
        month: { startsWith: currentMonth },
        isApproved: false,
      },
      include: {
        employee: { select: { fullName: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const totalTeamScore = teamMembers.reduce((sum, m) => {
    const score = m.performanceRecords.reduce(
      (s, p) => s + Number(p.calculatedScore),
      0
    );
    return sum + score;
  }, 0);

  return serialize({
    chiefCompanies,
    companiesCount: chiefCompanies.length,
    teamMembers,
    pendingApprovals,
    payrollSummary,
    totalTeamScore,
    currentMonth,
  });
}

// ─────────────────────────────────────────────
// ADMIN / SUPERADMIN KABINETI uchun ma'lumotlar
// ─────────────────────────────────────────────
export async function getAdminCabinetData() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isSeniorRole(role)) throw new Error("Forbidden");

  const [userStats, companyStats, recentAudit, systemHealth] = await Promise.all([
    // Foydalanuvchi statistikasi rollar bo'yicha
    prisma.user.groupBy({
      by: ["role"],
      where: { isActive: true },
      _count: true,
    }),

    // Firma statistikasi
    prisma.company.aggregate({
      where: { isActive: true },
      _count: true,
    }),

    // Oxirgi audit yozuvlari
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        user: { select: { fullName: true, role: true, avatarColor: true } },
      },
    }),

    // Tizim holati
    Promise.all([
      prisma.user.count({ where: { isActive: true } }),
      prisma.company.count({ where: { isActive: true } }),
      prisma.notification.count({ where: { isRead: false } }),
      prisma.monthlyPerformance.count({ where: { status: "submitted" } }),
    ]),
  ]);

  const [activeUsers, activeCompanies, unreadNotifs, pendingKpi] = systemHealth;

  // ─── KPI bajarilishi % va Oylik fondi (joriy oy) ──────────
  const currentMonth = `${new Date().toISOString().slice(0, 7)}-01`;

  const [kpiAgg, companiesForFund] = await Promise.all([
    prisma.monthlyPerformance.findMany({
      where: { month: currentMonth, status: { in: ["approved", "submitted"] } },
      select: { selectedOption: true, calculatedScore: true },
    }),
    prisma.company.findMany({
      where: { isActive: true },
      select: {
        contractAmount: true,
        accountantPerc: true, accountantSum: true,
        bankClientPerc: true, bankClientSum: true,
        chiefAccountantPerc: true, chiefAccountantSum: true,
        supervisorPerc: true, supervisorSum: true,
      },
    }),
  ]);

  // "Bajarilishi" = musbat (green/coeff>0) baholar ulushi
  const scored = kpiAgg.filter((p) => p.selectedOption !== "yellow" && p.selectedOption !== null);
  const positive = kpiAgg.filter((p) => Number(p.calculatedScore) > 0).length;
  const kpiCompletionPercent = scored.length > 0 ? Math.round((positive / scored.length) * 100) : 0;

  // Oylik fondi = firmalar bo'yicha rol ulushlari yig'indisi (baza)
  const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const share = (contract: number, perc: unknown, sum: unknown) => (n(sum) > 0 ? n(sum) : (contract * n(perc)) / 100);
  let payrollFund = 0;
  for (const c of companiesForFund) {
    const contract = n(c.contractAmount);
    payrollFund += share(contract, c.accountantPerc, c.accountantSum)
      + share(contract, c.bankClientPerc, c.bankClientSum)
      + share(contract, c.chiefAccountantPerc, c.chiefAccountantSum)
      + share(contract, c.supervisorPerc, c.supervisorSum);
  }

  // ─── Pul oqimi (so'nggi 6 oy: kirim vs chiqim) ────────────
  const months: string[] = [];
  const base = new Date();
  base.setDate(1);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const rangeStart = new Date(base.getFullYear(), base.getMonth() - 5, 1);
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  const [paidPayments, kassaEntries, expenses] = await Promise.all([
    prisma.payment.groupBy({ by: ["period"], where: { status: "paid", period: { in: months } }, _sum: { amount: true } }),
    prisma.kassaEntry.findMany({ where: { date: { gte: rangeStart } }, select: { type: true, amount: true, date: true } }),
    prisma.expense.findMany({ where: { date: { gte: rangeStart } }, select: { amount: true, date: true } }),
  ]);

  const income: Record<string, number> = {};
  const outflow: Record<string, number> = {};
  for (const m of months) { income[m] = 0; outflow[m] = 0; }
  for (const p of paidPayments) income[p.period] = (income[p.period] ?? 0) + n(p._sum.amount);
  for (const k of kassaEntries) {
    const m = monthKey(k.date);
    if (!(m in income)) continue;
    if (k.type === "income") income[m] += n(k.amount);
    else outflow[m] += n(k.amount);
  }
  for (const e of expenses) { const m = monthKey(e.date); if (m in outflow) outflow[m] += n(e.amount); }

  const monthlyCashFlow = months.map((m) => ({ month: m, income: Math.round(income[m]), expense: Math.round(outflow[m]) }));

  return serialize({
    userStats,
    companyStats: companyStats._count,
    recentAudit,
    systemHealth: {
      activeUsers,
      activeCompanies,
      unreadNotifs,
      pendingKpi,
      kpiCompletionPercent,
      payrollFund: Math.round(payrollFund),
    },
    monthlyCashFlow,
  });
}
