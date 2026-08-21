"use server";

// =====================================================
// BANK VIPISKASINI YUKLASH VA MOSLASHTIRISH
// =====================================================
//
// ROL CHEGARASI (2026-08-18 da kengaydi — kassa xodimi chiqimni ham yuritadi):
//
//   yuklash, ko'rish, moslashtirish, kirimni hisobga olish → bank_manager + admin
//   chiqimni toifalash va kassaga yozish                    → moliya rollari
//
// Chegara faqat menyuda emas, aynan shu yerda — server action'da qo'yiladi:
// proxy.ts ko'rinishni boshqaradi, xavfsizlikni esa shu tekshiruvlar.

import { prisma } from "@/lib/prisma";
import { requireStatementRole, requireKassa } from "@/server/guards";
import { revalidatePath } from "next/cache";
import { serialize } from "@/lib/serialize";
import { recordAuditLog } from "@/lib/auditTrail";
import { assertPeriodOpen } from "@/lib/periodLock";
import { recordKassaMovement, runCashTx } from "@/lib/cashGate";
import { parseWorkbook, transactionHash } from "@/lib/bank/parseStatement";
import { parsePlastik } from "@/lib/bank/parsePlastik";
import { looksLikeHtml, readHtmlTables } from "@/lib/bank/readHtmlTables";
import { extractContract } from "@/lib/bank/extractContract";
import { EXPENSE_CATEGORY_LABELS, isPostableExpense, type ExpenseCategory } from "@/lib/bank/classifyExpense";
import {
  expenseQueueGroup,
  ignorableRejectionReason,
  type ExpenseQueueGroupKey,
} from "@/lib/bank/expenseQueue";
import {
  commitStatement,
  autoMatchTransactions,
  postIncomeTransaction,
  allocatePlastikReceipt,
  applyAllocation,
  periodOf,
} from "@/lib/bank/importStatement";
import { assertFundingSource } from "@/server/fundingSources";
import { Prisma } from "@prisma/client";
import type { ParsedStatement, StatementPreview, Workbook } from "@/lib/bank/types";

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

/**
 * Firmalararo o'tkazmani navbatdan yopish.
 *
 * Kirim tomonida bu AVTOMATIK bo'ladi (`autoMatchTransactions` o'z firma
 * STIRini tanib, `ignored` qiladi). Chiqim tomonida esa hech qanday yo'l
 * yo'q edi va 25 ta qator / 219 mln navbatda muzlab qolgandi.
 *
 * `ignored` tanlandi, `posted` emas: bu pul hech qanday hisobga YOZILMAYDI —
 * o'z hisobimizdan o'z hisobimizga o'tgan. `posted` desak, jurnalda yozuvi
 * bor degan ma'no chiqardi.
 */
