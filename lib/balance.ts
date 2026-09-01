// lib/balance.ts
// Yagona balans manbai — barcha pul jadvallarini bitta "mavjud mablag'" ga bog'laydi.
//   Kirim  = to'langan shartnoma to'lovlari (Payment.paid) + kassa kirimlari
//   Chiqim = TASDIQLANGAN kassa chiqimlari + REAL berilgan oyliklar (Payout)
//   Balans = OCHILISH QOLDIG'I + Kirim - Chiqim
//
// Ochilish qoldig'isiz balans "01.08.2026 da kassada nol pul bor edi" deb
// hisoblardi va shu sababli manfiy chiqardi.
//
// `Expense` jadvali OLIB TASHLANDI: u `KassaEntry(expense)` bilan bir xil
// savolga javob berardi va tasdiq oqimi endi `KassaEntry.status` da.
// Shuning uchun bu yerda ham bitta shox qoldi.
// PayrollAdjustment endi faqat MAJBURIYAT (qancha to'lash kerak) — kassadan pul
// faqat Payout yozilganda chiqadi. Soft-delete qilingan yozuvlar hisobga kirmaydi.
// Bu server-only modul (prisma ishlatadi) — faqat server komponent/actionlardan chaqiriladi.
import { prisma } from "@/lib/prisma";
import { isAdminRole, ROLE_LABELS, type UserRole } from "@/lib/platform/permissions";
import type { Prisma } from "@prisma/client";
import { formatNum } from "@/lib/platform/format";
import type { BalanceBreakdown } from "@/types";
import { getTotalTransitBalance } from "@/lib/transit";
import { KASSA_START_DATE, KASSA_START_PERIOD } from "@/lib/constants";
import { cashFromPaymentRows } from "@/lib/paymentCash";

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

