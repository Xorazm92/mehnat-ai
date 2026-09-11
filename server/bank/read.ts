"use server";

// =====================================================
// BANK VIPISKASI — O'QISH
// =====================================================
//
// Ekranlar uchun so'rovlar: hisoblar ko'rinishi, moslashtirilmagan kirim,
// chiqim navbati. Bu yerda HECH NARSA YOZILMAYDI — har bir funksiya sof
// o'qish. Yozish yo'llari `server/bank/post.ts` da, fayl yuklash
// `server/bank/upload.ts` da.
//
// ROL CHEGARASI: `requireStatementRole` / `requireKassa` — proxy.ts faqat
// ko'rinishni boshqaradi, xavfsizlikni aynan shu tekshiruvlar.

import { prisma } from "@/lib/prisma";
import { requireStatementRole, requireKassa } from "@/server/guards";
import { serialize } from "@/lib/serialize";
import { EXPENSE_CATEGORY_LABELS, isPostableExpense, type ExpenseCategory } from "@/lib/bank/classifyExpense";
import { expenseQueueGroup, type ExpenseQueueGroupKey } from "@/lib/bank/expenseQueue";

// ─────────────────────────────────────────────────────────
// O'QISH
// ─────────────────────────────────────────────────────────

/** Kirim kassasi sahifasi uchun o'z firmalarimiz hisoblari + joriy oy raqamlari. */
export async function getBankAccountsOverview() {
  await requireStatementRole();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const accounts = await prisma.bankAccount.findMany({
    where: { isActive: true },
    select: {
      id: true,
      accountNumber: true,
      label: true,
      inn: true,
      ownerCompany: { select: { id: true, name: true } },
    },
    orderBy: { label: "asc" },
  });

  const [income, unmatched, lastImports] = await Promise.all([
    prisma.bankTransaction.groupBy({
      by: ["accountId"],
      where: { direction: "income", valueDate: { gte: monthStart } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.bankTransaction.groupBy({
      by: ["accountId"],
      where: { direction: "income", status: "unmatched" },
      _count: { _all: true },
    }),
    prisma.bankStatementImport.findMany({
      select: { accountId: true, createdAt: true, periodFrom: true, periodTo: true, fileName: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const incomeBy = new Map(income.map((r) => [r.accountId, r]));
  const unmatchedBy = new Map(unmatched.map((r) => [r.accountId, r._count._all]));
  const lastBy = new Map<string, (typeof lastImports)[number]>();
  for (const imp of lastImports) if (!lastBy.has(imp.accountId)) lastBy.set(imp.accountId, imp);

  // Joriy oyda hali vipiska yuklanmagan bo'lsa kartochka "0 so'm" ko'rsatib,
  // sahifa bo'sh bo'lib qolardi — holbuki o'tgan oy ma'lumoti bor. Shuning
  // uchun oxirgi yuklangan vipiska davri bo'yicha ham raqam beriladi va UI
  // qaysi davr ekanini ANIQ yozadi.
  const lastPeriodIncome = await Promise.all(
    accounts.map(async (a) => {
      const last = lastBy.get(a.id);
      if (!last) return null;
      const agg = await prisma.bankTransaction.aggregate({
        where: {
          accountId: a.id,
          direction: "income",
          valueDate: { gte: last.periodFrom ?? new Date(0), lte: last.periodTo },
        },
        _sum: { amount: true },
        _count: { _all: true },
      });
      return {
        sum: Number(agg._sum.amount ?? 0),
        count: agg._count._all,
        from: last.periodFrom,
        to: last.periodTo,
      };
    })
  );

  return serialize(
    accounts.map((a, i) => ({
      ...a,
      monthIncome: Number(incomeBy.get(a.id)?._sum.amount ?? 0),
      monthCount: incomeBy.get(a.id)?._count._all ?? 0,
      unmatchedCount: unmatchedBy.get(a.id) ?? 0,
      lastImportAt: lastBy.get(a.id)?.createdAt ?? null,
      lastImportFile: lastBy.get(a.id)?.fileName ?? null,
      lastPeriodIncome: lastPeriodIncome[i]?.sum ?? 0,
      lastPeriodCount: lastPeriodIncome[i]?.count ?? 0,
      lastPeriodTo: lastPeriodIncome[i]?.to ?? null,
    }))
  );
}

/** Moslashtirilmagan kirimlar navbati — qo'lda firmaga bog'lash uchun. */
export async function getUnmatchedIncome(limit = 100) {
  await requireStatementRole();
  const rows = await prisma.bankTransaction.findMany({
    where: { direction: "income", status: "unmatched" },
    select: {
      id: true,
      valueDate: true,
      docNumber: true,
      amount: true,
      counterpartyInn: true,
      counterpartyName: true,
      contractHint: true,
      purpose: true,
      account: { select: { label: true } },
    },
    orderBy: [{ valueDate: "desc" }, { amount: "desc" }],
    take: limit,
  });
  return serialize(rows);
}

/**
 * Kirim kassasining "Plastik" va "Naqd" bo'limlari.
 *
 * Manba — `PaymentAllocation`, `KassaEntry` EMAS: plastik tushumi ham
 * mijozning to'lovi, ya'ni `Payment` orqali qarzini kamaytiradi. Ikkala joyga
 * yozilsa balans ikki barobar ko'rinardi.
 */
export async function getNonBankIncome(limit = 100) {
  await requireStatementRole();

  // IKKI MANBA, chunki ular ikki xil pul:
  //   PaymentAllocation(plastik|naqd) — MIJOZ to'lovi, qarzini kamaytiradi
  //                                     (1C reestridan import qilinadi);
  //   KassaEntry(income)              — qo'lda kiritilgan naqd/plastik tushum,
  //                                     mijozga bog'lanmagan.
  // Ikkalasi ham balansda BIR MARTA sanaladi (biri Payment, ikkinchisi
  // KassaEntry orqali), shuning uchun ekranda qo'shib ko'rsatish to'g'ri.
  const [allocations, manual] = await Promise.all([
    prisma.paymentAllocation.findMany({
      where: { source: { in: ["plastik", "naqd"] } },
      select: {
        id: true,
        source: true,
        amount: true,
        receivedAt: true,
        externalRef: true,
        payment: { select: { period: true, company: { select: { name: true, inn: true } } } },
      },
      orderBy: [{ receivedAt: "desc" }, { amount: "desc" }],
      take: limit,
    }),
    prisma.kassaEntry.findMany({
      where: {
        type: "income",
        deletedAt: null,
        category: { in: ["Naqd tushum", "Plastik tushum"] },
      },
      select: { id: true, category: true, amount: true, date: true, description: true },
      orderBy: { date: "desc" },
      take: limit,
    }),
  ]);

  const rows = [
    ...allocations.map((a) => ({
      id: a.id,
      source: a.source,
      amount: a.amount,
      receivedAt: a.receivedAt,
      externalRef: a.externalRef,
      payment: a.payment,
      manual: false,
    })),
    ...manual.map((k) => ({
      id: k.id,
      source: k.category === "Naqd tushum" ? "naqd" : "plastik",
      amount: k.amount,
      receivedAt: k.date,
      externalRef: k.description,
      payment: null,
      manual: true,
    })),
  ].sort((a, b) => (b.receivedAt?.getTime() ?? 0) - (a.receivedAt?.getTime() ?? 0));

  return serialize(rows);
}

/** Chiqimlar ro'yxati — moliya rollari. */
export async function getBankExpenses(limit = 200) {
  await requireKassa();
  const rows = await prisma.bankTransaction.findMany({
    where: { direction: "expense" },
    select: {
      id: true,
      valueDate: true,
      amount: true,
      counterpartyName: true,
      expenseCategory: true,
      purpose: true,
      kassaEntryId: true,
      account: { select: { label: true } },
    },
    orderBy: { valueDate: "desc" },
    take: limit,
  });
  return serialize(rows);
}

// =====================================================
// CHIQIM NAVBATI — UCH XIL YAKUN
// =====================================================
//
// Vipiskadagi har chiqim qatori uch yo'ldan BIRI bilan yopiladi va ular
// bir-birini almashtira olmaydi:
//
//   xarajat  — tashqi kontragentga ketgan pul (soliq, ijara, aloqa).
//              `KassaEntry(expense)` bo'ladi va balansdan chiqadi.
//   karta    — o'z xodimimizning kartasiga o'tkazma. XARAJAT EMAS: pul
//              hali korxonada, faqat boshqa cho'ntakda. `TransitEntry(in)`.
//   ichki    — o'z firmalarimiz orasidagi harakat. Umuman xarajat emas.
//
// NEGA AJRATILDI: navbat 446 ta qator ko'rsatardi, ulardan 97 tasi (672,7
// mln) hech qachon xarajat bo'la olmasdi — UI ularga "boshqa joyda hisobga
// olinadi" deb yozib, navbatda ABADIY qoldirardi. Natijada haqiqiy ish
// (349 ta / 251 mln, asosan soliq to'lovlari) shovqin ostida ko'rinmasdi.
//
// Guruhlash `lib/bank/classifyExpense.ts` dagi `NON_POSTABLE_CATEGORIES` ga
// tayanadi — ya'ni qoida bitta joyda va UI uni takrorlamaydi.

export interface ExpenseQueueGroup {
  key: ExpenseQueueGroupKey;
  count: number;
  amount: number;
}

export interface ExpenseQueue {
  groups: ExpenseQueueGroup[];
  /** Toifa bo'yicha kesim — ommaviy yozish uchun. */
  byCategory: { category: string; label: string; count: number; amount: number; postable: boolean }[];
  rows: {
    id: string;
    valueDate: string;
    amount: number;
    counterpartyName: string | null;
    expenseCategory: string;
    purpose: string | null;
    accountLabel: string;
    group: ExpenseQueueGroupKey;
  }[];
  /** Ko'rsatilgandan tashqarida qolgan qatorlar soni. */
  truncated: number;
}

export async function getExpenseQueue(limit = 300): Promise<ExpenseQueue> {
  await requireKassa();

  const all = await prisma.bankTransaction.findMany({
    where: { direction: "expense", status: "unmatched" },
    select: {
      id: true,
      valueDate: true,
      amount: true,
      counterpartyName: true,
      expenseCategory: true,
      purpose: true,
      account: { select: { label: true } },
    },
    orderBy: [{ valueDate: "desc" }, { amount: "desc" }],
  });

  const totals = new Map<string, { count: number; amount: number }>();
  const cats = new Map<string, { count: number; amount: number }>();

  for (const r of all) {
    const cat = r.expenseCategory ?? "boshqa";
    const g = expenseQueueGroup(cat);
    const t = totals.get(g) ?? { count: 0, amount: 0 };
    t.count += 1;
    t.amount += Number(r.amount);
    totals.set(g, t);

    const c = cats.get(cat) ?? { count: 0, amount: 0 };
    c.count += 1;
    c.amount += Number(r.amount);
    cats.set(cat, c);
  }

  const order: ExpenseQueueGroupKey[] = ["xarajat", "karta", "ichki"];

  return serialize({
    groups: order.map((key) => ({ key, ...(totals.get(key) ?? { count: 0, amount: 0 }) })),
    byCategory: [...cats.entries()]
      .map(([category, v]) => ({
        category,
        label: EXPENSE_CATEGORY_LABELS[category as ExpenseCategory] ?? category,
        ...v,
        postable: isPostableExpense(category as ExpenseCategory),
      }))
      .sort((a, b) => b.amount - a.amount),
    rows: all.slice(0, limit).map((r) => ({
      id: r.id,
      // Sana MATN sifatida qaytadi — bu mijoz komponentiga uzatiladi va
      // `Date` obyekti server chegarasidan o'tolmaydi.
      valueDate: r.valueDate.toISOString(),
      amount: Number(r.amount),
      counterpartyName: r.counterpartyName,
      expenseCategory: r.expenseCategory ?? "boshqa",
      purpose: r.purpose,
      accountLabel: r.account.label,
      group: expenseQueueGroup(r.expenseCategory ?? "boshqa"),
    })),
    truncated: Math.max(0, all.length - limit),
  });
}
