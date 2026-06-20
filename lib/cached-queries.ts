/**
 * Markaziy cache qatlami — barcha "o'qish" so'rovlari uchun.
 *
 * Har bir funksiya:
 *  1) `unstable_cache` — server-side cache (5 daqiqa TTL)
 *  2) `React.cache()`  — bitta render ichida deduplication
 *  3) `tags`           — mutatsiyada `revalidateTag()` bilan tozalanadi
 *
 * auth() (cookies) cache ichida ishlamaydi, shuning uchun
 * auth tekshiruvini tashqarida qilib, natijani (userId, role)
 * argument sifatida beramiz.
 */

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isSeniorRole } from "@/lib/permissions";

// ─────────────────────────────────────────────
// COMPANIES
// ─────────────────────────────────────────────

const _getCachedCompaniesForSenior = unstable_cache(
  async () => {
    return prisma.company.findMany({
      where: { isActive: true },
      include: {
        accountant: { select: { id: true, fullName: true, avatarColor: true } },
        supervisor: { select: { id: true, fullName: true } },
        chiefAccountant: { select: { id: true, fullName: true } },
      },
      orderBy: { name: "asc" },
    });
  },
  ["companies-senior"],
  { tags: ["companies"], revalidate: 300 }
);

const _getCachedCompaniesForBankManager = unstable_cache(
  async (userId: string) => {
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
  },
  ["companies-bank"],
  { tags: ["companies"], revalidate: 300 }
);

const _getCachedCompaniesForAccountant = unstable_cache(
  async (userId: string) => {
    return prisma.company.findMany({
      where: { accountantId: userId, isActive: true },
      include: {
        accountant: { select: { id: true, fullName: true, avatarColor: true } },
      },
      orderBy: { name: "asc" },
    });
  },
  ["companies-accountant"],
  { tags: ["companies"], revalidate: 300 }
);

/** Firmalarni cache'dan olish (render ichida deduplicate) */
export const getCachedCompanies = cache(
  async (userId: string, role: string) => {
    if (isSeniorRole(role)) {
      return _getCachedCompaniesForSenior();
    }
    if (role === "bank_manager") {
      return _getCachedCompaniesForBankManager(userId);
    }
    return _getCachedCompaniesForAccountant(userId);
  }
);

// ─────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────

const _getCachedUsers = unstable_cache(
  async () => {
    return prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        avatarColor: true,
        phone: true,
        department: true,
        gender: true,
        birthDate: true,
        education: true,
        hiredAt: true,
        status: true,
        rating: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { fullName: "asc" },
    });
  },
  ["users-all"],
  { tags: ["users"], revalidate: 300 }
);

/** Xodimlarni cache'dan olish (faqat senior rollar uchun) */
export const getCachedUsers = cache(async () => {
  return _getCachedUsers();
});

// ─────────────────────────────────────────────
// OPERATIONS
// ─────────────────────────────────────────────

const _getCachedOperationsForSenior = unstable_cache(
  async () => {
    return prisma.operation.findMany({
      where: {},
      include: {
        company: {
          select: {
            id: true,
            name: true,
            inn: true,
            taxRegime: true,
            accountantId: true,
            accountant: { select: { id: true, fullName: true } },
          },
        },
      },
      orderBy: [{ period: "desc" }, { company: { name: "asc" } }],
    });
  },
  ["operations-senior"],
  { tags: ["operations"], revalidate: 300 }
);

const _getCachedOperationsForAccountant = unstable_cache(
  async (userId: string) => {
    return prisma.operation.findMany({
      where: { company: { accountantId: userId } },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            inn: true,
            taxRegime: true,
            accountantId: true,
            accountant: { select: { id: true, fullName: true } },
          },
        },
      },
      orderBy: [{ period: "desc" }, { company: { name: "asc" } }],
    });
  },
  ["operations-accountant"],
  { tags: ["operations"], revalidate: 300 }
);

/** Operatsiyalarni cache'dan olish (render ichida deduplicate) */
export const getCachedOperations = cache(
  async (userId: string, role: string) => {
    if (isSeniorRole(role)) {
      return _getCachedOperationsForSenior();
    }
    return _getCachedOperationsForAccountant(userId);
  }
);

