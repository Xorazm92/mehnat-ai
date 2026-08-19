// =====================================================
// VIPISKANI BAZAGA YOZISH VA MOSLASHTIRISH
// =====================================================
//
// Framework-free (db argument sifatida beriladi), shuning uchun aynan shu kod
// ham veb-yuklashda (server/bankImport.ts), ham bir martalik backfill
// skriptida (scripts/import-statements.ts) ishlaydi. Parse mantiqi ikki joyda
// takrorlanmaydi.
//
// BALANS QOIDASI (lib/balance.ts bilan kelishilgan):
//   BankTransaction — XOM yozuv, balansga UMUMAN kirmaydi.
//   Kirim moslashtirilganda → Payment (+ PaymentAllocation) yoziladi.
//   Chiqim toifalanganda    → KassaEntry(expense).
// Ikkalasi bir vaqtda YOZILMAYDI — aks holda bitta pul ikki marta sanalardi.

import { Prisma } from "@prisma/client";
import { periodKeyOf } from "@/lib/periods";
import { transactionHash } from "./parseStatement";
import { extractContract } from "./extractContract";
import { classifyExpense, type ExpenseCategory } from "./classifyExpense";
import type { ParsedStatement } from "./types";

type Db = Prisma.TransactionClient;

export interface CommitInput {
  parsed: ParsedStatement;
  accountId: string;
  accountNumber: string;
  fileName: string;
  importedBy?: string | null;
  /** O'z firmalarimiz STIR'lari — firmalararo o'tkazmani aniqlash uchun. */
  ownFirmInns: ReadonlySet<string>;
}

export interface CommitResult {
  importId: string;
  rowsParsed: number;
  rowsInserted: number;
  rowsDuplicate: number;
}

/**
 * Vipiskani bazaga yozadi.
 *
 * Idempotent: `BankTransaction.rawHash` unikal, `skipDuplicates` bilan xuddi
 * shu faylni qayta yuklash yangi qator hosil qilmaydi — faqat `rowsDuplicate`
 * sanog'i oshadi.
 */
export async function commitStatement(db: Db, input: CommitInput): Promise<CommitResult> {
  const { parsed, accountId, accountNumber, fileName, importedBy, ownFirmInns } = input;

  const statementImport = await db.bankStatementImport.create({
    data: {
      accountId,
      fileName,
      format: parsed.format,
      periodFrom: parsed.periodFrom ?? new Date(),
      periodTo: parsed.periodTo ?? new Date(),
      openingBalance: parsed.openingBalance ?? null,
      closingBalance: parsed.closingBalance ?? null,
      rowsParsed: parsed.transactions.length,
      importedBy: importedBy ?? null,
    },
    select: { id: true },
  });

  const rows = parsed.transactions.map((t) => {
    const contract = t.direction === "income" ? extractContract(t.purpose) : null;
    const category: ExpenseCategory | null =
      t.direction === "expense"
        ? classifyExpense({
            purpose: t.purpose,
            counterpartyName: t.counterpartyName,
            counterpartyInn: t.counterpartyInn,
            ownFirmInns,
          })
        : null;

    return {
      importId: statementImport.id,
      accountId,
      valueDate: t.valueDate,
      docNumber: t.docNumber,
      opCode: t.opCode,
      direction: t.direction,
      amount: new Prisma.Decimal(t.amount.toFixed(2)),
      counterpartyInn: t.counterpartyInn,
      counterpartyName: t.counterpartyName,
      counterpartyAccount: t.counterpartyAccount,
      purpose: t.purpose,
      contractHint: contract?.number ?? null,
      expenseCategory: category,
      rawHash: transactionHash({
        accountNumber,
        valueDate: t.valueDate,
        docNumber: t.docNumber,
        amount: t.amount,
        direction: t.direction,
        purpose: t.purpose,
      }),
    };
  });

  const inserted = await db.bankTransaction.createMany({ data: rows, skipDuplicates: true });
  const rowsDuplicate = rows.length - inserted.count;

  await db.bankStatementImport.update({
    where: { id: statementImport.id },
    data: { rowsInserted: inserted.count, rowsDuplicate },
  });

  return {
    importId: statementImport.id,
    rowsParsed: rows.length,
    rowsInserted: inserted.count,
    rowsDuplicate,
  };
}

export interface MatchResult {
  examined: number;
  matchedByInn: number;
  matchedContract: number;
  /** O'z firmalarimizdan kelgan pul — mijoz to'lovi emas, avtomatik chetlatildi. */
  internalTransfers: number;
  stillUnmatched: number;
}

