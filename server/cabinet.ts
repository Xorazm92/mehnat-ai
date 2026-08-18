"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";
import { getAvailableBalance } from "@/lib/balance";
import { adjustmentMagnitude } from "@/lib/adjustments";
import { serialize } from "@/lib/serialize";
import { companyScopeWhere, companyRelations, type Actor } from "@/lib/access";
import { mapMonthlyReportToOperationEntry, FIELD_TO_DB_COLUMN } from "@/lib/operationTemplates";
import type { ObligationStatus } from "@prisma/client";

// ─────────────────────────────────────────────
// Umumiy yordamchilar — dashboardlar bo'ylab bir xil semantika
// ─────────────────────────────────────────────

// Majburiyat "yopilmagan" statuslari (accepted/cancelled tashqarida).
const OBLIGATION_NOT_DONE: ObligationStatus[] = [
  "planned",
  "in_progress",
  "ready",
  "sent",
  "rejected",
];

// Hisobot katakchasi "bajarildi" deb sanaladigan qiymatlar (nazoratchi tasdig'i).
const REPORT_DONE = new Set(["+", "accepted"]);
// "Topshirildi — tasdiq kutmoqda" qiymatlari.
// 'nol' (nol hisobot) shu yerda: buxgalter nil deklaratsiyani topshirgan, lekin
// nazoratchi hali tasdiqlamagan — ya'ni 'topshirildi' bilan bir xil bosqich.
// Avval u uchala to'plamdan ham tashqarida qolib, `missing` deb sanalardi.
const REPORT_PENDING = new Set(["topshirildi", "submitted", "nol"]);
// "Bo'sh / kerak emas" — maxrajdan tashqarida.
// 'topshirmaydi' ham shu yerda: matritsa uni "shart emas" deb ko'rsatadi.
const REPORT_EMPTY = new Set(["", "0", "not_required", "topshirmaydi"]);
// Barcha hisobot maydonlari (matritsa universumi).
const REPORT_FIELD_KEYS = Object.keys(FIELD_TO_DB_COLUMN);

// Bitta firmaning joriy oy hisobot to'ldirilganligi.
// Maxraj: requiredReports sozlangan bo'lsa — o'sha; aks holda (hozircha barcha
// firmalarda bo'sh) shu oy REAL to'ldirilgan (holat qo'yilgan) kataklar. Shunday
// qilib "0/0 → 100%" degan yolg'on ko'rsatkich chiqmaydi.
function computeReportProgress(
  report: Record<string, unknown> | null | undefined,
  requiredKeys: string[],
) {
  const entry = report
    ? (mapMonthlyReportToOperationEntry(
        report as Parameters<typeof mapMonthlyReportToOperationEntry>[0],
      ) as unknown as Record<string, unknown>)
    : null;

  let keys: string[];
  if (requiredKeys.length > 0) {
    keys = requiredKeys;
  } else if (entry) {
    // Faqat holat qo'yilgan (ishlanayotgan) kataklar.
    keys = REPORT_FIELD_KEYS.filter((k) => {
      const v = String(entry[k] ?? "").trim().toLowerCase();
      return !REPORT_EMPTY.has(v);
    });
  } else {
    keys = [];
  }

  const total = keys.length;
  if (total === 0) return { total: 0, done: 0, pending: 0, missing: 0, percent: 0, hasData: false };

  let done = 0;
  let pending = 0;
  for (const key of keys) {
    const v = String(entry?.[key] ?? "").trim().toLowerCase();
    if (REPORT_DONE.has(v)) done++;
    else if (REPORT_PENDING.has(v)) pending++;
  }
  const missing = total - done - pending;
  const percent = Math.round((done / total) * 100);
  return { total, done, pending, missing, percent, hasData: true };
}