// ─────────────────────────────────────────────
// COMPANY STATS
// ─────────────────────────────────────────────

const _getCachedCompanyStatsForSenior = unstable_cache(
  async () => {
    const [total, byTaxRegime, byRisk] = await Promise.all([
      prisma.company.count({ where: { isActive: true } }),
      prisma.company.groupBy({
        by: ["taxRegime"],
        where: { isActive: true },
        _count: true,
      }),
      prisma.company.groupBy({
        by: ["riskLevel"],
        where: { isActive: true },
        _count: true,
      }),
    ]);
    return { total, byTaxRegime, byRisk };
  },
  ["company-stats-senior"],
  { tags: ["companies"], revalidate: 300 }
);

const _getCachedCompanyStatsForAccountant = unstable_cache(
  async (userId: string) => {
    const where = { accountantId: userId, isActive: true };
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
  },
  ["company-stats-accountant"],
  { tags: ["companies"], revalidate: 300 }
);

/** Firma statistikasini cache'dan olish */
export const getCachedCompanyStats = cache(
  async (userId: string, role: string) => {
    if (isSeniorRole(role)) {
      return _getCachedCompanyStatsForSenior();
    }
    return _getCachedCompanyStatsForAccountant(userId);
  }
);

// ─────────────────────────────────────────────
// OPERATION SUMMARY
// ─────────────────────────────────────────────

const _getCachedOperationSummaryForSenior = unstable_cache(
  async () => {
    const [total, accepted, rejected, blocked, inProgress] = await Promise.all([
      prisma.operation.count({ where: {} }),
      prisma.operation.count({ where: { profitTaxStatus: "accepted" } }),
      prisma.operation.count({ where: { profitTaxStatus: "rejected" } }),
      prisma.operation.count({ where: { profitTaxStatus: "blocked" } }),
      prisma.operation.count({ where: { profitTaxStatus: "in_progress" } }),
    ]);
    return {
      total,
      accepted,
      rejected,
      blocked,
      inProgress,
      pending: total - accepted - rejected - blocked - inProgress,
    };
  },
  ["operation-summary-senior"],
  { tags: ["operations"], revalidate: 300 }
);

const _getCachedOperationSummaryForAccountant = unstable_cache(
  async (userId: string) => {
    const companyFilter = { company: { accountantId: userId } };
    const [total, accepted, rejected, blocked, inProgress] = await Promise.all([
      prisma.operation.count({ where: { ...companyFilter } }),
      prisma.operation.count({
        where: { ...companyFilter, profitTaxStatus: "accepted" },
      }),
      prisma.operation.count({
        where: { ...companyFilter, profitTaxStatus: "rejected" },
      }),
      prisma.operation.count({
        where: { ...companyFilter, profitTaxStatus: "blocked" },
      }),
      prisma.operation.count({
        where: { ...companyFilter, profitTaxStatus: "in_progress" },
      }),
    ]);
    return {
      total,
      accepted,
      rejected,
      blocked,
      inProgress,
      pending: total - accepted - rejected - blocked - inProgress,
    };
  },
  ["operation-summary-accountant"],
  { tags: ["operations"], revalidate: 300 }
);

/** Operatsiya summarini cache'dan olish */
export const getCachedOperationSummary = cache(
  async (userId: string, role: string) => {
    if (isSeniorRole(role)) {
      return _getCachedOperationSummaryForSenior();
    }
    return _getCachedOperationSummaryForAccountant(userId);
  }
);

// ─────────────────────────────────────────────
// UNREAD COUNT
// ─────────────────────────────────────────────

const _getCachedUnreadCount = unstable_cache(
  async (userId: string) => {
    return prisma.notification.count({
      where: { userId, isRead: false },
    });
  },
  ["unread-count"],
  { tags: ["notifications"], revalidate: 60 } // bildirishnomalar tezroq yangilansin
);

/** O'qilmagan bildirishnomalar sonini cache'dan olish */
export const getCachedUnreadCount = cache(async (userId: string) => {
  return _getCachedUnreadCount(userId);
});
