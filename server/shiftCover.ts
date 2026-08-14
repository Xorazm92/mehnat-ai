"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";
import { staffScopeFilter } from "@/lib/access";
import { serialize } from "@/lib/serialize";
import { toYearMonthKey } from "@/lib/periods";
import { assertPeriodOpen } from "@/lib/periodLock";
import { computeCoverTransfers } from "@/lib/shiftCover";
import { updateTag } from "next/cache";

/** `UserRole` → yo'qlik qoidasi nomi (lib/kpiEvidence bilan bir xil xarita). */
const ABSENCE_RULE_BY_USER_ROLE: Record<string, string> = {
  accountant: "acc_absence",
  bank_manager: "bank_absence",
  supervisor: "sup_absence",
};

/**
 * Creates or updates a ShiftCover record assigning a replacement employee (coverUserId)
 * for an absent employee (absentUserId) on a given date.
 */
export async function assignShiftCover(input: {
  date: string; // "YYYY-MM-DD"
  absentUserId: string;
  coverUserId: string;
  companyId?: string;
  kind?: "absence" | "vacation";
  note?: string;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id as string;
  const role = session.user.role as string;

  if (!isSeniorRole(role)) throw new Error("Forbidden");

  if (input.absentUserId === input.coverUserId) {
    throw new Error("Xodim o'z o'rniga o'zi turolmaydi");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error("Sana formati YYYY-MM-DD bo'lishi kerak");
  }
  // Attendance ham UTC yarim tunida saqlanadi — ikkalasi bir kunni bir xil
  // ko'rsatishi uchun shu yerda ham yarim tunga qotiramiz.
  const coverDate = new Date(`${input.date}T00:00:00.000Z`);
  const companyId = input.companyId ?? null;

  // ShiftCover ustunlarida User'ga FK yo'q, PayrollAdjustment.employeeId da esa
  // BOR. Mavjud bo'lmagan xodim yozib qo'yilsa, xato faqat oy oxirida
  // applyCoverTransfers ichida chiqadi va BUTUN o'tkazma to'plami yiqiladi.
  // Shuning uchun kiritish paytida tekshiramiz.
  const users = await prisma.user.findMany({
    where: { id: { in: [input.absentUserId, input.coverUserId] }, isActive: true },
    select: { id: true },
  });
  if (users.length !== 2) {
    throw new Error("Xodim topilmadi yoki faol emas");
  }

  // XODIM SCOPE. `isSeniorRole` yetarli emas: nazoratchi va bosh buxgalter
  // o'z portfeliga cheklangan. Almashinuv keyinchalik `applyCoverTransfers`
  // orqali OYLIK O'TKAZMASIGA aylanadi, ya'ni bu pulga tegadi — portfeldan
  // tashqaridagi xodimlar o'rtasida almashinuv yozib bo'lmasligi kerak.
  await Promise.all([
    staffScopeFilter(prisma, { id: userId, role }, input.absentUserId),
    staffScopeFilter(prisma, { id: userId, role }, input.coverUserId),
  ]);

  // Prisma QISMIY unique indekslarni (companyId IS NULL / IS NOT NULL) compound
  // unique sifatida ifodalay olmaydi, shuning uchun upsert emas — topib-yozamiz.
  // Yagonalikni baza kafolatlaydi; bu yerda faqat qulay "almashtirish" mantiqi.
  const existing = await prisma.shiftCover.findFirst({
    where: { date: coverDate, absentUserId: input.absentUserId, companyId },
    select: { id: true },
  });

  const cover = existing
    ? await prisma.shiftCover.update({
        where: { id: existing.id },
        data: {
          coverUserId: input.coverUserId,
          kind: input.kind ?? "absence",
          approvedById: userId,
          note: input.note ?? null,
        },
      })
    : await prisma.shiftCover.create({
        data: {
          date: coverDate,
          absentUserId: input.absentUserId,
          coverUserId: input.coverUserId,
          companyId,
          kind: input.kind ?? "absence",
          approvedById: userId,
          note: input.note ?? null,
        },
      });

  updateTag("operations");
  return { ok: true, cover: serialize(cover) };
}

/**
 * Lists ShiftCover records for a given date range.
 */
export async function getShiftCovers(startDate: string, endDate: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  // Kim qaysi kuni ishga kelmagani — HR ma'lumoti va pul o'tkazmasining asosi.
  // Avval har qanday tizimga kirgan xodim butun tashkilotning yo'qliklarini
  // o'qiy olardi.
  if (!isSeniorRole(session.user.role as string)) throw new Error("Forbidden");

  const covers = await prisma.shiftCover.findMany({
    where: {
      date: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
    },
    orderBy: { date: "asc" },
  });

  return serialize(covers);
}

/**
 * Oy uchun yo'qlik/ta'til pulini o'rinbosarlarga o'tkazadi.
 *
 * Reglament: yechilgan pul yo'qolmaydi — o'sha kuni ishni bajargan xodimga
 * o'tadi. Bu yerda `bonus` turidagi PayrollAdjustment yaratiladi (pul berishning
 * mavjud yo'li); `companyId` bilan, ya'ni qaysi firma uchun ekani auditlanadi.
 *
 * IDEMPOTENT: har o'tkazma uchun barqaror `reason` kaliti yoziladi va mavjud
 * qator yangilanadi — ikki marta ishga tushirilsa pul ikkilanmaydi.
 * Oylik tasdiqlangan (period yopiq) bo'lsa assertPeriodOpen to'xtatadi.
 */
export async function applyCoverTransfers(month: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const role = session.user.role as string;
  if (!isSeniorRole(role)) throw new Error("Forbidden");

  const ym = toYearMonthKey(month);
  if (!ym) throw new Error("Oy formati noto'g'ri (YYYY-MM kutiladi)");
  await assertPeriodOpen(prisma, ym, "yo'qlik puli o'tkazmasi");

  const [year, mon] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));

  const covers = await prisma.shiftCover.findMany({
    where: { date: { gte: start, lt: end } },
  });
  if (covers.length === 0) return { transfers: 0, total: 0 };

  const absentIds = [...new Set(covers.map((c) => c.absentUserId))];
  const [absentees, companies, rules] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: absentIds } }, select: { id: true, role: true } }),
    prisma.company.findMany({
      where: { isActive: true },
      select: { id: true, contractAmount: true, accountantId: true, bankClientId: true, supervisorId: true },
    }),
    prisma.kpiRule.findMany({
      where: { name: { in: ["acc_absence", "bank_absence", "sup_absence"] } },
      select: { name: true, options: true },
    }),
  ]);

  const roleById = new Map(absentees.map((u) => [u.id, u.role as string]));
  const ruleByName = new Map(rules.map((r) => [r.name, r]));

  /** Kunlik jarima foizi qoidaning O'ZIDAN olinadi — kodda takrorlanmaydi. */
  const dailyPercentFor = (userRole: string): number => {
    const ruleName = ABSENCE_RULE_BY_USER_ROLE[userRole];
    const rule = ruleName ? ruleByName.get(ruleName) : undefined;
    const opts = Array.isArray(rule?.options) ? (rule!.options as { key?: string; coeff_per_unit?: number }[]) : [];
    const opt = opts.find((o) => o.key === "absent_days");
    return Math.abs(Number(opt?.coeff_per_unit ?? 0));
  };

  let created = 0;
  let total = 0;

  for (const absentId of absentIds) {
    const userRole = roleById.get(absentId);
    if (!userRole) continue;

    const mine = companies
      .filter((c) => c.accountantId === absentId || c.bankClientId === absentId || c.supervisorId === absentId)
      .map((c) => ({ companyId: c.id, contractAmount: Number(c.contractAmount ?? 0) }));

    const transfers = computeCoverTransfers(
      covers.filter((c) => c.absentUserId === absentId),
      mine,
      dailyPercentFor(userRole)
    );

    for (const t of transfers) {
      // Barqaror kalit — qayta ishga tushirishda ayni qator topiladi.
      const reason = `O'rinbosarlik [${ym}|${t.absentUserId}|${t.companyId}|${t.kind}]: ${t.days} kun`;
      const existing = await prisma.payrollAdjustment.findFirst({
        where: { month: ym, employeeId: t.coverUserId, adjustmentType: "bonus", reason, deletedAt: null },
        select: { id: true },
      });

      if (existing) {
        await prisma.payrollAdjustment.update({
          where: { id: existing.id },
          data: { amount: t.amount, companyId: t.companyId },
        });
      } else {
        await prisma.payrollAdjustment.create({
          data: {
            month: ym,
            employeeId: t.coverUserId,
            companyId: t.companyId,
            adjustmentType: "bonus",
            amount: t.amount,
            reason,
            createdBy: session.user.id as string,
          },
        });
        created++;
      }
      total += t.amount;
    }
  }

  updateTag("operations");
  return { transfers: created, total };
}
