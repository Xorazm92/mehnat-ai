// lib/balance.ts
// Yagona balans manbai — barcha pul jadvallarini bitta "mavjud mablag'" ga bog'laydi.
//   Kirim  = to'langan shartnoma to'lovlari (Payment.paid) + kassa kirimlari
//   Chiqim = TASDIQLANGAN kassa chiqimlari + REAL berilgan oyliklar (Payout)
//
// `Expense` jadvali OLIB TASHLANDI: u `KassaEntry(expense)` bilan bir xil
// savolga javob berardi va tasdiq oqimi endi `KassaEntry.status` da.
// Shuning uchun bu yerda ham bitta shox qoldi.
// PayrollAdjustment endi faqat MAJBURIYAT (qancha to'lash kerak) — kassadan pul
// faqat Payout yozilganda chiqadi. Soft-delete qilingan yozuvlar hisobga kirmaydi.
// Bu server-only modul (prisma ishlatadi) — faqat server komponent/actionlardan chaqiriladi.
import { prisma } from "@/lib/prisma";
import { isAdminRole, ROLE_LABELS, type UserRole } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";
import { formatNum } from "@/lib/format";
import type { BalanceBreakdown } from "@/types";
import { getTotalTransitBalance } from "@/lib/transit";

/**
 * Balansni tranzaksiya ICHIDA o'qish uchun. Chaqiruvchi `tx` bersa, o'qish
 * ham yozish ham bitta Serializable tranzaksiyada bo'ladi — aks holda
 * "tekshirdim, keyin yozdim" oralig'ida boshqa amal balansni o'zgartirib
 * ulgurishi mumkin (lib/tx.ts dagi izohga qarang).
 */
export type Db = Prisma.TransactionClient | typeof prisma;

export type { BalanceBreakdown };

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * Butun tizim bo'yicha joriy mavjud mablag'ni hisoblaydi.
 * @param opts.excludeKassaEntryId — tahrir/qayta tasdiqda yozuv o'z summasini
 *   ikki marta sanamasligi uchun chiqim yig'indisidan chiqarib tashlanadi.
 */
export async function getAvailableBalance(opts?: {
  excludeKassaEntryId?: string;
  /** Tranzaksiya klienti — berilsa balans o'sha tranzaksiya ichida o'qiladi. */
  db?: Db;
}): Promise<BalanceBreakdown> {
  const db = opts?.db ?? prisma;
  const [paidPayments, kassaIncome, kassaExpense, payouts, transitBalance] =
    await Promise.all([
      db.payment.aggregate({
        where: { status: { in: ["paid", "partial"] }, deletedAt: null },
        _sum: { amount: true },
      }),
      db.kassaEntry.aggregate({
        where: { type: "income", deletedAt: null },
        _sum: { amount: true },
      }),
      db.kassaEntry.aggregate({
        where: {
          type: "expense",
          status: "approved",
          deletedAt: null,
          ...(opts?.excludeKassaEntryId ? { id: { not: opts.excludeKassaEntryId } } : {}),
        },
        _sum: { amount: true },
      }),
      // Payout.amount har doim musbat (server yozuvda kafolatlaydi) — SUM xavfsiz.
      db.payout.aggregate({
        where: { deletedAt: null },
        _sum: { amount: true },
      }),
      getTotalTransitBalance(db as Prisma.TransactionClient).catch(() => 0),
    ]);

  const incomePayments = n(paidPayments._sum.amount);
  const incomeKassa = n(kassaIncome._sum.amount);
  const outflowKassa = n(kassaExpense._sum.amount);
  const outflowPayroll = n(payouts._sum.amount);
  // `outflowExpenses` endi doim 0: `Expense` jadvali `KassaEntry` ga
  // birlashtirildi. Maydon `BalanceBreakdown` da qoldirilgan — uni o'qiydigan
  // ekranlar (BalanceOverview) buzilmasin.
  const outflowExpenses = 0;

  const income = incomePayments + incomeKassa;
  const outflow = outflowKassa + outflowPayroll;

  return {
    income,
    outflow,
    balance: income - outflow,
    transitBalance,
    incomePayments,
    incomeKassa,
    outflowExpenses,
    outflowKassa,
    outflowPayroll,
  };
}