/**
 * Moslashtirish: kontragent STIR'i bo'yicha mijoz firmani, so'ng to'lov
 * maqsadidagi shartnoma raqami bo'yicha `Contract` ni topadi.
 *
 * Faqat KIRIM moslashtiriladi — chiqim mijozga tegishli emas.
 * O'z firmalarimiz (`isOwnFirm`) mijoz sifatida MOSLASHTIRILMAYDI: firmalararo
 * o'tkazmani mijoz to'lovi deb yozish qarzdorlikni soxta yopib qo'yardi.
 */
export async function autoMatchTransactions(
  db: Db,
  where: { importId?: string; accountId?: string } = {}
): Promise<MatchResult> {
  const pending = await db.bankTransaction.findMany({
    where: {
      ...(where.importId ? { importId: where.importId } : {}),
      ...(where.accountId ? { accountId: where.accountId } : {}),
      direction: "income",
      status: "unmatched",
    },
    select: { id: true, counterpartyInn: true, contractHint: true },
  });

  const result: MatchResult = {
    examined: pending.length,
    matchedByInn: 0,
    matchedContract: 0,
    internalTransfers: 0,
    stillUnmatched: 0,
  };
  if (pending.length === 0) return result;

  const inns = Array.from(
    new Set(pending.map((t) => t.counterpartyInn).filter((v): v is string => !!v))
  );

  // O'z firmalarimizdan kelgan pul MIJOZ TO'LOVI EMAS — bu firmalararo
  // o'tkazma (moliyaviy yordam, qarz qaytarish). Uni qo'lda hal qilinadigan
  // navbatda qoldirish Ruslanni har oy o'nlab soxta qator bilan band qilardi,
  // yomoni — kimdir uni mijoz to'lovi deb yozib, qarzdorlikni soxta yopishi
  // mumkin edi. Shuning uchun avtomatik chetlatiladi.
  const ownFirms = await db.company.findMany({
    where: { inn: { in: inns }, isOwnFirm: true },
    select: { inn: true },
  });
  const ownInns = new Set(ownFirms.map((c) => c.inn));

  const companies = await db.company.findMany({
    where: { inn: { in: inns }, isOwnFirm: false },
    select: { id: true, inn: true, contracts: { select: { id: true, number: true } } },
  });

  // STIR unikal emas — bir nechta firma mos kelsa moslashtirmaymiz, chunki
  // pulni noto'g'ri firmaga yozish qarzdorlikni buzadi. Ular qo'lda hal qilinadi.
  const byInn = new Map<string, (typeof companies)[number][]>();
  for (const c of companies) {
    const list = byInn.get(c.inn) ?? [];
    list.push(c);
    byInn.set(c.inn, list);
  }

  for (const tx of pending) {
    if (tx.counterpartyInn && ownInns.has(tx.counterpartyInn)) {
      await db.bankTransaction.update({
        where: { id: tx.id },
        data: { status: "ignored", ignoredReason: "Firmalararo o'tkazma — mijoz to'lovi emas" },
      });
      result.internalTransfers++;
      continue;
    }

    const matches = tx.counterpartyInn ? byInn.get(tx.counterpartyInn) : undefined;
    if (!matches || matches.length !== 1) {
      continue;
    }
    const company = matches[0];
    const contract = tx.contractHint
      ? company.contracts.find((c) => c.number === tx.contractHint)
      : undefined;

    await db.bankTransaction.update({
      where: { id: tx.id },
      data: {
        matchedCompanyId: company.id,
        matchedContractId: contract?.id ?? null,
        status: "matched",
      },
    });
    result.matchedByInn++;
    if (contract) result.matchedContract++;
  }

  result.stillUnmatched = result.examined - result.matchedByInn - result.internalTransfers;
  return result;
}

/** "YYYY-MM" — Payment.period formati. */
// Davr kaliti `lib/periods.ts` dan — bank moduli o'z nusxasini yuritmaydi.
// Qayta eksport: mavjud importerlar (`server/bankImport.ts`, `server/transit.ts`,
// `scripts/import-statements.ts`) `periodOf` nomi bilan chaqiradi.
export const periodOf = periodKeyOf;

