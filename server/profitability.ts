"use server";

// =====================================================
// PROFITABILITY — mijoz contribution margin (Faza D)
// =====================================================
// Firma bo'yicha: tushum (paid Payment) − mehnat tannarxi (TimeEntry × sanadagi
// stavka) = margin. Qarzdorlik: chiqarilgan (sent/partial/overdue) Invoice −
// to'langan. Scoped: senior hammani, boshqalar o'z firmalarini.
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";
import { companyScopeWhere, type Actor } from "@/lib/access";
import { resolveRate, computeCost, type RatePeriod } from "@/lib/timeCost";
import { computeMargin } from "@/lib/margin";

async function requireActor(): Promise<Actor> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  return { id: session.user.id, role: session.user.role as string };
}

function periodRange(period: string): { start: Date; endExclusive: Date } {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) throw new Error("Davr formati noto'g'ri (YYYY-MM)");
  return { start: new Date(Date.UTC(y, m - 1, 1)), endExclusive: new Date(Date.UTC(y, m, 1)) };
}

export interface CompanyMargin {
  companyId: string;
  companyName: string;
  revenue: number;
  laborCost: number;
  margin: number;
  marginPct: number | null;
  debt: number;
}

export async function getMarginOverview(period: string): Promise<CompanyMargin[]> {
  const actor = await requireActor();
  const { start, endExclusive } = periodRange(period);

  const companies = await prisma.company.findMany({
    where: { isActive: true, ...companyScopeWhere(actor) },
    select: { id: true, name: true },
  });
  if (companies.length === 0) return [];
  const companyIds = companies.map((c) => c.id);

  // Tushum — paid Payment (soft-delete emas).
  const payments = await prisma.payment.findMany({
    where: { companyId: { in: companyIds }, period, status: "paid", deletedAt: null },
    select: { companyId: true, amount: true },
  });
  const revenueBy = new Map<string, number>();
  for (const p of payments) revenueBy.set(p.companyId, (revenueBy.get(p.companyId) ?? 0) + Number(p.amount));

  // Mehnat tannarxi — TimeEntry × sanadagi stavka.
  const entries = await prisma.timeEntry.findMany({
    where: { companyId: { in: companyIds }, date: { gte: start, lt: endExclusive } },
    select: { companyId: true, userId: true, date: true, minutes: true },
  });
  const userIds = [...new Set(entries.map((e) => e.userId))];
  const ratesRows = userIds.length
    ? await prisma.employeeCostRate.findMany({ where: { userId: { in: userIds } }, select: { userId: true, hourlyRate: true, effectiveFrom: true, effectiveTo: true } })
    : [];
  const ratesBy = new Map<string, RatePeriod[]>();
  for (const r of ratesRows) {
    const arr = ratesBy.get(r.userId) ?? [];
    arr.push({ hourlyRate: Number(r.hourlyRate), effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo });
    ratesBy.set(r.userId, arr);
  }
  const laborBy = new Map<string, number>();
  for (const e of entries) {
    const cost = computeCost(e.minutes, resolveRate(ratesBy.get(e.userId) ?? [], e.date));
    if (e.companyId) laborBy.set(e.companyId, (laborBy.get(e.companyId) ?? 0) + cost);
  }

  // Qarzdorlik — chiqarilgan Invoice − to'langan.
  const invoices = await prisma.invoice.findMany({
    where: { companyId: { in: companyIds }, period, status: { in: ["sent", "partial", "overdue"] }, deletedAt: null },
    select: { companyId: true, amount: true, paidAmount: true },
  });
  const debtBy = new Map<string, number>();
  for (const inv of invoices) debtBy.set(inv.companyId, (debtBy.get(inv.companyId) ?? 0) + (Number(inv.amount) - Number(inv.paidAmount)));

  return companies
    .map((c) => {
      const m = computeMargin({ revenue: revenueBy.get(c.id) ?? 0, laborCost: laborBy.get(c.id) ?? 0 });
      return { companyId: c.id, companyName: c.name, revenue: m.revenue, laborCost: m.laborCost, margin: m.margin, marginPct: m.marginPct, debt: debtBy.get(c.id) ?? 0 };
    })
    .sort((a, b) => a.margin - b.margin); // eng zararli birinchi
}