type MovementDb = Pick<typeof prisma, "payment" | "kassaEntry" | "payout">;

interface MovementRange {
  /** Payment.period ("YYYY-MM" string) uchun filtr */
  paymentPeriod: { startsWith?: string; lt?: string } | string;
  /** Sana maydonlari (kassa.date, expense.date, payout.paidAt) uchun oraliq */
  from?: Date;
  to: Date;
}

/** Kirim/chiqim harakati — bitta umumiy so'rov to'plami (soft-delete filtrlangan). */
async function movementInRange(
  db: MovementDb,
  range: MovementRange
): Promise<{ income: number; outflow: number }> {
  const dateWhere = { ...(range.from ? { gte: range.from } : {}), lt: range.to };
  const periodWhere =
    typeof range.paymentPeriod === "string" ? range.paymentPeriod : range.paymentPeriod;
  const [payments, kassaIn, kassaOut, payouts] = await Promise.all([
    db.payment.aggregate({
      where: { status: { in: ["paid", "partial"] }, deletedAt: null, period: periodWhere },
      _sum: { amount: true },
    }),
    db.kassaEntry.aggregate({
      where: { type: "income", deletedAt: null, date: dateWhere },
      _sum: { amount: true },
    }),
    db.kassaEntry.aggregate({
      where: { type: "expense", status: "approved", deletedAt: null, date: dateWhere },
      _sum: { amount: true },
    }),
    db.payout.aggregate({
      where: { deletedAt: null, paidAt: dateWhere },
      _sum: { amount: true },
    }),
  ]);
  return {
    income: n(payments._sum.amount) + n(kassaIn._sum.amount),
    outflow: n(kassaOut._sum.amount) + n(payouts._sum.amount),
  };
}

/**
 * BITTA OYNING kirim/chiqim kesimi — MANBA BO'YICHA ajratilgan.
 *
 * NEGA KERAK: `getAvailableBalance` BOSHIDAN BERI yig'ilgan raqamni beradi
 * (kirim 1,25 mlrd). Ekranda u "Kirim" deb turgani uchun uni oylik tushum
 * deb o'qish oson edi, holbuki korxonaning oylik tushumi ~1 mlrd atrofida —
 * ya'ni bitta raqam butun tarixni bitta oy qilib ko'rsatardi.
 *
 * Balansning O'ZI (qancha pul bor) baribir yig'ma bo'lishi SHART: bugungi
 * qoldiq — butun tarixning natijasi. Shuning uchun bu funksiya balansni
 * hisoblamaydi, faqat SHU OYdagi harakatni beradi.
 */
export async function getMonthBreakdown(
  year: number,
  month: number,
  db: MovementDb = prisma
): Promise<{
  income: number;
  outflow: number;
  incomePayments: number;
  incomeKassa: number;
  outflowKassa: number;
  outflowPayroll: number;
}> {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  const dateWhere = { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) };

  const [payments, kassaIn, kassaOut, payouts] = await Promise.all([
    db.payment.aggregate({
      where: { status: { in: ["paid", "partial"] }, deletedAt: null, period: key },
      _sum: { amount: true },
    }),
    db.kassaEntry.aggregate({
      where: { type: "income", deletedAt: null, date: dateWhere },
      _sum: { amount: true },
    }),
    db.kassaEntry.aggregate({
      where: { type: "expense", status: "approved", deletedAt: null, date: dateWhere },
      _sum: { amount: true },
    }),
    db.payout.aggregate({ where: { deletedAt: null, paidAt: dateWhere }, _sum: { amount: true } }),
  ]);

  const incomePayments = n(payments._sum.amount);
  const incomeKassa = n(kassaIn._sum.amount);
  const outflowKassa = n(kassaOut._sum.amount);
  const outflowPayroll = n(payouts._sum.amount);

  return {
    income: incomePayments + incomeKassa,
    outflow: outflowKassa + outflowPayroll,
    incomePayments,
    incomeKassa,
    outflowKassa,
    outflowPayroll,
  };
}

/** Bitta oyning kirim/chiqim harakati (oy yopilishi uchun). db — tx bo'lishi mumkin. */
export async function getMonthMovement(
  year: number,
  month: number,
  db: MovementDb = prisma
): Promise<{ income: number; outflow: number }> {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  return movementInRange(db, {
    paymentPeriod: key,
    from: new Date(year, month - 1, 1),
    to: new Date(year, month, 1),
  });
}

