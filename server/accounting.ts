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

/**
 * Davrni OCHADI (faqat `unlockPeriod` uchun).
 *
 * QULFLASH ataylab yo'q: `AccountingPeriod` holat mashinasini
 * `server/monthClosing.ts` boshqaradi va u oyni checklist ortida yopadi
 * (`lib/periodLock.ts` sarlavhasiga qarang). Bu yerdan qulflash o'sha
 * checklist'ni chetlab o'tardi. `closeYear` ham buni chaqirmaydi — u 12 oyni
 * o'z tranzaksiyasi ichida yozadi. Qarang: ADR-0011.
 */
async function setPeriodOpen(year: number, month: number, userId: string, reason: string) {
  const status = "OPEN" as const;
  const existing = await prisma.accountingPeriod.findFirst({
    where: { companyId: null, year, month },
  });

  const data = {
    status,
    lockedBy: null,
    lockedAt: null,
    reopenedBy: userId,
    reopenedAt: new Date(),
    reopenReason: reason,
  };

  const row = existing
    ? await prisma.accountingPeriod.update({ where: { id: existing.id }, data })
    : await prisma.accountingPeriod.create({ data: { companyId: null, year, month, ...data } });

  await recordAuditLog({
    userId,
    action: "update",
    tableName: "AccountingPeriod",
    recordId: row.id,
    oldData: { status: existing?.status ?? "OPEN" },
    newData: { year, month, status, reason },
  });

  return row;
}

/**
 * Yopilgan oyni tuzatish uchun ochish.
 *
 * SABAB MAJBURIY — `reopenMonth` bilan bir xil intizom. Yopilgan davrni jimgina
 * ochish moliyaviy yozuvlarni o'zgartirish imkonini beradi va keyin nima uchun
 * ochilgani hech qayerda qolmaydi; audit yozuvi sababsiz "kim" ga javob beradi,
 * "nega" ga emas.
 *
 * Bu asosan YOPILGAN YIL ichidagi oyni tuzatish uchun (test/year-closing.test.ts
 * shu holatni qamraydi). Oddiy oy uchun `reopenMonth` ishlatilsin — u to'liq
 * holat mashinasidan o'tadi.
 */
export async function unlockPeriod(year: number, month: number, reason: string) {
  const userId = await requireSuperAdmin();
  assertYearMonth(year, month);
  const why = reason?.trim();
  if (!why) throw new Error("Ochish sababi majburiy");
  return serialize(await setPeriodOpen(year, month, userId, why));
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
    : await getMovementBefore(year).then((m) => m.income - m.outflow + m.loanCashMovement);

  const movement = await getYearMovement(year);
  // Moliyaviy yordam (qarz) `closingBalance` ga kiradi, `income`/`outflow`
  // (P&L) ga EMAS — lib/balance.ts loanCashMovement izohiga qarang. Snapshot
  // IMMUTABLE bo'lgani uchun bu yerda noto'g'ri qoldiq abadiy muhrlanardi.
  const closingBalance = openingBalance + movement.income - movement.outflow + movement.loanCashMovement;

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

/**
 * Yil yopilishi paneli uchun holat.
 *
 * `closeYear` uchta shartni talab qiladi va ular UI'da OLDINDAN ko'rinishi
 * kerak — aks holda tugma bosiladi va xato matni bilan qaytadi:
 *   1) yil hali yopilmagan (snapshot yo'q),
 *   2) 12 oyning hammasi LOCKED,
 *   3) jurnal butun (Σdebit == Σcredit) — buni `closeYear` o'zi tekshiradi.
 */
export async function getYearClosingState(year: number) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const [snapshot, periods, openingBalance] = await Promise.all([
    prisma.financialSnapshot.findFirst({ where: { companyId: null, period: String(year) } }),
    prisma.accountingPeriod.findMany({
      where: { companyId: null, year },
      select: { month: true, status: true },
    }),
    getOpeningBalance(year),
  ]);

  const byMonth = new Map(periods.map((p) => [p.month, p.status]));
  const openMonths = Array.from({ length: 12 }, (_, i) => i + 1).filter(
    (m) => (byMonth.get(m) ?? "OPEN") !== "LOCKED",
  );

  return serialize({
    year,
    openingBalance,
    openMonths,
    closed: Boolean(snapshot),
    snapshot: snapshot
      ? {
          id: snapshot.id,
          openingBalance: Number(snapshot.openingBalance),
          closingBalance: Number(snapshot.closingBalance),
          income: Number(snapshot.income),
          outflow: Number(snapshot.outflow),
          createdAt: snapshot.createdAt,
        }
      : null,
  });
}
