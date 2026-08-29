"use server";

// =====================================================
// MONTH-END CLOSING ENGINE (SAP/1C uslubidagi oy yopilishi)
// =====================================================
// Oqim:  OPEN → READY_TO_CLOSE → CLOSING → LOCKED → (REOPENED → ... → CLOSING → LOCKED)
//                                    ↘ FAILED (checklist/xato) → tuzatish → qayta
//
// closeMonth 12 qadami:
//   1 davr OPEN-oilasida ekanini tekshirish (LOCKED → xato; CLOSING → recovery)
//   2 ledger debit==credit (davr)          } checklist — bittasi qizil bo'lsa
//   3 pending hujjatlar yo'qligi           } FAILED + xatolar ro'yxati
//   4 opening balance (o'tgan oy snapshot'i)
//   5 income   6 expense   7 net profit   8 closing = opening + income − expense
//   9 IMMUTABLE snapshot (checksum bilan; DB trigger update'ni taqiqlaydi)
//  10 davr LOCKED
//  11 keyingi oy yo'q bo'lsa OPEN yaratiladi, openingBalance = closing
//  12 audit (kim/qachon/qaysi oy/raqamlar)
//
// Xavfsizlik: yopish va qayta ochish faqat SUPER_ADMIN (tizimda FINANCE_DIRECTOR
// roli yo'q — kiritilsa, requireCloser ro'yxatiga qo'shiladi).
// Concurrency: atomik status-claim (updateMany WRITABLE→CLOSING) + Serializable
// tranzaksiya + global partial-unique snapshot indeksi — parallel ikki Close'dan
// faqat bittasi o'tadi. CLOSING holatidayoq davr yozuvga yopiladi (periodLock),
// shuning uchun checklist va yozuv orasida "sirpanib kirish" yo'q.
// Power-failure: CLOSING'da qolib ketgan davr — snapshot bor bo'lsa LOCKED'ga
// yakunlanadi (idempotent), bo'lmasa 10 daqiqadan keyin FAILED deb tiklanadi.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/platform/permissions";
import { PERIOD_STATUS, WRITABLE_STATUSES } from "@/lib/periodLock";
import {
  monthKey,
  nextOf,
  ensureGlobalPeriod,
  gatherChecklist,
  autoManageReadiness,
  computeCloseFigures,
  getMonthPayrollTotal,
  type ChecklistResult,
} from "@/lib/monthClose";
import { getTrialBalance } from "@/lib/ledger";
import { computeSnapshotChecksum, verifySnapshotChecksum } from "@/lib/snapshot";
import { recordAuditLog } from "@/lib/platform/auditTrail";
import { serialize } from "@/lib/serialize";

const STALE_CLOSING_MS = 10 * 60_000;

async function requireCloser() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const role = session.user.role as string;
  if (role !== "super_admin") {
    throw new Error("Oy yopish/ochish faqat Superadmin uchun");
  }
  return session.user.id as string;
}

async function requireSenior() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isSeniorRole(session.user.role as string)) throw new Error("Forbidden");
  return session.user.id as string;
}

function assertYearMonth(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new Error("Yil noto'g'ri");
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("Oy 1-12 oralig'ida bo'lishi kerak");
}

/**
 * Checklist'ni yurgizadi va statusni avtomatik boshqaradi
 * (OPEN↔READY_TO_CLOSE). Senior rollar chaqiradi (Admin UI "Tekshirish").
 */
export async function validateMonth(year: number, month: number) {
  await requireSenior();
  assertYearMonth(year, month);
  const result = await autoManageReadiness(prisma, year, month);
  return serialize(result);
}

