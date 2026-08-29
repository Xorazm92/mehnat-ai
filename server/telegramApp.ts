"use server";

// =====================================================
// TELEGRAM MINI APP — server actions (Faza 4)
// =====================================================
// Mini App oddiy RSC sahifalar to'plami: sessiya `initData` orqali NextAuth
// "telegram" provider'ida yaratiladi, shundan keyin `auth()`, server action'lar
// va proxy RBAC — hammasi odatdagidek ishlaydi. Shuning uchun bu yerda YANGI
// avtorizatsiya qatlami yo'q, faqat ikkita ekran uchun ma'lumot.
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { companyScopeWhere, type Actor } from "@/lib/access";
import { scopeCompanyIds } from "@/lib/engines/automation/dailyDigest";
import { OPEN_OBLIGATION_STATUSES } from "@/lib/engines/workflow/obligationWorkflow";
import { isSeniorRole } from "@/lib/permissions";

async function requireActor(): Promise<Actor> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  return { id: session.user.id as string, role: session.user.role as string };
}

const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export interface MiniAppDashboard {
  role: string;
  isSenior: boolean;
  openObligations: number;
  overdue: number;
  dueToday: number;
  myOpen: number;
  openQuestions: number;
  pendingKpi: number;
  unpaidCompanies: number;
  /** Eng ko'p kechiktirganlar (faqat senior uchun to'ldiriladi). */
  behind: Array<{ name: string; count: number }>;
}

/** Direktor ekrani: doiradagi barcha raqamlar bitta so'rov to'plamida. */
export async function getMiniAppDashboard(): Promise<MiniAppDashboard> {
  const actor = await requireActor();
  const now = new Date();
  const today = startOfUtcDay(now);
  const tomorrow = new Date(today.getTime() + 86_400_000);

  const companyScope = { company: companyScopeWhere(actor) };
  const openWhere = { ...companyScope, status: { in: OPEN_OBLIGATION_STATUSES } };
  const senior = isSeniorRole(actor.role);

  const companyIds = await scopeCompanyIds(prisma, actor);
  const idFilter = companyIds === null ? {} : { companyId: { in: companyIds } };
  const emptyScope = companyIds !== null && companyIds.length === 0;

  const [openObligations, overdue, dueToday, myOpen, openQuestions] = await Promise.all([
    prisma.obligation.count({ where: openWhere }),
    prisma.obligation.count({ where: { ...openWhere, dueAt: { lt: today } } }),
    prisma.obligation.count({ where: { ...openWhere, dueAt: { gte: today, lt: tomorrow } } }),
    prisma.obligation.count({ where: { ...openWhere, responsibleUserId: actor.id } }),
    emptyScope
      ? Promise.resolve(0)
      : prisma.question.count({ where: { status: "pending", ...idFilter } }),
  ]);

  let pendingKpi = 0;
  let unpaidCompanies = 0;
  let behind: MiniAppDashboard["behind"] = [];

  if (senior && !emptyScope) {
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const [kpi, unpaid, grouped] = await Promise.all([
      prisma.monthlyPerformance.count({ where: { status: "submitted", ...idFilter } }),
      prisma.company.count({
        where: {
          ...(companyIds === null ? {} : { id: { in: companyIds } }),
          isActive: true,
          contractAmount: { not: null },
          payments: { none: { period, status: { in: ["paid", "partial"] } } },
        },
      }),
      // Xotirada emas, DB darajasida guruhlash: nazoratchi portfelida minglab
      // majburiyat bo'lishi mumkin.
      prisma.obligation.groupBy({
        by: ["responsibleUserId"],
        where: { ...openWhere, dueAt: { lt: today } },
        _count: { _all: true },
        orderBy: { _count: { responsibleUserId: "desc" } },
        take: 5,
      }),
    ]);
    pendingKpi = kpi;
    unpaidCompanies = unpaid;

    const ids = grouped.map((g) => g.responsibleUserId).filter((id): id is string => !!id);
    const names = new Map(
      (
        await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })
      ).map((u) => [u.id, u.fullName]),
    );
    behind = grouped.map((g) => ({
      name: g.responsibleUserId ? (names.get(g.responsibleUserId) ?? "—") : "biriktirilmagan",
      count: g._count._all,
    }));
  }

  return {
    role: actor.role,
    isSenior: senior,
    openObligations,
    overdue,
    dueToday,
    myOpen,
    openQuestions,
    pendingKpi,
    unpaidCompanies,
    behind,
  };
}

export interface ProofTargets {
  companies: Array<{ id: string; name: string }>;
  /** Joriy davr, "YYYY-MM". */
  period: string;
}

/**
 * Dalil yuklash ekrani uchun tanlovlar. Faqat foydalanuvchi ko'ra oladigan
 * korxonalar — `saveReportProof` baribir qayta tekshiradi, bu ro'yxat esa
 * boshqa firmani tanlash imkonini bermaydi.
 */
export async function getProofTargets(): Promise<ProofTargets> {
  const actor = await requireActor();
  const now = new Date();
  const companies = await prisma.company.findMany({
    where: { ...companyScopeWhere(actor), isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return {
    companies,
    period: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
  };
}