// ─────────────────────────────────────────────
// DASHBOARD MUDDATLARI — har rol o'z ko'lamida (companyScopeWhere)
// Barcha kabinetlar shu yagona funksiyani chaqiradi.
// ─────────────────────────────────────────────
export async function getDashboardDeadlines(limit = 6) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const actor: Actor = { id: session.user.id, role: session.user.role as string };
  const now = new Date();
  const soon = new Date();
  soon.setDate(soon.getDate() + 14); // keyingi 2 hafta = "yaqin muddat"
  const scope = companyScopeWhere(actor);

  const [overdueCount, dueSoonCount, upcoming] = await Promise.all([
    prisma.obligation.count({
      where: { company: scope, status: { in: OBLIGATION_NOT_DONE }, dueAt: { lt: now } },
    }),
    prisma.obligation.count({
      where: { company: scope, status: { in: OBLIGATION_NOT_DONE }, dueAt: { gte: now, lte: soon } },
    }),
    prisma.obligation.findMany({
      where: { company: scope, status: { in: OBLIGATION_NOT_DONE } },
      include: {
        company: { select: { name: true } },
        template: { select: { name: true, obligationType: true } },
      },
      orderBy: { dueAt: "asc" },
      take: limit,
    }),
  ]);

  return serialize({
    overdueCount,
    dueSoonCount,
    upcoming: upcoming.map((o) => ({
      id: o.id,
      companyName: o.company.name,
      templateName: o.template.name,
      obligationType: o.template.obligationType,
      periodKey: o.periodKey,
      dueAt: o.dueAt,
      status: o.status as string,
      isOverdue: o.dueAt.getTime() < now.getTime(),
    })),
  });
}

// ─────────────────────────────────────────────
// SHAXSIY KABINET ("Mening kabinetim") — har qanday rol uchun
// Profil + biriktirilgan firmalar + KPI/oylik + davomat
// ─────────────────────────────────────────────
export async function getMyCabinet() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const currentMonth = new Date().toISOString().slice(0, 7); // "2026-07"
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const [profile, companies, kpiRecords, adjustments, attendance, payouts] = await Promise.all([
    // Shaxsiy profil (parolsiz)
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        avatarColor: true,
        phone: true,
        pinfl: true,
        department: true,
        gender: true,
        birthDate: true,
        education: true,
        skillLevel: true,
        hiredAt: true,
        status: true,
        rating: true,
        createdAt: true,
      },
    }),

    // Xodim istalgan rol bilan biriktirilgan firmalar
    prisma.company.findMany({
      where: {
        isActive: true,
        OR: [
          { accountantId: userId },
          { chiefAccountantId: userId },
          { supervisorId: userId },
          { bankClientId: userId },
        ],
      },
      select: {
        id: true,
        name: true,
        inn: true,
        taxRegime: true,
        riskLevel: true,
        companyStatus: true,
        accountantId: true,
        chiefAccountantId: true,
        supervisorId: true,
        bankClientId: true,
        contractAmount: true,
        brandName: true,
        directorName: true,
        directorPhone: true,
        accountantPerc: true,
        accountantSum: true,
        chiefAccountantPerc: true,
        chiefAccountantSum: true,
        supervisorPerc: true,
        supervisorSum: true,
        bankClientPerc: true,
        bankClientSum: true,
      },
      orderBy: { name: "asc" },
    }),

    // Joriy oy KPI ko'rsatkichlari
    prisma.monthlyPerformance.findMany({
      where: { employeeId: userId, month: { startsWith: currentMonth } },
      include: { rule: { select: { nameUz: true, category: true } } },
      orderBy: { recordedAt: "desc" },
      take: 20,
    }),

    // Joriy oy oylik tuzatmalari (bonus / avans / jarima)
    prisma.payrollAdjustment.findMany({
      where: { employeeId: userId, month: { startsWith: currentMonth }, deletedAt: null },
      orderBy: { createdAt: "desc" },
    }),

    // So'nggi 60 kunlik davomat
    prisma.attendance.findMany({
      where: { userId, date: { gte: sixtyDaysAgo } },
      orderBy: { date: "desc" },
      take: 60,
    }),

    // Joriy oyda REAL berilgan pullar (Payout)
    prisma.payout.findMany({
      where: { employeeId: userId, month: currentMonth, deletedAt: null },
      orderBy: { paidAt: "desc" },
    }),
  ]);

  // Har bir firma uchun xodimning mas'uliyat(lar)i. Bir firmada bir nechta bo'lishi
  // mumkin (masalan buxgalter + nazoratchi), shuning uchun `myRoles` ham beriladi;
  // `myRole` eski UI uchun birinchi (asosiy) qiymat sifatida qoladi.
  const companiesWithRole = companies.map((c) => {
    const rels = [...companyRelations(c, userId)];
    return { ...c, myRole: rels[0] ?? "", myRoles: rels };
  });

  const totalScore = kpiRecords.reduce((s, p) => s + Number(p.calculatedScore), 0);
  const approvedCount = kpiRecords.filter((p) => p.status === "approved").length;
  const pendingCount = kpiRecords.filter((p) => p.status !== "approved").length;

  // Jarima aralash ishorada saqlangan (lib/adjustments.ts) — miqdor sifatida
  // o'qilmasa, manfiy jarima "net"ni kamaytirish o'rniga OSHIRIB yuboradi.
  const bonusTotal = adjustments
    .filter((a) => a.adjustmentType === "bonus")
    .reduce((s, a) => s + adjustmentMagnitude(a.amount), 0);
  const penaltyTotal = adjustments
    .filter((a) => a.adjustmentType === "jarima")
    .reduce((s, a) => s + adjustmentMagnitude(a.amount), 0);

  const presentDays = attendance.filter((a) => a.status === "present").length;
  const lateDays = attendance.filter((a) => a.status === "late").length;
  const absentDays = attendance.filter((a) => a.status === "absent").length;

  // Joriy oyda qo'lga tegkan pul (Payout — real to'lov, majburiyat emas)
  const paidTotal = payouts.reduce((s, p) => s + Number(p.amount), 0);

  return serialize({
    profile,
    companies: companiesWithRole,
    companiesCount: companiesWithRole.length,
    kpi: { totalScore, approvedCount, pendingCount, records: kpiRecords },
    adjustments,
    payouts,
    payrollSummary: { bonusTotal, penaltyTotal, paidTotal, net: bonusTotal - penaltyTotal },
    attendance,
    attendanceSummary: { presentDays, lateDays, absentDays, total: attendance.length },
    currentMonth,
  });
}