export interface PostResult {
  paymentId: string;
  allocationId: string;
  /** Shu firma/davr bo'yicha jami taqsimlangan summa. */
  paymentTotal: number;
  status: string;
  /**
   * Qo'lda kiritilgan summa bank ma'lumoti bilan ALMASHTIRILDI.
   *
   * `Payment.amount` endi taqsimotlar yig'indisidan hisoblanadi (bank —
   * haqiqiy manba). Lekin qatorda avval qo'lda yozilgan summa bo'lsa, u
   * yo'qoladi. Bu JIM sodir bo'lmasligi kerak: qiymat qaytariladi va
   * chaqiruvchi uni foydalanuvchiga ko'rsatadi.
   */
  supersededManualAmount: number | null;
}

export interface AllocationInput {
  companyId: string;
  contractId?: string | null;
  amount: Prisma.Decimal | number;
  receivedAt: Date;
  /** bank | plastik | naqd */
  source: string;
  /** `Payment.paymentMethod` — yangi qator yaratilganda yoziladi. */
  paymentMethod: string;
  /** Takrorlanmaslik kaliti: "bank:<txId>" | "plastik:<hujjat>:<STIR>" | "manual:..." */
  dedupKey: string;
  externalRef?: string | null;
  bankTransactionId?: string | null;
  channelId?: string | null;
  createdBy?: string | null;
}

/**
 * TUSHUMNI mijozning oylik `Payment` qatoriga qo'shadi — YAGONA yo'l.
 *
 * Bank vipiskasi, plastik reestri va qo'lda kiritilgan naqd/plastik tushum
 * uchun ham AYNAN shu funksiya ishlaydi. Ilgari bu 40 qator ikki joyda
 * nusxalangan edi (`postIncomeTransaction` va `allocatePlastikReceipt`), qo'lda
 * kiritish esa uchinchi, NOTO'G'RI yo'ldan — `KassaEntry(income)` ga — ketardi
 * va shuning uchun mijozning qarzini kamaytirmasdi.
 *
 * Qoida: `Payment.amount` HECH QACHON qo'shilmaydi, har doim shu davrdagi
 * `PaymentAllocation` yig'indisidan QAYTA HISOBLANADI. Shu sababli qayta
 * hisobga olish yoki tahrir summani shishirmaydi.
 *
 * `KassaEntry` ATAYIN yozilmaydi: lib/balance.ts kirimni Payment'dan ham,
 * KassaEntry'dan ham sanaydi — ikkalasini yozish balansni ikki barobar
 * ko'rsatardi.
 */
export async function applyAllocation(db: Db, input: AllocationInput): Promise<PostResult> {
  const period = periodOf(input.receivedAt);
  const amount =
    input.amount instanceof Prisma.Decimal
      ? input.amount
      : new Prisma.Decimal(Number(input.amount).toFixed(2));

  // Qatorda avval qo'lda kiritilgan summa bormi (taqsimotsiz)? Bo'lsa, u
  // taqsimotlar yig'indisi bilan almashtiriladi — buni aytib qo'yish kerak.
  const existingPayment = await db.payment.findUnique({
    where: { companyId_period: { companyId: input.companyId, period } },
    select: { id: true, amount: true, _count: { select: { allocations: true } } },
  });
  const supersededManualAmount =
    existingPayment && existingPayment._count.allocations === 0 && Number(existingPayment.amount) > 0
      ? Number(existingPayment.amount)
      : null;

  const payment = await db.payment.upsert({
    where: { companyId_period: { companyId: input.companyId, period } },
    create: {
      companyId: input.companyId,
      period,
      amount: 0,
      status: "pending",
      paymentMethod: input.paymentMethod,
      paymentDate: input.receivedAt,
      createdBy: input.createdBy ?? null,
    },
    update: { deletedAt: null, deletedBy: null, deleteReason: null },
    select: { id: true },
  });

  const allocation = await db.paymentAllocation.upsert({
    where: { dedupKey: input.dedupKey },
    create: {
      dedupKey: input.dedupKey,
      source: input.source,
      externalRef: input.externalRef ?? null,
      bankTransactionId: input.bankTransactionId ?? null,
      paymentId: payment.id,
      contractId: input.contractId ?? null,
      channelId: input.channelId ?? null,
      amount,
      receivedAt: input.receivedAt,
      createdBy: input.createdBy ?? null,
    },
    update: {
      amount,
      contractId: input.contractId ?? null,
      channelId: input.channelId ?? null,
    },
    select: { id: true },
  });

  const total = await db.paymentAllocation.aggregate({
    where: { paymentId: payment.id },
    _sum: { amount: true },
  });
  const paymentTotal = Number(total._sum.amount ?? 0);

  const company = await db.company.findUnique({
    where: { id: input.companyId },
    select: { contractAmount: true },
  });
  const due = Number(company?.contractAmount ?? 0);
  const status = due > 0 && paymentTotal >= due ? "paid" : paymentTotal > 0 ? "partial" : "pending";

  await db.payment.update({
    where: { id: payment.id },
    data: { amount: paymentTotal, status, paymentDate: input.receivedAt },
  });

  return {
    paymentId: payment.id,
    allocationId: allocation.id,
    paymentTotal,
    status,
    supersededManualAmount,
  };
}