export async function closeMonth(input: { year: number; month: number; companyId?: string | null }) {
  const userId = await requireCloser();
  const { year, month } = input;
  assertYearMonth(year, month);
  if (input.companyId) {
    // Moliya butun firma darajasida yuritiladi (kassa/xarajat/oylik kompaniyaga
    // bo'linmaydi) — per-company yopilish hozircha ma'nosiz va qo'llanmaydi.
    throw new Error("Per-company yopilish qo'llab-quvvatlanmaydi — global (companyId'siz) yoping");
  }
  const key = monthKey(year, month);

  // STEP 1 — davr holati
  const period = await ensureGlobalPeriod(prisma, year, month);

  if (period.status === PERIOD_STATUS.LOCKED) {
    throw new Error(`${key} davri allaqachon yopilgan (LOCKED)`);
  }

  if (period.status === PERIOD_STATUS.CLOSING) {
    // Power-failure recovery: snapshot yozilib bo'lgan bo'lsa — yakunlash kifoya.
    const existingSnapshot = await prisma.financialSnapshot.findFirst({
      where: { companyId: null, period: key },
    });
    if (existingSnapshot) {
      await prisma.accountingPeriod.update({
        where: { id: period.id },
        data: {
          status: PERIOD_STATUS.LOCKED,
          closedBy: existingSnapshot.createdBy ?? userId,
          closedAt: existingSnapshot.createdAt,
          lockedBy: existingSnapshot.createdBy ?? userId,
          lockedAt: existingSnapshot.createdAt,
          statusNote: "recovery: snapshot mavjud edi — LOCKED'ga yakunlandi",
        },
      });
      await recordAuditLog({
        userId,
        action: "update",
        tableName: "AccountingPeriod",
        recordId: period.id,
        newData: { period: key, status: "LOCKED", recovery: true },
      });
      return serialize(existingSnapshot);
    }
    // Snapshot yo'q: eski (o'lik) CLOSING bo'lsa FAILED'ga tiklab davom etamiz.
    const stale = Date.now() - period.updatedAt.getTime() > STALE_CLOSING_MS;
    if (!stale) throw new Error(`${key} davri hozir yopilmoqda (CLOSING) — parallel jarayon tugashini kuting`);
    await prisma.accountingPeriod.updateMany({
      where: { id: period.id, status: PERIOD_STATUS.CLOSING },
      data: { status: PERIOD_STATUS.FAILED, statusNote: "recovery: chala qolgan CLOSING tiklandi" },
    });
  }

  // Atomik claim: WRITABLE → CLOSING. Parallel ikkinchi chaqiriq 0 qator oladi.
  // CLOSING'dan boshlab davr yozuvga yopiq (lib/periodLock) — checklist va
  // yopilish orasida yangi hujjat kira olmaydi.
  const claimed = await prisma.accountingPeriod.updateMany({
    where: { id: period.id, status: { in: WRITABLE_STATUSES } },
    data: { status: PERIOD_STATUS.CLOSING, statusNote: null },
  });
  if (claimed.count === 0) {
    throw new Error(`${key} davri hozir yopilmoqda (CLOSING) — parallel jarayon tugashini kuting`);
  }

  let checklist: ChecklistResult;
  try {
    // STEP 2-3 — checklist (ledger balanslanganligi + pending hujjatlar + integritet)
    checklist = await gatherChecklist(prisma, year, month);
    if (!checklist.ready) {
      await prisma.accountingPeriod.update({
        where: { id: period.id },
        data: {
          status: PERIOD_STATUS.FAILED,
          statusNote: checklist.blockingErrors.join(" | ").slice(0, 500),
        },
      });
      await recordAuditLog({
        userId,
        action: "update",
        tableName: "AccountingPeriod",
        recordId: period.id,
        newData: { period: key, status: "FAILED", errors: checklist.blockingErrors },
      });
      throw new Error(`${key} oyini yopib bo'lmaydi:\n— ${checklist.blockingErrors.join("\n— ")}`);
    }

    // STEP 4-11 — bitta Serializable tranzaksiyada
    const snapshot = await prisma.$transaction(
      async (tx) => {
        // Ledger balansini tranzaksiya ichida qayta tasdiqlaymiz (STEP 2 qat'iy).
        const trial = await getTrialBalance(tx, key);
        if (!trial.balanced) {
          throw new Error(`Ledger balanslashmagan: debit ${trial.totalDebit} != credit ${trial.totalCredit}`);
        }

        const figures = await computeCloseFigures(tx, year, month);
        figures.payrollTotal = await getMonthPayrollTotal(tx, year, month);

        const checksum = computeSnapshotChecksum({
          period: key,
          companyId: null,
          openingBalance: figures.openingBalance,
          closingBalance: figures.closingBalance,
          income: figures.income,
          outflow: figures.outflow,
          payrollTotal: figures.payrollTotal,
          cashIn: figures.cashIn,
          cashOut: figures.cashOut,
          ledgerBalance: figures.ledgerBalance,
          profit: figures.profit,
          loss: figures.loss,
          employeeCount: figures.employeeCount,
          companyCount: figures.companyCount,
        });

        // STEP 9 — immutable snapshot (dublikatni partial-unique indeks ham to'sadi)
        const snap = await tx.financialSnapshot.create({
          data: {
            companyId: null,
            period: key,
            openingBalance: new Prisma.Decimal(figures.openingBalance),
            closingBalance: new Prisma.Decimal(figures.closingBalance),
            income: new Prisma.Decimal(figures.income),
            outflow: new Prisma.Decimal(figures.outflow),
            payrollTotal: new Prisma.Decimal(figures.payrollTotal),
            cashIn: new Prisma.Decimal(figures.cashIn),
            cashOut: new Prisma.Decimal(figures.cashOut),
            ledgerBalance: new Prisma.Decimal(figures.ledgerBalance),
            profit: new Prisma.Decimal(figures.profit),
            loss: new Prisma.Decimal(figures.loss),
            employeeCount: figures.employeeCount,
            companyCount: figures.companyCount,
            checksum,
            createdBy: userId,
          },
        });

        // STEP 10 — LOCKED
        await tx.accountingPeriod.update({
          where: { id: period.id },
          data: {
            status: PERIOD_STATUS.LOCKED,
            openingBalance: new Prisma.Decimal(figures.openingBalance),
            closedBy: userId,
            closedAt: new Date(),
            lockedBy: userId,
            lockedAt: new Date(),
            statusNote: null,
          },
        });

        // STEP 11 — keyingi oy: yo'q bo'lsa OPEN yaratiladi; openingBalance
        // har doim shu yopilishning closing'idan yangilanadi (avtoritativ manba).
        const next = nextOf(year, month);
        const nextPeriod = await tx.accountingPeriod.findFirst({
          where: { companyId: null, year: next.year, month: next.month },
          select: { id: true },
        });
        if (nextPeriod) {
          await tx.accountingPeriod.update({
            where: { id: nextPeriod.id },
            data: { openingBalance: new Prisma.Decimal(figures.closingBalance) },
          });
        } else {
          await tx.accountingPeriod.create({
            data: {
              companyId: null,
              year: next.year,
              month: next.month,
              status: PERIOD_STATUS.OPEN,
              openingBalance: new Prisma.Decimal(figures.closingBalance),
            },
          });
        }

        return snap;
      },
      { isolationLevel: "Serializable" }
    );

    // STEP 12 — audit (kim, qachon, qaysi oy, raqamlar)
    await recordAuditLog({
      userId,
      action: "create",
      tableName: "FinancialSnapshot",
      recordId: snapshot.id,
      newData: {
        event: "month_closed",
        period: key,
        openingBalance: Number(snapshot.openingBalance),
        income: Number(snapshot.income),
        expense: Number(snapshot.outflow),
        closingBalance: Number(snapshot.closingBalance),
        profit: Number(snapshot.profit),
        loss: Number(snapshot.loss),
        checksum: snapshot.checksum,
      },
    });

    return serialize(snapshot);
  } catch (e) {
    // Har qanday yiqilishda davr CLOSING'da qolib ketmasin — FAILED (yozish ochiq).
    await prisma.accountingPeriod
      .updateMany({
        where: { id: period.id, status: PERIOD_STATUS.CLOSING },
        data: {
          status: PERIOD_STATUS.FAILED,
          statusNote: (e as Error).message.slice(0, 500),
        },
      })
      .catch(() => {});
    throw e;
  }
}

