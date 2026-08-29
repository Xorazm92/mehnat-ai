"use server";

// =====================================================
// ACCOUNTING — davr qulfi (period lock) va yil yopilishi
// =====================================================
// Faqat SUPERADMIN davr ochadi/yopadi va yilni yopadi. Har amal auditga tushadi.
// Yil yopilishi: (1) ledger butunligi tekshiriladi, (2) balans hisoblanadi,
// (3) FinancialSnapshot yoziladi, (4) yilning 12 oyi LOCKED qilinadi.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { getYearMovement, getMovementBefore } from "@/lib/balance";
import { getTrialBalance } from "@/lib/ledger";
import { recordAuditLog } from "@/lib/platform/auditTrail";
import { serialize } from "@/lib/serialize";

async function requireSuperAdmin() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const role = session.user.role as string;
  if (role !== "super_admin") throw new Error("Faqat Superadmin davr boshqaruvini o'zgartira oladi");
  return session.user.id as string;
}

function assertYearMonth(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new Error("Yil noto'g'ri");
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("Oy 1-12 oralig'ida bo'lishi kerak");
}

async function setPeriodStatus(year: number, month: number, status: "OPEN" | "LOCKED", userId: string) {
  const existing = await prisma.accountingPeriod.findFirst({
    where: { companyId: null, year, month },
  });

  const row = existing
    ? await prisma.accountingPeriod.update({
        where: { id: existing.id },
        data: {
          status,
          lockedBy: status === "LOCKED" ? userId : null,
          lockedAt: status === "LOCKED" ? new Date() : null,
        },
      })
    : await prisma.accountingPeriod.create({
        data: {
          companyId: null,
          year,
          month,
          status,
          lockedBy: status === "LOCKED" ? userId : null,
          lockedAt: status === "LOCKED" ? new Date() : null,
        },
      });

  await recordAuditLog({
    userId,
    action: "update",
    tableName: "AccountingPeriod",
    recordId: row.id,
    oldData: { status: existing?.status ?? "OPEN" },
    newData: { year, month, status },
  });

  return row;
}

export async function lockPeriod(year: number, month: number) {
  const userId = await requireSuperAdmin();
  assertYearMonth(year, month);
  return serialize(await setPeriodStatus(year, month, "LOCKED", userId));
}

export async function unlockPeriod(year: number, month: number) {
  const userId = await requireSuperAdmin();
  assertYearMonth(year, month);
  return serialize(await setPeriodStatus(year, month, "OPEN", userId));
}

/**
 * Yilni yopish:
 *  1) Ledger butunligi: butun jurnal bo'yicha Σdebit == Σcredit;
 *  2) Ochilish qoldig'i: o'tgan yil snapshot'i, bo'lmasa butun oldingi tarix;
 *  3) Yil harakati (kirim/chiqim) va yopilish qoldig'i;
 *  4) FinancialSnapshot yozish (takror yopish bloklanadi);
 *  5) Yilning 12 oyini LOCKED qilish.
 */
export async function closeYear(year: number) {
  const userId = await requireSuperAdmin();
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new Error("Yil noto'g'ri");

  const periodKey = String(year);

  const existing = await prisma.financialSnapshot.findFirst({
    where: { companyId: null, period: periodKey },
  });
  if (existing) throw new Error(`${year} yili allaqachon yopilgan (snapshot mavjud)`);

  // 1) Ledger butunligi — buzilgan jurnal bilan yil yopilmaydi (yil doirasida).
  const trial = await getTrialBalance(prisma, String(year));
  if (!trial.balanced) {
    throw new Error(
      `Ledger balanslashmagan: debit ${trial.totalDebit} != credit ${trial.totalCredit} — yil yopilmadi`
    );
  }

  // 2-3) Qoldiqlar.
  const prevSnapshot = await prisma.financialSnapshot.findFirst({
    where: { companyId: null, period: String(year - 1) },
  });
  const openingBalance = prevSnapshot
    ? Number(prevSnapshot.closingBalance)
    : await getMovementBefore(year).then((m) => m.income - m.outflow);

  const movement = await getYearMovement(year);
  const closingBalance = openingBalance + movement.income - movement.outflow;

  // 4-5) Snapshot + 12 oyni qulflash.
  const snapshot = await prisma.$transaction(async (tx) => {
    const snap = await tx.financialSnapshot.create({
      data: {
        companyId: null,
        period: periodKey,
        openingBalance: new Prisma.Decimal(openingBalance),
        closingBalance: new Prisma.Decimal(closingBalance),
        income: new Prisma.Decimal(movement.income),
        outflow: new Prisma.Decimal(movement.outflow),
        createdBy: userId,
      },
    });

    for (let month = 1; month <= 12; month++) {
      const existingPeriod = await tx.accountingPeriod.findFirst({
        where: { companyId: null, year, month },
        select: { id: true },
      });
      if (existingPeriod) {
        await tx.accountingPeriod.update({
          where: { id: existingPeriod.id },
          data: { status: "LOCKED", lockedBy: userId, lockedAt: new Date() },
        });
      } else {
        await tx.accountingPeriod.create({
          data: { companyId: null, year, month, status: "LOCKED", lockedBy: userId, lockedAt: new Date() },
        });
      }
    }

    return snap;
  });

  await recordAuditLog({
    userId,
    action: "create",
    tableName: "FinancialSnapshot",
    recordId: snapshot.id,
    newData: {
      period: periodKey,
      openingBalance,
      closingBalance,
      income: movement.income,
      outflow: movement.outflow,
      lockedMonths: 12,
    },
  });

  return serialize(snapshot);
}

/** Keyingi yil uchun ochilish qoldig'i — yopilgan yil snapshot'idan. */
export async function getOpeningBalance(year: number) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const snapshot = await prisma.financialSnapshot.findFirst({
    where: { companyId: null, period: String(year - 1) },
  });
  return snapshot ? Number(snapshot.closingBalance) : null;
}

export async function getAccountingPeriods(year?: number) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  return serialize(
    await prisma.accountingPeriod.findMany({
      where: { companyId: null, ...(year ? { year } : {}) },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    })
  );
}

export async function getFinancialSnapshots() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  return serialize(
    await prisma.financialSnapshot.findMany({
      where: { companyId: null },
      orderBy: { period: "desc" },
    })
  );
}