// Naqd ulush qoidasi — sof, bazasiz modulda (`lib/paymentCash.ts`), chunki
// u `lib/**/*.spec.ts` bilan sinaladi. Bu yerdan re-export qilinadi:
// mavjud chaqiruvchilar (`server/cabinet.ts`) o'zgarmasin.
export { cashFromPaymentRows } from "@/lib/paymentCash";

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
  const [paidPaymentRows, kassaIncome, kassaExpense, payouts, transitBalance, openingRow] =
    await Promise.all([
      // `Payment.amount` QARZ yig'indisi — "offset" (vzaimozachyot/ijara)
      // ham kiradi, chunki mijoz nuqtai nazaridan bu ham to'lov. KASSA
      // BALANSI esa faqat haqiqatda tushgan pulni ko'rsatishi kerak, shuning
      // uchun har bir to'lov qatorida "offset" ulushi chiqarib tashlanadi.
      //
      // Allocation'i yo'q qatorlar (eski/qo'lda kiritilgan, applyAllocation
      // dan oldingi davr yoki server/kassa.ts#upsertPayment orqali) — to'liq
      // naqd deb hisoblanadi: ular ta'rifiga ko'ra "offset" bo'la olmaydi,
      // chunki offset FAQAT applyAllocation orqali (source='offset') kiradi.
      db.payment.findMany({
        where: { status: { in: ["paid", "partial"] }, deletedAt: null, period: { gte: KASSA_START_PERIOD } },
        select: { amount: true, allocations: { select: { source: true, amount: true } } },
      }),
      db.kassaEntry.aggregate({
        where: { type: "income", deletedAt: null, date: { gte: KASSA_START_DATE } },
        _sum: { amount: true },
      }),
      db.kassaEntry.aggregate({
        where: {
          type: "expense",
          status: "approved",
          deletedAt: null,
          date: { gte: KASSA_START_DATE },
          ...(opts?.excludeKassaEntryId ? { id: { not: opts.excludeKassaEntryId } } : {}),
        },
        _sum: { amount: true },
      }),
      // Payout.amount har doim musbat (server yozuvda kafolatlaydi) — SUM xavfsiz.
      db.payout.aggregate({
        where: { deletedAt: null, paidAt: { gte: KASSA_START_DATE } },
        _sum: { amount: true },
      }),
      getTotalTransitBalance(db as Prisma.TransactionClient).catch(() => 0),
      // OCHILISH QOLDIG'I. Balans faqat KASSA_START_DATE dan beri yig'iladi,
      // ya'ni undan oldingi pul hisobga kirmasdi va natija manfiy chiqardi
      // (prodda −255 282 877, holbuki naqd qoldiq manfiy bo'la olmaydi).
      //
      // Raqam JURNALDAN o'qiladi, kodga qotirilmaydi: u
      // `scripts/post-opening-balances.ts` bilan bir marta kiritiladi va
      // shu bilan yagona manba bo'lib qoladi. Yozuv bo'lmasa 0 — eski
      // xatti-harakat saqlanadi.
      db.ledgerEntry.aggregate({
        where: { sourceTable: "OpeningBalance", accountId: "CASH" },
        _sum: { debit: true, credit: true },
      }),
    ]);

  const incomePayments = cashFromPaymentRows(paidPaymentRows);
  const incomeKassa = n(kassaIncome._sum.amount);
  const outflowKassa = n(kassaExpense._sum.amount);
  const outflowPayroll = n(payouts._sum.amount);
  // `outflowExpenses` endi doim 0: `Expense` jadvali `KassaEntry` ga
  // birlashtirildi. Maydon `BalanceBreakdown` da qoldirilgan — uni o'qiydigan
  // ekranlar (BalanceOverview) buzilmasin.
  const outflowExpenses = 0;

  const openingCash = n(openingRow._sum.debit) - n(openingRow._sum.credit);

  const income = incomePayments + incomeKassa;
  const outflow = outflowKassa + outflowPayroll;

  return {
    income,
    outflow,
    openingCash,
    balance: openingCash + income - outflow,
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
  const dateWhere = { gte: range.from ?? KASSA_START_DATE, lt: range.to };
  const periodWhere =
    typeof range.paymentPeriod === "string" ? range.paymentPeriod : range.paymentPeriod;
  const [payments, kassaIn, kassaOut, payouts] = await Promise.all([
    db.payment.aggregate({
      where: { status: { in: ["paid", "partial"] }, deletedAt: null, period: periodWhere, ...(typeof periodWhere === "string" ? { gte: undefined } : {}) },
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
    // `aggregate(_sum.amount)` EMAS: u offsetni ham naqd deb sanaydi va
    // `getAvailableBalance` bilan ziddiyat beradi (yuqoridagi
    // `cashFromPaymentRows` izohiga qarang). Bitta oyda ko'pi bilan
    // firmalar soniga teng qator bo'ladi, ya'ni `findMany` narxi sezilarli
    // emas — ziddiyatning narxi esa foydalanuvchining ishonchi.
    db.payment.findMany({
      where: { status: { in: ["paid", "partial"] }, deletedAt: null, period: key },
      select: { amount: true, allocations: { select: { source: true, amount: true } } },
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

  const incomePayments = cashFromPaymentRows(payments);
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

/**
 * Oxirgi N haftaning kirim/chiqim harakati — Dashboard grafigi uchun.
 *
 * `getDayMovement` bilan bir xil sabab: `Payment.paymentDate` bo'yicha
 * (oylik `period` emas), aks holda bir oylik to'lov faqat bitta haftaga
 * tushib qolib, qolgan haftalar soxta nolga chiqardi.
 */
export async function getWeeklyMovement(
  weeks = 5,
  db: MovementDb = prisma
): Promise<{ weekStart: string; income: number; outflow: number }[]> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Joriy kun bilan tugaydigan N ta 7-kunlik oyna — oy chegarasidan mustaqil.
  const ranges = Array.from({ length: weeks }, (_, i) => {
    const to = new Date(todayStart.getTime() - (weeks - 1 - i) * 7 * 86_400_000 + 86_400_000);
    const from = new Date(to.getTime() - 7 * 86_400_000);
    return { from, to };
  });

  const results = await Promise.all(
    ranges.map(async ({ from, to }) => {
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
        weekStart: from.toISOString(),
        income: n(payments._sum.amount) + n(kassaIn._sum.amount),
        outflow: n(kassaOut._sum.amount) + n(payouts._sum.amount),
      };
    })
  );
  return results;
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