/**
 * Yopilgan oyni qayta ochish. Faqat SUPER_ADMIN, sabab MAJBURIY.
 * Shu oydan keyingi (va shu oyni qamragan yillik) barcha snapshotlar
 * INVALID qilinadi — raqamlari o'zgarmaydi (immutable), faqat ishonch belgisi
 * olib tashlanadi; qayta yopish yangi snapshot yaratadi.
 */
export async function reopenMonth(year: number, month: number, reason: string) {
  const userId = await requireCloser();
  assertYearMonth(year, month);
  if (!reason?.trim()) throw new Error("Qayta ochish sababi kiritilishi shart");
  const key = monthKey(year, month);

  const period = await prisma.accountingPeriod.findFirst({
    where: { companyId: null, year, month },
  });
  if (!period || period.status !== PERIOD_STATUS.LOCKED) {
    throw new Error(`${key} davri LOCKED emas — qayta ochishga hojat yo'q`);
  }

  const now = new Date();
  const invalidReason = `reopen ${key}: ${reason.trim()}`.slice(0, 500);

  const invalidated = await prisma.$transaction(async (tx) => {
    await tx.accountingPeriod.update({
      where: { id: period.id },
      data: {
        status: PERIOD_STATUS.REOPENED,
        reopenedBy: userId,
        reopenedAt: now,
        reopenReason: reason.trim(),
        statusNote: null,
      },
    });

    // Kaskad invalidatsiya: shu oy va undan keyingi oylik snapshotlar + shu
    // yildan boshlab yillik snapshotlar (ular endi eskirgan zanjirga tayanadi).
    const targets = await tx.financialSnapshot.findMany({
      where: { companyId: null, isValid: true },
      select: { id: true, period: true },
    });
    const toInvalidate = targets.filter((s) =>
      s.period.length === 7 ? s.period >= key : s.period >= String(year)
    );
    for (const s of toInvalidate) {
      await tx.financialSnapshot.update({
        where: { id: s.id },
        data: { isValid: false, invalidatedAt: now, invalidatedBy: userId, invalidReason },
      });
    }
    return toInvalidate.map((s) => s.period);
  });

  await recordAuditLog({
    userId,
    action: "update",
    tableName: "AccountingPeriod",
    recordId: period.id,
    oldData: { status: "LOCKED" },
    newData: {
      event: "month_reopened",
      period: key,
      reason: reason.trim(),
      invalidatedSnapshots: invalidated,
    },
  });

  return serialize({ period: key, status: PERIOD_STATUS.REOPENED, invalidatedSnapshots: invalidated });
}