export async function ignoreExpenseTransaction(input: {
  transactionId: string;
  reason?: string;
}): Promise<{ ok: true }> {
  const { userId } = await requireStatementRole();

  const tx = await prisma.bankTransaction.findUnique({
    where: { id: input.transactionId },
    select: { direction: true, status: true, expenseCategory: true, amount: true },
  });
  if (!tx) throw new Error("Tranzaksiya topilmadi");
  if (tx.direction !== "expense") throw new Error("Bu chiqim tranzaksiyasi emas");
  if (tx.status === "posted") {
    throw new Error("Bu qator allaqachon hisobga olingan — avval uni bekor qiling");
  }

  // Xarajat bo'la oladigan qatorni jimgina yopib yuborish — 211 mln soliq
  // to'lovini "ichki harakat" deb belgilash demakdir. Shuning uchun faqat
  // NON_POSTABLE toifalar bu yo'ldan o'tadi.
  const cat = (tx.expenseCategory ?? "boshqa") as ExpenseCategory;
  const rejection = ignorableRejectionReason(cat);
  if (rejection) throw new Error(rejection);

  await prisma.bankTransaction.update({
    where: { id: input.transactionId },
    data: {
      status: "ignored",
      ignoredReason: input.reason?.trim() || "Firmalararo o'tkazma — xarajat emas",
      postedBy: userId,
    },
  });

  await recordAuditLog({
    userId,
    action: "update",
    tableName: "BankTransaction",
    recordId: input.transactionId,
    newData: { status: "ignored", amount: Number(tx.amount), category: cat },
  });

  revalidatePath("/kassa/chiqim");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────
// YUKLASH
// ─────────────────────────────────────────────────────────

/**
 * Server action XATOSI foydalanuvchiga YETIB BORMAYDI.
 *
 * Next.js prod rejimida server action'dan otilgan xatoning matnini brauzerga
 * bermaydi (maxfiy ma'lumot sizmasligi uchun) — o'rniga umumiy inglizcha
 * xabar va `digest` yuboradi. Ruslan faylni yuklaganda aynan shu holat yuz
 * berdi: parser to'g'ri "format tanilmadi" degan, lekin ekranda tushunarsiz
 * matn chiqqan.
 *
 * Shuning uchun KUTILGAN xatolar (format tanilmadi, hisob topilmadi) otilmaydi
 * — natija sifatida qaytariladi.
 */
export type UploadOutcome<T> = { ok: true; data: T } | { ok: false; error: string };

async function readWorkbook(file: File): Promise<Workbook> {
  const buffer = Buffer.from(await file.arrayBuffer());

  // ".xls" HAR DOIM ham Excel emas. Bank Klient-Bank tizimlari vipiskani
  // HTML jadval qilib berib, unga .xls kengaytmasini qo'yadi. Bunday faylni
  // `xlsx` ga bersak, u sanani MM.DD deb o'qib kun bilan oyni almashtiradi
  // (05.08.2026 → 8-may) va bu XATO JIM O'TADI. Shuning uchun HTML alohida,
  // xom matn sifatida o'qiladi.
  if (looksLikeHtml(buffer)) {
    const workbook = readHtmlTables(buffer);
    if (Object.keys(workbook).length === 0) {
      throw new Error("HTML faylda jadval topilmadi");
    }
    return workbook;
  }

  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false, codepage: 1251 });
  const workbook: Workbook = {};
  for (const name of wb.SheetNames) {
    workbook[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null });
  }
  return workbook;
}

/**
 * Tanilmagan fayl tarkibini xulosa qilib beradi.
 *
 * Aynan shu tashxis tufayli haqiqiy sabab topildi: ekranda kirill "����"
 * bo'lib chiqqani kodlash muammosini, sahifalar bo'linishi esa sarlavha
 * boshqa varaqda ekanini ko'rsatdi. Shusiz "format tanilmadi" degan xabar
 * hech narsa aytmasdi.
 */
function describeWorkbook(workbook: Workbook): string {
  const lines: string[] = [];
  for (const [name, rows] of Object.entries(workbook)) {
    lines.push(`• Sahifa "${name}" — ${rows.length} qator`);
    for (const row of rows.slice(0, 4)) {
      const cells = Object.values(row)
        .map((v) => String(v ?? "").replace(/\s+/g, " ").trim())
        .filter((v) => v.length > 0)
        .slice(0, 6);
      if (cells.length > 0) lines.push(`  ${cells.join(" | ").slice(0, 160)}`);
    }
  }
  return lines.join("\n") || "(fayl bo'sh)";
}

/** Fayl 1C "Реализация" reestrimi (plastik) — vipiska emasmi. */
function findPlastikSheet(workbook: Workbook) {
  for (const rows of Object.values(workbook)) {
    if (rows.some((r) => Object.values(r).some((v) => String(v ?? "").trim() === "Контрагент.ИНН"))) {
      return rows;
    }
  }
  return null;
}

async function resolveAccount(parsed: ParsedStatement) {
  if (!parsed.accountNumber) return null;
  return prisma.bankAccount.findUnique({
    where: { accountNumber: parsed.accountNumber },
    select: { id: true, label: true, accountNumber: true },
  });
}