// ─────────────────────────────────────────────
// BUXGALTER KABINETI uchun ma'lumotlar
// ─────────────────────────────────────────────
export async function getAccountantCabinetData() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const currentMonth = new Date().toISOString().slice(0, 7); // joriy oy "YYYY-MM"

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
        deletedAt: null,
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
  // "Kutmoqda" = hali tasdiqlanmagan (draft + submitted + rejected) — getMyCabinet
  // bilan bir xil ta'rif. Bu shaxsiy ko'rinish, boshqaruvchi tasdiq navbati emas.
  const pendingCount = recentPerformance.filter(
    (p) => p.status !== "approved"
  ).length;

  // Har firma uchun joriy oy hisobot to'ldirilganligi + umumiy yig'indi.
  const companiesWithProgress = companies.map((c) => {
    const progress = computeReportProgress(
      (c.monthlyReports[0] as Record<string, unknown> | undefined) ?? null,
      c.requiredReports,
    );
    return {
      id: c.id,
      name: c.name,
      inn: c.inn,
      taxRegime: c.taxRegime,
      riskLevel: c.riskLevel,
      kpiEnabled: c.kpiEnabled,
      progress,
    };
  });

  const reportTotals = companiesWithProgress.reduce(
    (acc, c) => {
      acc.required += c.progress.total;
      acc.done += c.progress.done;
      acc.pending += c.progress.pending;
      return acc;
    },
    { required: 0, done: 0, pending: 0 },
  );
  // Maxraj bo'lmasa (hech qayerda hisobot belgilanmagan) — percent = null → UI "—".
  const reportPercent =
    reportTotals.required > 0
      ? Math.round((reportTotals.done / reportTotals.required) * 100)
      : null;

  return serialize({
    companies: companiesWithProgress,
    companiesCount: companiesWithProgress.length,
    reportSummary: { ...reportTotals, percent: reportPercent },
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

    // Kassa yozuvlari (bank operatsiyalari) — EKRANDAGI RO'YXAT uchun,
    // oxirgi 20 tasi. Qoldiq bundan hisoblanmaydi (pastdagi izohga qarang).
    prisma.kassaEntry.findMany({
      where: {
        createdBy: userId,
        deletedAt: null,
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

  // Qoldiq YUQORIDAGI RO'YXATDAN hisoblanmaydi. Ikki sabab, ikkalasi ham
  // ekranda noto'g'ri raqam berardi:
  //   1) ro'yxat `take: 20` bilan cheklangan — 21-yozuvdan boshlab qoldiqqa
  //      umuman kirmasdi;
  //   2) soft-delete qilingan yozuvlar ham sanalardi (`deletedAt` filtri yo'q
  //      edi), ya'ni o'chirilgan chiqim baribir qoldiqni kamaytirib turardi.
  const kassaTotals = await prisma.kassaEntry.groupBy({
    by: ["type"],
    where: {
      createdBy: userId,
      deletedAt: null,
      date: { gte: new Date(`${currentMonth}-01`) },
    },
    _sum: { amount: true },
  });
  const sumOf = (type: string) =>
    Number(kassaTotals.find((t) => t.type === type)?._sum.amount ?? 0);
  const totalIncome = sumOf("income");
  const totalExpense = sumOf("expense");

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
// Bosh buxgalter firmaga TO'G'RIDAN-TO'G'RI (chiefAccountantId) yoki
// DEPARTAMENT orqali biriktirilgan bo'lishi mumkin — lib/access.ts scope'i
// ikkalasini ham hisobga oladi, kabinet esa faqat birinchisini ko'rardi.
const chiefCompanyWhere = (userId: string) => ({
  OR: [{ chiefAccountantId: userId }, { departmentRef: { chiefAccountantId: userId } }],
});

export async function getChiefAccountantCabinetData() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const currentMonth = new Date().toISOString().slice(0, 7);

  const [chiefCompanies, teamMembers, pendingApprovals, payrollSummary] = await Promise.all([
    // Bosh buxgalter sifatida biriktirilgan firmalar
    prisma.company.findMany({
      where: { isActive: true, ...chiefCompanyWhere(userId) },
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
        assignedCompanies: { some: chiefCompanyWhere(userId) },
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

    // Tasdiqlash kutayotgan KPI lar — FAQAT shu bosh buxgalter jamoasi
    // (aks holda butun tizimning submittedлари ko'rinib ketardi).
    prisma.monthlyPerformance.findMany({
      where: {
        status: "submitted",
        month: { startsWith: currentMonth },
        employee: {
          assignedCompanies: { some: chiefCompanyWhere(userId) },
        },
      },
      include: {
        employee: { select: { fullName: true, avatarColor: true, role: true } },
        rule: { select: { nameUz: true, category: true } },
      },
      orderBy: { submittedAt: "desc" },
      take: 20,
    }),

    // Tasdiq kutayotgan oylik tuzatmalar — FAQAT shu jamoa a'zolari.
    prisma.payrollAdjustment.findMany({
      where: {
        month: { startsWith: currentMonth },
        isApproved: false,
        deletedAt: null,
        employee: {
          assignedCompanies: { some: chiefCompanyWhere(userId) },
        },
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

  const [paidPayments, kassaEntries, expenses, payoutsOut, availableBalance] = await Promise.all([
    prisma.payment.groupBy({ by: ["period"], where: { status: "paid", deletedAt: null, period: { in: months } }, _sum: { amount: true } }),
    prisma.kassaEntry.findMany({ where: { date: { gte: rangeStart }, deletedAt: null }, select: { type: true, amount: true, date: true } }),
    // Faqat TASDIQLANGAN xarajatlar chiqim sifatida sanaladi (pending/rejected emas)
    prisma.expense.findMany({ where: { date: { gte: rangeStart }, status: "approved", deletedAt: null }, select: { amount: true, date: true } }),
    // REAL berilgan oyliklar (Payout) — majburiyat emas, faqat qo'lga berilgan pul chiqim
    prisma.payout.findMany({ where: { deletedAt: null, paidAt: { gte: rangeStart } }, select: { amount: true, paidAt: true } }),
    // Yagona joriy balans (butun tizim bo'yicha)
    getAvailableBalance(),
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
  // Payout.amount har doim musbat — oy kaliti paidAt sanasidan.
  for (const p of payoutsOut) { const m = monthKey(p.paidAt); if (m in outflow) outflow[m] += n(p.amount); }

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
    balance: availableBalance,
    monthlyCashFlow,
  });
}