/** Admin UI jadvali: yilning 12 oyi — status, raqamlar, snapshot holati. */
export async function getMonthClosingBoard(year: number) {
  await requireSenior();
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new Error("Yil noto'g'ri");

  const [periods, snapshots] = await Promise.all([
    prisma.accountingPeriod.findMany({ where: { companyId: null, year } }),
    prisma.financialSnapshot.findMany({
      where: { companyId: null, period: { startsWith: `${year}-` } },
    }),
  ]);
  const periodByMonth = new Map(periods.map((p) => [p.month, p]));
  // Valid snapshot invalid'dan ustun: invalid'lar avval kiritiladi, valid oxirida
  // yozib yuboradi (Map semantikasi).
  const snapByPeriod = new Map(
    [...snapshots].sort((a, b) => Number(a.isValid) - Number(b.isValid)).map((s) => [s.period, s])
  );

  const months = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const key = monthKey(year, month);
    const p = periodByMonth.get(month);
    const s = snapByPeriod.get(key);
    return {
      year,
      month,
      period: key,
      status: p?.status ?? PERIOD_STATUS.OPEN,
      statusNote: p?.statusNote ?? null,
      openingBalance: p?.openingBalance != null ? Number(p.openingBalance) : null,
      closedBy: p?.closedBy ?? null,
      closedAt: p?.closedAt ?? null,
      reopenReason: p?.reopenReason ?? null,
      snapshot: s
        ? {
            id: s.id,
            isValid: s.isValid,
            openingBalance: Number(s.openingBalance),
            closingBalance: Number(s.closingBalance),
            income: Number(s.income),
            outflow: Number(s.outflow),
            profit: Number(s.profit),
            loss: Number(s.loss),
            checksumOk: verifySnapshotChecksum(
              {
                period: s.period,
                companyId: s.companyId,
                openingBalance: Number(s.openingBalance),
                closingBalance: Number(s.closingBalance),
                income: Number(s.income),
                outflow: Number(s.outflow),
                payrollTotal: Number(s.payrollTotal),
                cashIn: Number(s.cashIn),
                cashOut: Number(s.cashOut),
                ledgerBalance: Number(s.ledgerBalance),
                profit: Number(s.profit),
                loss: Number(s.loss),
                employeeCount: s.employeeCount,
                companyCount: s.companyCount,
              },
              s.checksum
            ),
          }
        : null,
    };
  });

  return serialize({ year, months });
}