/**
 * Bitta KUN ichidagi kirim/chiqim (direktorning kunlik hisoboti uchun).
 *
 * DIQQAT: `Payment` da kunlik sana ishonchli emas — u oylik yig'ma qator
 * (`@@unique([companyId, period])`) va `paymentDate` bo'sh bo'lishi mumkin.
 * Shuning uchun bu yerda shartnoma to'lovlari `paymentDate` bo'yicha alohida
 * sanaladi, `movementInRange` esa oylik `period` bilan ishlaydi.
 */
export async function getDayMovement(
  day: Date,
  db: MovementDb = prisma
): Promise<{ income: number; outflow: number }> {
  const from = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const to = new Date(from.getTime() + 86_400_000);
  const dateWhere = { gte: from, lt: to };

  const [payments, kassaIn, kassaOut, payouts] = await Promise.all([
    db.payment.aggregate({
      where: { status: { in: ["paid", "partial"] }, deletedAt: null, paymentDate: dateWhere },
      _sum: { amount: true },
    }),
    db.kassaEntry.aggregate({
      where: { type: "income", deletedAt: null, date: dateWhere },
      _sum: { amount: true },
    }),
    db.kassaEntry.aggregate({
      where: { type: "expense", status: "approved", deletedAt: null, date: dateWhere },
      _sum: { amount: true },
    }),
    db.payout.aggregate({ where: { deletedAt: null, paidAt: dateWhere }, _sum: { amount: true } }),
  ]);

  return {
    income: n(payments._sum.amount) + n(kassaIn._sum.amount),
    outflow: n(kassaOut._sum.amount) + n(payouts._sum.amount),
  };
}

/** Oy boshigacha bo'lgan butun tarix harakati (birinchi oy yopilishida ochilish qoldig'i). */
export async function getMovementBeforeMonth(
  year: number,
  month: number,
  db: MovementDb = prisma
): Promise<{ income: number; outflow: number }> {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  return movementInRange(db, {
    paymentPeriod: { lt: key },
    to: new Date(year, month - 1, 1),
  });
}

/**
 * Bir yil ichidagi kirim/chiqim harakati (snapshot/yil yopilishi uchun).
 * Payment davri "YYYY-MM" string — yil prefiksi bilan filtrlaymiz; qolganlari sana bo'yicha.
 */
export async function getYearMovement(year: number): Promise<{ income: number; outflow: number }> {
  const from = new Date(year, 0, 1);
  const to = new Date(year + 1, 0, 1);
  const [payments, kassaIn, kassaOut, payouts] = await Promise.all([
    prisma.payment.aggregate({
      where: { status: { in: ["paid", "partial"] }, deletedAt: null, period: { startsWith: `${year}-` } },
      _sum: { amount: true },
    }),
    prisma.kassaEntry.aggregate({
      where: { type: "income", deletedAt: null, date: { gte: from, lt: to } },
      _sum: { amount: true },
    }),
    prisma.kassaEntry.aggregate({
      where: { type: "expense", status: "approved", deletedAt: null, date: { gte: from, lt: to } },
      _sum: { amount: true },
    }),
    prisma.payout.aggregate({
      where: { deletedAt: null, paidAt: { gte: from, lt: to } },
      _sum: { amount: true },
    }),
  ]);
  return {
    income: n(payments._sum.amount) + n(kassaIn._sum.amount),
    outflow: n(kassaOut._sum.amount) + n(payouts._sum.amount),
  };
}