/**
 * Moslashtirilgan KIRIMNI hisobga oladi.
 *
 * `Payment` — OYLIK YIG'MA qator (`@@unique([companyId, period])`), uning
 * summasi shu davrdagi barcha `PaymentAllocation` yig'indisidan qayta
 * hisoblanadi. Shuning uchun bitta mijoz oyda bir necha marta, bir necha
 * shartnoma bo'yicha to'lasa ham raqam to'g'ri chiqadi.
 *
 * `KassaEntry` ATAYIN yozilmaydi: lib/balance.ts kirimni Payment'dan ham,
 * KassaEntry'dan ham sanaydi — ikkalasini yozish balansni ikki barobar
 * ko'rsatardi.
 */
export async function postIncomeTransaction(
  db: Db,
  input: {
    transactionId: string;
    companyId: string;
    contractId?: string | null;
    createdBy?: string | null;
  }
): Promise<PostResult> {
  const tx = await db.bankTransaction.findUnique({
    where: { id: input.transactionId },
    select: { id: true, direction: true, amount: true, valueDate: true, status: true },
  });
  if (!tx) throw new Error("Tranzaksiya topilmadi");
  if (tx.direction !== "income") throw new Error("Faqat kirim tranzaksiyasi hisobga olinadi");
  if (tx.status === "posted") throw new Error("Bu tranzaksiya allaqachon hisobga olingan");

  const result = await applyAllocation(db, {
    companyId: input.companyId,
    contractId: input.contractId ?? null,
    amount: tx.amount,
    receivedAt: tx.valueDate,
    source: "bank",
    paymentMethod: "schyot",
    dedupKey: `bank:${tx.id}`,
    bankTransactionId: tx.id,
    createdBy: input.createdBy ?? null,
  });

  await db.bankTransaction.update({
    where: { id: tx.id },
    data: {
      status: "posted",
      matchedCompanyId: input.companyId,
      matchedContractId: input.contractId ?? null,
      postedAt: new Date(),
      postedBy: input.createdBy ?? null,
    },
  });

  return result;
}

// ─────────────────────────────────────────────────────────
// PLASTIK KARTA TUSHUMLARI
// ─────────────────────────────────────────────────────────

export interface PlastikAllocationInput {
  /** 1C hujjat raqami — takrorlanmaslik kaliti. */
  docNumber: string;
  companyId: string;
  amount: number;
  receivedAt: Date;
  counterpartyInn: string | null;
  createdBy?: string | null;
}

/**
 * Plastik karta tushumini mijozning oylik `Payment` qatoriga qo'shadi.
 *
 * Bank tushumi bilan AYNAN bir xil yo'l: `PaymentAllocation` yoziladi va
 * `Payment.amount` taqsimotlar yig'indisidan qayta hisoblanadi. Shu sababli
 * bitta mijoz oyda bankdan ham, plastikdan ham to'lasa — iyulda 4 ta firma
 * shunday qilgan — ikkalasi qo'shiladi va qarz to'g'ri yopiladi.
 *
 * `KassaEntry` ATAYIN yozilmaydi: lib/balance.ts kirimni Payment'dan ham,
 * KassaEntry'dan ham sanaydi, ikkalasi bo'lsa balans ikki barobar ko'rinardi.
 */
export async function allocatePlastikReceipt(
  db: Db,
  input: PlastikAllocationInput
): Promise<PostResult> {
  return applyAllocation(db, {
    companyId: input.companyId,
    amount: input.amount,
    receivedAt: input.receivedAt,
    source: "plastik",
    paymentMethod: "plastik",
    dedupKey: `plastik:${input.docNumber}:${input.counterpartyInn ?? input.companyId}`,
    externalRef: input.docNumber,
    createdBy: input.createdBy ?? null,
  });
}