/**
 * Oy xulosasi (Report API ham shu funksiyani ishlatadi).
 * Yopilgan oy — snapshot'dan (immutable haqiqat); ochiq oy — jonli hisob.
 */
export async function getMonthSummaryData(year: number, month: number) {
  await requireSenior();
  assertYearMonth(year, month);
  const key = monthKey(year, month);

  // Reopen'dan keyin bir davr uchun invalid+valid snapshot juftligi bo'lishi
  // mumkin — hisobot doim eng ishonchlisini (valid, bo'lmasa eng yangisini) oladi.
  const [snapshot, periodRow, trial] = await Promise.all([
    prisma.financialSnapshot
      .findFirst({ where: { companyId: null, period: key, isValid: true } })
      .then(
        (valid) =>
          valid ??
          prisma.financialSnapshot.findFirst({
            where: { companyId: null, period: key },
            orderBy: { createdAt: "desc" },
          })
      ),
    prisma.accountingPeriod.findFirst({ where: { companyId: null, year, month } }),
    getTrialBalance(prisma, key),
  ]);

  if (snapshot) {
    const monthCashNet = Number(snapshot.cashIn) - Number(snapshot.cashOut);
    return serialize({
      period: key,
      source: "snapshot" as const,
      status: periodRow?.status ?? PERIOD_STATUS.LOCKED,
      isValid: snapshot.isValid,
      opening: Number(snapshot.openingBalance),
      income: Number(snapshot.income),
      expense: Number(snapshot.outflow),
      payroll: Number(snapshot.payrollTotal),
      cashIn: Number(snapshot.cashIn),
      cashOut: Number(snapshot.cashOut),
      closing: Number(snapshot.closingBalance),
      profit: Number(snapshot.profit),
      loss: Number(snapshot.loss),
      // Ledger kassa harakati va agregat oy harakati farqi — 0 bo'lishi kerak
      difference: Math.round((monthCashNet - (Number(snapshot.income) - Number(snapshot.outflow))) * 100) / 100,
      ledgerStatus: trial.balanced ? "OK" : "ERROR",
      checksum: snapshot.checksum,
      closedBy: periodRow?.closedBy ?? snapshot.createdBy,
      closedAt: periodRow?.closedAt ?? snapshot.createdAt,
    });
  }

  const figures = await computeCloseFigures(prisma, year, month);
  figures.payrollTotal = await getMonthPayrollTotal(prisma, year, month);
  return serialize({
    period: key,
    source: "live" as const,
    status: periodRow?.status ?? PERIOD_STATUS.OPEN,
    isValid: true,
    opening: figures.openingBalance,
    income: figures.income,
    expense: figures.outflow,
    payroll: figures.payrollTotal,
    cashIn: figures.cashIn,
    cashOut: figures.cashOut,
    closing: figures.closingBalance,
    profit: figures.profit,
    loss: figures.loss,
    difference:
      Math.round((figures.cashIn - figures.cashOut - (figures.income - figures.outflow)) * 100) / 100,
    ledgerStatus: trial.balanced ? "OK" : "ERROR",
    checksum: null,
    closedBy: null,
    closedAt: null,
  });
}