/**
 * Faylni O'QIYDI, lekin hech narsa yozmaydi — foydalanuvchi tasdiqlashdan
 * oldin nima kelayotganini ko'rsin.
 *
 * Fayl `xlsx` bilan brauzerda emas, SERVERDA o'qiladi: kirish ma'lumotiga
 * ishonmaymiz va parser mantiqi bitta joyda qolsin.
 */
export async function previewStatement(formData: FormData): Promise<UploadOutcome<StatementPreview>> {
  await requireStatementRole();

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Fayl yuborilmadi" };

  let workbook: Workbook;
  try {
    workbook = await readWorkbook(file);
  } catch (e) {
    return { ok: false, error: `Faylni ochib bo'lmadi: ${(e as Error).message}` };
  }

  // 1C reestri (plastik) — bank vipiskasi emas, boshqa yo'l bilan o'qiladi.
  const plastikRows = findPlastikSheet(workbook);
  if (plastikRows) {
    try {
      const { receipts, declaredTotal } = parsePlastik(plastikRows);
      const total = receipts.reduce((sum, r) => sum + r.amount, 0);
      if (declaredTotal != null && Math.round(declaredTotal) !== Math.round(total)) {
        return {
          ok: false,
          error:
            `Yig'indi mos kelmadi: fayldagi "Итого" ${Math.round(declaredTotal).toLocaleString("en-US")}, ` +
            `o'qilgani ${Math.round(total).toLocaleString("en-US")}. Fayl to'liq emas bo'lishi mumkin.`,
        };
      }
      return {
        ok: true,
        data: {
          format: "plastik",
          accountNumber: null,
          accountLabel: "Plastik karta (1C reestri)",
          accountId: null,
          periodFrom: receipts[0]?.date.toISOString() ?? null,
          periodTo: receipts[receipts.length - 1]?.date.toISOString() ?? null,
          incomeCount: receipts.length,
          incomeSum: total,
          expenseCount: 0,
          expenseSum: 0,
          duplicateCount: 0,
          unknownAccount: false,
          sample: receipts.slice(0, 40).map((r) => ({
            valueDate: r.date.toISOString(),
            docNumber: r.docNumber,
            direction: "income",
            amount: r.amount,
            counterpartyName: r.counterpartyName,
            counterpartyInn: r.counterpartyInn,
            contractHint: null,
          })),
        },
      };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  let parsed: ParsedStatement;
  try {
    parsed = parseWorkbook(workbook);
  } catch (e) {
    return {
      ok: false,
      error:
        `${(e as Error).message}\n\n` +
        `Kutilgani — bank vipiskasi ("Лицевой счет" yoki "Сведения о работе счета") ` +
        `yoki 1C "Реализация" reestri.\n\n` +
        `FAYL TARKIBI (shu matnni ishlab chiquvchiga yuboring):\n${describeWorkbook(workbook)}`,
    };
  }

  const account = await resolveAccount(parsed);
  const income = parsed.transactions.filter((t) => t.direction === "income");
  const expense = parsed.transactions.filter((t) => t.direction === "expense");

  // Dublikatni oldindan sanaymiz — "qayta yukladim, nega 0 ta qo'shildi?"
  // degan savol tasdiqlashdan OLDIN javob topsin.
  let duplicateCount = 0;
  if (account) {
    const hashes = parsed.transactions.map((t) =>
      transactionHash({
        accountNumber: account.accountNumber,
        valueDate: t.valueDate,
        docNumber: t.docNumber,
        amount: t.amount,
        direction: t.direction,
        purpose: t.purpose,
      })
    );
    duplicateCount = await prisma.bankTransaction.count({ where: { rawHash: { in: hashes } } });
  }

  return {
    ok: true,
    data: {
      format: parsed.format,
      accountNumber: parsed.accountNumber,
      accountLabel: account?.label ?? parsed.holderName,
      accountId: account?.id ?? null,
      periodFrom: parsed.periodFrom?.toISOString() ?? null,
      periodTo: parsed.periodTo?.toISOString() ?? null,
      incomeCount: income.length,
      incomeSum: income.reduce((sum, t) => sum + t.amount, 0),
      expenseCount: expense.length,
      expenseSum: expense.reduce((sum, t) => sum + t.amount, 0),
      duplicateCount,
      unknownAccount: !account,
      warnings: parsed.warnings,
      sample: parsed.transactions.slice(0, 40).map((t) => ({
        valueDate: t.valueDate.toISOString(),
        docNumber: t.docNumber,
        direction: t.direction,
        amount: t.amount,
        counterpartyName: t.counterpartyName,
        counterpartyInn: t.counterpartyInn,
        contractHint:
          t.direction === "income" ? (extractContract(t.purpose)?.number ?? null) : null,
      })),
    },
  };
}

/** Vipiskani bazaga yozadi va STIR bo'yicha avtomatik moslashtiradi. */
export interface CommitOutcome {
  account: string;
  rowsInserted: number;
  rowsDuplicate: number;
  matched: number;
  internalTransfers: number;
  stillUnmatched: number;
}

export async function commitStatementUpload(
  formData: FormData
): Promise<UploadOutcome<CommitOutcome>> {
  const { userId } = await requireStatementRole();

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Fayl yuborilmadi" };

  let workbook: Workbook;
  try {
    workbook = await readWorkbook(file);
  } catch (e) {
    return { ok: false, error: `Faylni ochib bo'lmadi: ${(e as Error).message}` };
  }

  // ── 1C reestri (plastik karta tushumlari) ────────────────────────────
  const plastikRows = findPlastikSheet(workbook);
  if (plastikRows) {
    let receipts;
    try {
      ({ receipts } = parsePlastik(plastikRows));
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }

    const inns = Array.from(
      new Set(receipts.map((r) => r.counterpartyInn).filter((v): v is string => !!v))
    );
    const companies = await prisma.company.findMany({
      where: { inn: { in: inns }, isOwnFirm: false },
      select: { id: true, inn: true },
    });
    const byInn = new Map<string, typeof companies>();
    for (const c of companies) {
      const list = byInn.get(c.inn) ?? [];
      list.push(c);
      byInn.set(c.inn, list);
    }

    let added = 0;
    let skipped = 0;
    for (const r of receipts) {
      const hits = r.counterpartyInn ? byInn.get(r.counterpartyInn) : undefined;
      // STIRsiz yoki bir nechta firmaga mos kelgan tushum QO'LDA hal qilinadi —
      // pulni noto'g'ri firmaga yozish qarzdorlikni buzadi.
      if (!hits || hits.length !== 1) {
        skipped++;
        continue;
      }
      await allocatePlastikReceipt(prisma, {
        docNumber: r.docNumber,
        companyId: hits[0].id,
        amount: r.amount,
        receivedAt: r.date,
        counterpartyInn: r.counterpartyInn,
        createdBy: userId,
      });
      added++;
    }

    await recordAuditLog({
      userId,
      action: "create",
      tableName: "PaymentAllocation",
      newData: { source: "plastik", fileName: file.name, added, skipped },
    });

    revalidatePath("/kassa/kirim");
    revalidatePath("/kassa");
    return {
      ok: true,
      data: {
        account: "Plastik karta",
        rowsInserted: added,
        rowsDuplicate: 0,
        matched: added,
        internalTransfers: 0,
        stillUnmatched: skipped,
      },
    };
  }

  // ── Bank vipiskasi ───────────────────────────────────────────────────
  let parsed: ParsedStatement;
  try {
    parsed = parseWorkbook(workbook);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const account = await resolveAccount(parsed);
  if (!account) {
    return {
      ok: false,
      error:
        `Hisob raqami bazada topilmadi: ${parsed.accountNumber ?? "o'qib bo'lmadi"}. ` +
        `Avval bu hisobni o'z firmalar ro'yxatiga qo'shing.`,
    };
  }

  const ownFirms = await prisma.company.findMany({
    where: { isOwnFirm: true },
    select: { inn: true },
  });

  const result = await commitStatement(prisma, {
    parsed,
    accountId: account.id,
    accountNumber: account.accountNumber,
    fileName: file.name,
    importedBy: userId,
    ownFirmInns: new Set(ownFirms.map((c) => c.inn)),
  });

  const match = await autoMatchTransactions(prisma, { importId: result.importId });

  await recordAuditLog({
    userId,
    action: "create",
    tableName: "BankStatementImport",
    recordId: result.importId,
    newData: {
      fileName: file.name,
      account: account.label,
      rowsInserted: result.rowsInserted,
      rowsDuplicate: result.rowsDuplicate,
    },
  });

  revalidatePath("/kassa/kirim");
  return {
    ok: true,
    data: {
      account: account.label,
      rowsInserted: result.rowsInserted,
      rowsDuplicate: result.rowsDuplicate,
      matched: match.matchedByInn,
      internalTransfers: match.internalTransfers,
      stillUnmatched: match.stillUnmatched,
    },
  };
}

// ─────────────────────────────────────────────────────────
// MOSLASHTIRISH VA HISOBGA OLISH
// ─────────────────────────────────────────────────────────

/** Tranzaksiyani qo'lda firmaga (va ixtiyoriy shartnomaga) bog'lab, hisobga oladi. */
export async function matchAndPostTransaction(input: {
  transactionId: string;
  companyId: string;
  contractId?: string | null;
}) {
  const { userId } = await requireStatementRole();

  const tx = await prisma.bankTransaction.findUnique({
    where: { id: input.transactionId },
    select: { valueDate: true, direction: true },
  });
  if (!tx) throw new Error("Tranzaksiya topilmadi");
  if (tx.direction !== "income") throw new Error("Bu kirim tranzaksiyasi emas");

  // Yopilgan davrga yozib bo'lmaydi.
  await assertPeriodOpen(prisma, periodOf(tx.valueDate), "bank kirimi");

  const res = await postIncomeTransaction(prisma, {
    transactionId: input.transactionId,
    companyId: input.companyId,
    contractId: input.contractId ?? null,
    createdBy: userId,
  });

  revalidatePath("/kassa/kirim");
  revalidatePath("/kassa");
  return serialize(res);
}

// ─────────────────────────────────────────────────────────
// QO'LDA KIRITILGAN TUSHUM (naqd / plastik / bank)
// ─────────────────────────────────────────────────────────

/** `manual:<manba>:<firma|anon>:<YYYY-MM-DD>:<summa>` — bir xil kalit ikki marta yozilmaydi. */
function manualDedupKey(input: {
  source: string;
  companyId?: string | null;
  receivedAt: Date;
  amount: number;
  docRef?: string | null;
}): string {
  const day = input.receivedAt.toISOString().slice(0, 10);
  const ref = input.docRef?.trim();
  // Hujjat raqami bo'lsa u eng ishonchli kalit; bo'lmasa kun+summa juftligi.
  const tail = ref ? `ref:${ref}` : `${input.amount.toFixed(2)}`;
  return `manual:${input.source}:${input.companyId ?? "anon"}:${day}:${tail}`;
}

export interface ManualReceiptInput {
  /** Bo'sh bo'lsa — nomsiz tushum (hech kimning qarzini kamaytirmaydi). */
  companyId?: string | null;
  contractId?: string | null;
  channelId: string;
  /** naqd | plastik | bank */
  source: string;
  amount: number;
  receivedAt: Date;
  /** Chek yoki hujjat raqami. */
  docRef?: string | null;
  note?: string | null;
}

const MANUAL_SOURCES = new Set(["naqd", "plastik", "bank"]);

/**
 * Bir xil tushum allaqachon kiritilganmi — YUMSHOQ ogohlantirish uchun.
 *
 * `dedupKey` unikal indeksi qattiq to'siq, lekin u faqat AYNAN bir xil kalitni
 * ushlaydi. Kassir bir to'lovni bir kun farq bilan yoki hujjat raqamisiz
 * ikkinchi marta kiritsa, kalit boshqacha chiqadi va to'siq ishlamaydi.
 * Shuning uchun UI saqlashdan oldin shu tekshiruvni chaqiradi: ±1 kun
 * oralig'ida bir xil firma va summa bo'lsa foydalanuvchidan tasdiq so'raladi.
 */
export async function checkDuplicateReceipt(input: {
  companyId?: string | null;
  amount: number;
  receivedAt: Date;
}) {
  await requireStatementRole();
  if (!input.companyId) return { duplicates: [] };

  const day = 86_400_000;
  const rows = await prisma.paymentAllocation.findMany({
    where: {
      payment: { companyId: input.companyId, deletedAt: null },
      amount: new Prisma.Decimal(input.amount.toFixed(2)),
      receivedAt: {
        gte: new Date(input.receivedAt.getTime() - day),
        lte: new Date(input.receivedAt.getTime() + day),
      },
    },
    select: { id: true, source: true, amount: true, receivedAt: true, externalRef: true },
    take: 5,
  });
  return serialize({ duplicates: rows });
}

/**
 * Qo'lda kiritilgan tushumni hisobga oladi.
 *
 * NIMA UCHUN BU BOR: ilgari kirim kassasidagi naqd/plastik forma
 * `createKassaEntry` ni chaqirardi, ya'ni `KassaEntry(income)` yozardi. U
 * qator MIJOZGA BOG'LANMAGAN — qarz esa `Payment` dan hisoblanadi
 * (`lib/debt.ts`). Natijada mijoz naqd to'lasa balans o'sardi, lekin u
 * qarzdorlar ro'yxatida QOLAVERARDI. Bank vipiskasi va 1C plastik reestri
 * to'g'ri yo'ldan (`PaymentAllocation`) yurar edi — faqat qo'lda kiritish
 * chetda qolgan edi.
 *
 * Endi firma tanlansa `applyAllocation` ga (bank/plastik bilan AYNAN bir xil
 * yo'l) tushadi. Firma tanlanmasa — nomsiz tushum — `KassaEntry(income)`
 * qoladi, chunki u haqiqatan hech kimning qarzini kamaytirmaydi.
 */
export async function recordManualReceipt(input: ManualReceiptInput) {
  const { userId } = await requireStatementRole();

  if (!MANUAL_SOURCES.has(input.source)) {
    throw new Error("To'lov turi noto'g'ri: naqd, plastik yoki bank bo'lishi kerak");
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Summa musbat bo'lishi kerak");
  }
  await assertFundingSource(input.channelId);
  await assertPeriodOpen(prisma, input.receivedAt, "kassa kirimi");

  // Nomsiz tushum — mijozga bog'lanmagan, qarzga ta'sir qilmaydi.
  if (!input.companyId) {
    const entry = await prisma.kassaEntry.create({
      data: {
        type: "income",
        category: input.source === "naqd" ? "Naqd tushum" : "Plastik tushum",
        amount: new Prisma.Decimal(amount.toFixed(2)),
        description: input.note?.trim() || null,
        date: input.receivedAt,
        channelId: input.channelId,
        createdBy: userId,
        status: "approved",
        approvedBy: userId,
        approvedAt: new Date(),
        dedupKey: manualDedupKey({ ...input, companyId: null, amount }),
      },
    });
    await recordAuditLog({
      userId,
      action: "create",
      tableName: "KassaEntry",
      recordId: entry.id,
      newData: { source: input.source, amount, anonymous: true },
    });
    revalidatePath("/kassa/kirim");
    revalidatePath("/kassa");
    return serialize({ kind: "anonymous" as const, entryId: entry.id });
  }

  // Shartnoma berilgan bo'lsa u ayni shu firmaniki ekanini tasdiqlaymiz —
  // aks holda to'lov boshqa mijozning shartnomasiga yopishib qolardi.
  if (input.contractId) {
    const contract = await prisma.contract.findUnique({
      where: { id: input.contractId },
      select: { companyId: true },
    });
    if (!contract || contract.companyId !== input.companyId) {
      throw new Error("Shartnoma tanlangan firmaga tegishli emas");
    }
  }

  const res = await applyAllocation(prisma, {
    companyId: input.companyId,
    contractId: input.contractId ?? null,
    amount,
    receivedAt: input.receivedAt,
    source: input.source,
    paymentMethod: input.source === "bank" ? "schyot" : input.source,
    dedupKey: manualDedupKey({ ...input, amount }),
    externalRef: input.docRef?.trim() || null,
    channelId: input.channelId,
    createdBy: userId,
  });

  await recordAuditLog({
    userId,
    action: "create",
    tableName: "PaymentAllocation",
    recordId: res.allocationId,
    newData: {
      source: input.source,
      amount,
      companyId: input.companyId,
      paymentTotal: res.paymentTotal,
    },
  });

  revalidatePath("/kassa/kirim");
  revalidatePath("/kassa");
  revalidatePath("/kassa/qarzdorlik");
  return serialize({ kind: "allocated" as const, ...res });
}

/** Tranzaksiyani e'tiborsiz qoldiradi (mijoz to'lovi emas). */
export async function ignoreTransaction(transactionId: string, reason: string) {
  const { userId } = await requireStatementRole();
  if (!reason.trim()) throw new Error("Sabab ko'rsatilishi kerak");

  await prisma.bankTransaction.update({
    where: { id: transactionId },
    data: { status: "ignored", ignoredReason: reason.trim(), postedBy: userId },
  });
  revalidatePath("/kassa/kirim");
}

/**
 * Chiqimni kassaga yozadi — FAQAT admin.
 *
 * Ikki marta sanaladigan toifalar (firmalararo o'tkazma, oylik, xodim kartasi)
 * bu yerdan O'TMAYDI: ular Payout qatlamiga tegishli yoki tizim ichidagi
 * harakat, KassaEntry yozilsa balans buzilardi.
 */
export async function postExpenseTransaction(input: {
  transactionId: string;
  category?: ExpenseCategory;
  channelId?: string | null;
}) {
  const { userId } = await requireKassa();

  const tx = await prisma.bankTransaction.findUnique({
    where: { id: input.transactionId },
    select: {
      id: true,
      direction: true,
      amount: true,
      valueDate: true,
      purpose: true,
      counterpartyName: true,
      expenseCategory: true,
      kassaEntryId: true,
      account: { select: { ownerCompanyId: true } },
    },
  });
  if (!tx) throw new Error("Tranzaksiya topilmadi");
  if (tx.direction !== "expense") throw new Error("Bu chiqim tranzaksiyasi emas");
  if (tx.kassaEntryId) throw new Error("Bu chiqim allaqachon kassaga yozilgan");

  const category = (input.category ?? tx.expenseCategory ?? "boshqa") as ExpenseCategory;
  if (!isPostableExpense(category)) {
    throw new Error(
      `"${EXPENSE_CATEGORY_LABELS[category]}" toifasi kassaga avtomatik yozilmaydi — ` +
        `bu summa boshqa joyda (oylik/Payout yoki firmalararo harakat) hisobga olinadi.`
    );
  }

  // DARVOZA ORQALI (`lib/cashGate.ts`): ilgari bu yerda `kassaEntry.create`
  // to'g'ridan-to'g'ri chaqirilardi va jurnalga hech narsa yozilmasdi.
  //
  // Aktyor `import` — `user` EMAS. Vipiska qatori ALLAQACHON sodir bo'lgan
  // pul harakati; uni "kassada mablag' yetmaydi" deb rad etish ma'nosiz
  // bo'lardi. Shuning uchun balans darvozasi bu yo'lda ishlamaydi (izoh:
  // lib/cashGate.ts CashActor).
  //
  // Ikkala yozuv bitta tranzaksiyada: kassa qatori yozilib, vipiska qatori
  // "posted" bo'lmay qolsa, xarajat ikkinchi marta yozilishi mumkin edi.
  const entry = await runCashTx(async (db) => {
    const created = await recordKassaMovement(
      db,
      { kind: "import", source: "bank", userId },
      {
        type: "expense",
        category,
        amount: Number(tx.amount),
        date: tx.valueDate,
        description: tx.purpose?.slice(0, 500) ?? tx.counterpartyName,
        companyId: tx.account.ownerCompanyId,
        channelId: input.channelId ?? null,
        // Xuddi shu vipiska qatorini ikkinchi marta yozib bo'lmaydi.
        dedupKey: `bank:${tx.id}`,
      }
    );

    await db.bankTransaction.update({
      where: { id: tx.id },
      data: {
        kassaEntryId: created.id,
        expenseCategory: category,
        status: "posted",
        postedAt: new Date(),
        postedBy: userId,
      },
    });

    return created;
  });

  revalidatePath("/kassa/kirim");
  revalidatePath("/kassa/chiqim");
  revalidatePath("/expenses");
  return serialize({ kassaEntryId: entry.id, category });
}

/**
 * Bir toifadagi hamma toifalanmagan chiqimni kassaga yozish.
 *
 * NEGA KERAK: prodda 135 ta soliq to'lovi navbatda turibdi. Ularni bittalab
 * bosish real ish emas — natijada navbat umuman tozalanmasdi va 211 mln
 * xarajat tizimga kirmay qolgandi.
 *
 * Har qator ALOHIDA yoziladi (yagona katta tranzaksiya emas): bittasi
 * yiqilsa qolgani baribir o'tishi kerak, aks holda bitta buzuq qator butun
 * toifani bloklardi. Yiqilganlar sanaladi va qaytariladi.
 *
 * `limit` — bir chaqiruvda nechta. Server action vaqt chegarasiga urilmaslik
 * uchun; qolgani keyingi bosishda ketadi va son ekranda ko'rinib turadi.
 */
export async function postExpenseCategoryBulk(input: {
  category: ExpenseCategory;
  limit?: number;
}): Promise<{ posted: number; amount: number; failed: number; remaining: number; firstError: string | null }> {
  await requireKassa();

  if (!isPostableExpense(input.category)) {
    throw new Error(
      `"${EXPENSE_CATEGORY_LABELS[input.category] ?? input.category}" kassaga yozilmaydi — ` +
        `bu summa tranzit yoki firmalararo harakat sifatida hisobga olinadi.`
    );
  }

  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);
  const pending = await prisma.bankTransaction.findMany({
    where: { direction: "expense", status: "unmatched", expenseCategory: input.category },
    select: { id: true, amount: true },
    orderBy: { valueDate: "asc" },
    take: limit,
  });

  let posted = 0;
  let amount = 0;
  let failed = 0;
  let firstError: string | null = null;

  for (const row of pending) {
    try {
      await postExpenseTransaction({ transactionId: row.id, category: input.category });
      posted += 1;
      amount += Number(row.amount);
    } catch (e) {
      failed += 1;
      if (!firstError) firstError = (e as Error).message;
    }
  }

  const remaining = await prisma.bankTransaction.count({
    where: { direction: "expense", status: "unmatched", expenseCategory: input.category },
  });

  revalidatePath("/kassa/chiqim");
  revalidatePath("/expenses");
  return { posted, amount, failed, remaining, firstError };
}