/** Yil boshigacha bo'lgan butun tarix harakati (birinchi snapshot uchun ochilish qoldig'i). */
export async function getMovementBefore(year: number): Promise<{ income: number; outflow: number }> {
  const to = new Date(year, 0, 1);
  const [payments, kassaIn, kassaOut, payouts] = await Promise.all([
    prisma.payment.aggregate({
      where: { status: { in: ["paid", "partial"] }, deletedAt: null, period: { lt: `${year}-01` } },
      _sum: { amount: true },
    }),
    prisma.kassaEntry.aggregate({
      where: { type: "income", deletedAt: null, date: { lt: to } },
      _sum: { amount: true },
    }),
    prisma.kassaEntry.aggregate({
      where: { type: "expense", status: "approved", deletedAt: null, date: { lt: to } },
      _sum: { amount: true },
    }),
    prisma.payout.aggregate({
      where: { deletedAt: null, paidAt: { lt: to } },
      _sum: { amount: true },
    }),
  ]);
  return {
    income: n(payments._sum.amount) + n(kassaIn._sum.amount),
    outflow: n(kassaOut._sum.amount) + n(payouts._sum.amount),
  };
}

/**
 * BITTA MANBA (kassa/hisob) bo'yicha qoldiq — jurnal CASH oyoqlaridan.
 *
 * MANBA_BALANSI = shu kanalga tushgan jami − shu kanaldan chiqqan jami.
 * Umumiy balans aynan shu manba qoldiqlarining YIG'INDISI (`getCashByChannel`
 * bilan bir xil manba), ya'ni chiqim tanlangan manbadan yozilsa ikkalasi
 * bir vaqtda to'g'ri harakatlanadi.
 */
export async function getChannelCashBalance(
  db: Db,
  channelId: string,
  opts: { excludeKassaEntryId?: string } = {}
): Promise<number> {
  const agg = await db.ledgerEntry.aggregate({
    where: {
      accountId: "CASH",
      channelId,
      ...(opts.excludeKassaEntryId ? { NOT: { sourceId: opts.excludeKassaEntryId } } : {}),
    },
    _sum: { debit: true, credit: true },
  });
  return n(agg._sum.debit) - n(agg._sum.credit);
}

// Summa formatlash YAGONA manbadan (`lib/format.ts`). Bu yerda o'z nusxasi
// bor edi va u `toLocaleString("ru-RU")` ishlatardi — ya'ni xato matnidagi
// raqam ekrandagidan boshqacha ko'rinardi (probel va vergul).

/**
 * Chiqim yoki oylik summasi mavjud balansdan oshib ketmasligini tekshiradi.
 * - Oddiy foydalanuvchi: balansdan oshsa xatolik (bloklanadi).
 * - Admin/Superadmin: o'tkaza oladi (minus balansga ruxsat), lekin audit logga yoziladi.
 */
export async function assertSufficientFunds(params: {
  amount: number;
  role: string;
  userId?: string;
  excludeKassaEntryId?: string;
  context: "expense" | "payroll";
  /**
   * Tranzaksiya klienti. HAR DOIM berilishi kerak: usiz tekshiruv va yozuv
   * atomar bo'lmaydi va ikki parallel chiqim bir xil balansni ko'rib ikkalasi
   * ham o'tib ketadi. `lib/tx.ts` `serializable()` bilan ishlating.
   */
  db?: Db;
}): Promise<void> {
  const { amount, role, userId, excludeKassaEntryId, context, db = prisma } = params;
  const { balance } = await getAvailableBalance({ excludeKassaEntryId, db });

  if (amount <= balance) return; // mablag' yetarli — ruxsat

  if (!isAdminRole(role)) {
    throw new Error(
      `Kassada yetarli mablag' yo'q. Mavjud balans: ${formatNum(balance)} so'm, ` +
        `so'ralgan summa: ${formatNum(amount)} so'm. ` +
        `Kirim yetarli bo'lmaguncha bu summani faqat Admin yoki Superadmin tasdiqlashi mumkin.`
    );
  }

  // Admin override — minus balansga ruxsat berildi, izi audit logga yoziladi
  // Audit izi tranzaksiya klienti bilan yoziladi: amal bekor bo'lsa
  // "override qilindi" degan yolg'on iz qolmaydi.
  await db.auditLog
    .create({
      data: {
        userId: userId ?? null,
        action: "update",
        tableName: context === "payroll" ? "PayrollAdjustment" : "Expense",
        newData: {
          reason: "negative_balance_override",
          context,
          availableBalance: Math.round(balance),
          requestedAmount: Math.round(amount),
          approvedByRole: ROLE_LABELS[role as UserRole] ?? role,
        },
      },
    })
    .catch((err) => {
      console.error("Admin override audit log yaratishda xatolik:", err);
    });
}
