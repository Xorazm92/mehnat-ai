"use server";

// =====================================================
// BANK VIPISKASINI YUKLASH VA MOSLASHTIRISH
// =====================================================
//
// ROL CHEGARASI (foydalanuvchi talabi: "vipiska kirituvchi xodimga faqat kirim
// kassa ko'rinsin", "rasxodni faqat admin qiladi"):
//
//   yuklash, ko'rish, moslashtirish, kirimni hisobga olish → bank_manager + admin
//   CHIQIMNI hisobga olish                                  → FAQAT admin
//
// Chegara faqat menyuda emas, aynan shu yerda — server action'da qo'yiladi:
// proxy.ts ko'rinishni boshqaradi, xavfsizlikni esa shu tekshiruvlar.

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { serialize } from "@/lib/serialize";
import { recordAuditLog } from "@/lib/auditTrail";
import { assertPeriodOpen } from "@/lib/periodLock";
import { parseWorkbook, transactionHash } from "@/lib/bank/parseStatement";
import { parsePlastik } from "@/lib/bank/parsePlastik";
import { looksLikeHtml, readHtmlTables } from "@/lib/bank/readHtmlTables";
import { extractContract } from "@/lib/bank/extractContract";
import { EXPENSE_CATEGORY_LABELS, isPostableExpense, type ExpenseCategory } from "@/lib/bank/classifyExpense";
import {
  commitStatement,
  autoMatchTransactions,
  postIncomeTransaction,
  allocatePlastikReceipt,
  periodOf,
} from "@/lib/bank/importStatement";
import type { ParsedStatement, StatementPreview, Workbook } from "@/lib/bank/types";

/** Vipiska bilan ishlay oladigan rollar. */
const STATEMENT_ROLES = ["super_admin", "admin", "bank_manager"];

async function requireStatementRole() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const role = session.user.role as string;
  if (!STATEMENT_ROLES.includes(role)) throw new Error("Forbidden");
  return { userId: session.user.id, role };
}

/** Chiqim bilan ishlash — faqat admin ("rasxodni faqat man qilaman"). */
async function requireAdmin() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const role = session.user.role as string;
  if (!isAdminRole(role)) throw new Error("Forbidden");
  return { userId: session.user.id, role };
}

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
  const rows = await prisma.paymentAllocation.findMany({
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
  });
  return serialize(rows);
}

/** Chiqimlar — FAQAT admin. */
export async function getBankExpenses(limit = 200) {
  await requireAdmin();
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
  const { userId } = await requireAdmin();

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

  await assertPeriodOpen(prisma, periodOf(tx.valueDate), "bank chiqimi");

  const entry = await prisma.kassaEntry.create({
    data: {
      companyId: tx.account.ownerCompanyId,
      type: "expense",
      category,
      amount: tx.amount,
      description: tx.purpose?.slice(0, 500) ?? tx.counterpartyName,
      date: tx.valueDate,
      channelId: input.channelId ?? null,
      createdBy: userId,
    },
    select: { id: true },
  });

  await prisma.bankTransaction.update({
    where: { id: tx.id },
    data: {
      kassaEntryId: entry.id,
      expenseCategory: category,
      status: "posted",
      postedAt: new Date(),
      postedBy: userId,
    },
  });

  revalidatePath("/kassa/kirim");
  revalidatePath("/expenses");
  return serialize({ kassaEntryId: entry.id, category });
}
