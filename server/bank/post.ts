"use server";

// =====================================================
// BANK VIPISKASI — HISOBGA OLISH (pul harakati)
// =====================================================
//
// Bu faylning har bir funksiyasi PULNI QIMIRLATADI: `PaymentAllocation`,
// `KassaEntry`, `TransitEntry` va jurnal oyoqlari. Shuning uchun hammasi
// `lib/cashGate.ts` (`runCashTx` / `recordKassaMovement`) va
// `lib/bank/importStatement.ts` orqali o'tadi — to'g'ridan-to'g'ri
// `prisma.kassaEntry.create` YOZILMAYDI.
//
// Bu yerga qo'lda kiritilgan tushum ham kiradi (`recordManualReceipt`):
// manbasi boshqa, lekin yakuni bir xil — taqsimot va jurnal yozuvi.

import { prisma } from "@/lib/prisma";
import { resolveOwnAccountChannel } from "./ownAccountChannel";
import { requireStatementRole, requireKassa } from "@/server/guards";
import { revalidatePath } from "next/cache";
import { serialize } from "@/lib/serialize";
import { recordAuditLog } from "@/lib/platform/auditTrail";
import { assertPeriodOpen } from "@/lib/periodLock";
import { recordKassaMovement, runCashTx } from "@/lib/cashGate";
import { ACCOUNTS } from "@/lib/ledger";
import { EXPENSE_CATEGORY_LABELS, isPostableExpense, type ExpenseCategory } from "@/lib/bank/classifyExpense";
import { ignorableRejectionReason } from "@/lib/bank/expenseQueue";
import { autoMatchTransactions, postIncomeTransaction, applyAllocation, periodOf } from "@/lib/bank/importStatement";
import { assertFundingSource } from "@/server/fundingSources";
import { Prisma } from "@prisma/client";

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
    select: { valueDate: true, direction: true, account: { select: { ownerCompanyId: true } } },
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
    // Kirim ham aniq manbaga tushadi — vipiska hisobining firmasi.
    channelId: await resolveOwnAccountChannel(tx.account.ownerCompanyId),
  });

  revalidatePath("/kassa/kirim");
  revalidatePath("/kassa");
  return serialize(res);
}

// ─────────────────────────────────────────────────────────
// VIPISKADAN CHIQIM YOZISH — navbatdagi qator haqiqatda chiqim bo'lsa
// ─────────────────────────────────────────────────────────

/**
 * Navbatdagi bank qatorini XARAJAT sifatida yozadi.
 *
 * REAL HOLAT. Vipiska qatorlari ba'zan "kirim" deb belgilanadi, lekin
 * hayotda boshqa bo'ladi: xodimga oylik o'tkazma (Laylo, Mardon…), firmalararo
 * yordam va h.k. Bunday qator uchun ilgari YAGONA amal bor edi — "firmaga
 * bog'lash" — ya'ni buxgalter uni umuman yopib bilmagan va navbat abadiy
 * to'lib turardi.
 *
 * Bu action KassaEntry(expense) + jurnal yozadi (`cashGate` — yagona yo'l,
 * balans tekshiruvi bilan) va bank qatorini navbatdan chiqaradi.
 * `dedupKey = "bank-expense:<txId>"` — ikki marta bosish ikki chiqim
 * yozmaydi.
 */
export async function postExpenseFromBankTransaction(input: {
  transactionId: string;
  category: string;
  description?: string | null;
  /**
   * Oylik — `SALARY_EXPENSE` hisobiga yoziladi. OPERATSION hisobga "oylik"
   * toifasi cashGate tomonidan bloklanadi (ikki marta sanalmasligi uchun).
   */
  isSalary?: boolean;
}) {
  const actor = await requireStatementRole();

  const tx = await prisma.bankTransaction.findUnique({
    where: { id: input.transactionId },
    select: {
      id: true, amount: true, valueDate: true, status: true,
      counterpartyName: true, purpose: true,
      account: { select: { accountNumber: true, label: true, ownerCompanyId: true } },
    },
  });
  if (!tx) throw new Error("Tranzaksiya topilmadi");
  if (tx.status === "posted") throw new Error("Bu tranzaksiya allaqachon hisobga olingan");

  // Pul QAYSI kassadan chiqgani — vipiska hisobining firmasi manba bo'ladi.
  const channelId = await resolveOwnAccountChannel(tx.account.ownerCompanyId);

  const category = input.category.trim();
  if (!category) throw new Error("Toifani tanlang");

  await assertPeriodOpen(prisma, periodOf(tx.valueDate), "vipiska chiqimi");

  const description =
    input.description?.trim() ||
    [tx.counterpartyName, tx.purpose].filter(Boolean).join(" · ") ||
    null;
  const entry = await runCashTx((db) =>
    recordKassaMovement(db, { kind: "user", userId: actor.userId, role: actor.role }, {
      type: "expense",
      category,
      amount: Number(tx.amount),
      date: tx.valueDate,
      description,
      channelId,
      dedupKey: `bank-expense:${tx.id}`,
      expenseAccount: input.isSalary ? ACCOUNTS.SALARY_EXPENSE : ACCOUNTS.OPERATING_EXPENSE,
    })
  );

  await prisma.bankTransaction.update({
    where: { id: tx.id },
    data: {
      status: "ignored",
      ignoredReason: `Chiqim sifatida yozildi (${category}, KassaEntry ${entry.id})`,
    },
  });

  await recordAuditLog({
    userId: actor.userId,
    action: "create",
    tableName: "KassaEntry",
    recordId: entry.id,
    newData: {
      source: "BankTransaction",
      bankTransactionId: tx.id,
      category,
      amount: Number(tx.amount),
      isSalary: !!input.isSalary,
    },
  });

  revalidatePath("/kassa/kirim");
  revalidatePath("/kassa/chiqim");
  return serialize({ id: entry.id, alreadyRecorded: entry.alreadyRecorded });
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
  /** naqd/plastik/bank uchun majburiy — pul qaysi kanalga tushdi. "offset" uchun keraksiz. */
  channelId?: string | null;
  /** naqd | plastik | bank | offset (vzaimozachyot/ijara — kassaga tushmaydi) */
  source: string;
  amount: number;
  receivedAt: Date;
  /** Chek yoki hujjat raqami. */
  docRef?: string | null;
  note?: string | null;
}

const MANUAL_SOURCES = new Set(["naqd", "plastik", "bank"]);
/** offset — firma majburiy, kanal esa ma'nosiz (pul hech qayerga tushmaydi). */
const OFFSET_SOURCE = "offset";

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
  const { userId, role } = await requireStatementRole();

  const isOffset = input.source === OFFSET_SOURCE;
  if (!MANUAL_SOURCES.has(input.source) && !isOffset) {
    throw new Error("To'lov turi noto'g'ri: naqd, plastik, bank yoki offset bo'lishi kerak");
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Summa musbat bo'lishi kerak");
  }
  // Offset pul hech qayerga tushmaydi — kanal tanlashning ma'nosi yo'q,
  // shuning uchun tekshirilmaydi (aks holda naqd/bank kabi kanal talab qilinardi).
  if (isOffset) {
    if (!input.companyId) {
      throw new Error("Offset (vzaimozachyot) faqat firmaga bog'liq holda kiritiladi");
    }
  } else {
    if (!input.channelId) throw new Error("Pul manbai (kanal) tanlanishi shart");
    await assertFundingSource(input.channelId);
  }
  await assertPeriodOpen(prisma, input.receivedAt, "kassa kirimi");

  // Nomsiz tushum — mijozga bog'lanmagan, qarzga ta'sir qilmaydi.
  //
  // DARVOZA ORQALI (`lib/cashGate.ts`). Ilgari bu yerda to'g'ridan-to'g'ri
  // `prisma.kassaEntry.create` turardi va JURNALGA HECH NARSA YOZILMASDI:
  // jadval balansi (`lib/balance.ts` kirimni `KassaEntry` dan ham sanaydi)
  // o'sardi, jurnal CASH qoldig'i esa joyida qolardi. Ya'ni har bir nomsiz
  // naqd/plastik tushum ikki haqiqat orasidagi tafovutni kengaytirardi va
  // "pul qaysi kassada" hisoboti (`server/kassaReport.ts`, u FAQAT jurnaldan
  // o'qiydi) o'sha pulni umuman ko'rmasdi.
  //
  // Darvoza manba qatorini va ikki tomonlama yozuvni BITTA Serializable
  // tranzaksiyada yozadi, `dedupKey` ni esa idempotentlik uchun ishlatadi:
  // formani ikki marta yuborish endi ikkinchi qator yaratmaydi.
  if (!input.companyId) {
    const res = await runCashTx((db) =>
      recordKassaMovement(
        db,
        { kind: "user", userId, role },
        {
          type: "income",
          category: input.source === "naqd" ? "Naqd tushum" : "Plastik tushum",
          amount,
          date: input.receivedAt,
          description: input.note?.trim() || null,
          channelId: input.channelId ?? null,
          dedupKey: manualDedupKey({ ...input, companyId: null, amount }),
        }
      )
    );
    if (!res.alreadyRecorded) {
      await recordAuditLog({
        userId,
        action: "create",
        tableName: "KassaEntry",
        recordId: res.id,
        newData: { source: input.source, amount, anonymous: true },
      });
    }
    revalidatePath("/kassa/kirim");
    revalidatePath("/kassa");
    return serialize({ kind: "anonymous" as const, entryId: res.id });
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
    paymentMethod: input.source === "bank" ? "schyot" : isOffset ? "boshqa" : input.source,
    dedupKey: manualDedupKey({ ...input, amount }),
    externalRef: input.docRef?.trim() || null,
    channelId: isOffset ? null : (input.channelId ?? null),
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
/**
 * Bank hisobi → KASSA MANBASI (DisbursementChannel) xaritasi.
 *
 * Vipiskadan yozilgan HAR chiqim aniq bir manbadan chiqqan: qaysi hisobdan
 * bo'lsa, o'sha firmaning manbasi. Buni bog'lamasak summa faqat umumiy
 * balansdan ayirilib, manba ichki qoldig'i o'zgarmasdan qolardi.
 * Kalit: kanal.ownFirmId === account.ownerCompanyId (bir firma — bir manba).
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
        // Manba AVTOMATIK: pul qaysi hisobdan chiqqan bo'lsa, o'sha
        // firmaning kassasi. Qo'lda berilgan channelId ustuvor.
        channelId: input.channelId ?? (await resolveOwnAccountChannel(tx.account.ownerCompanyId)),
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
 * KARTAGA O'TKAZMA = OYLIK (vipiska-only model).
 *
 * REAL JARAYON: firma hisobidan o'zini-o'zi band shaxsga pul chiqadi, u esa
 * o'z yo'lida boshqa plastiklarga oylik taratadi / ta'sischiga beradi.
 * Korxona uchun xarajat payti — pul HISOBDAN CHIQQANDA. Shu sababli
 * "kartaga o'tkazma" guruhidagi qator endi tranzit kanalga bog'lanmaydi,
 * balki darhol SALARY_EXPENSE xarajati sifatida yoziladi. Tizimga kirish
 * faqat klient-bank vipiskasi orqali — boshqa manba yo'q.
 */
export async function postSalaryFromTransaction(input: { transactionId: string }) {
  const { userId } = await requireKassa();

  const tx = await prisma.bankTransaction.findUnique({
    where: { id: input.transactionId },
    select: {
      id: true, direction: true, amount: true, valueDate: true,
      purpose: true, counterpartyName: true, kassaEntryId: true,
      account: { select: { ownerCompanyId: true } },
    },
  });
  if (!tx) throw new Error("Tranzaksiya topilmadi");
  if (tx.direction !== "expense") throw new Error("Bu chiqim tranzaksiyasi emas");
  if (tx.kassaEntryId) throw new Error("Bu chiqim allaqachon kassaga yozilgan");

  const description =
    [tx.counterpartyName, tx.purpose?.slice(0, 120)].filter(Boolean).join(" — ") || "Oylik";

  const entry = await runCashTx(async (db) => {
    const created = await recordKassaMovement(
      db,
      { kind: "import", source: "bank", userId },
      {
        type: "expense",
        category: "Oylik",
        amount: Number(tx.amount),
        date: tx.valueDate,
        description,
        companyId: tx.account.ownerCompanyId,
        channelId: await resolveOwnAccountChannel(tx.account.ownerCompanyId),
        dedupKey: `bank:${tx.id}`,
        expenseAccount: ACCOUNTS.SALARY_EXPENSE,
      }
    );
    await db.bankTransaction.update({
      where: { id: tx.id },
      data: {
        kassaEntryId: created.id,
        expenseCategory: "oylik",
        status: "posted",
        postedAt: new Date(),
        postedBy: userId,
      },
    });
    return created;
  });

  revalidatePath("/kassa/chiqim");
  revalidatePath("/kassa");
  return serialize({ kassaEntryId: entry.id });
}

/** Bir chaqiruvda navbatdagi N ta kartaga-otkazmani oylik sifatida yozish. */
export async function postOylikBulk(input: { limit?: number }): Promise<{
  posted: number; failed: number; remaining: number; firstError: string | null;
}> {
  await requireKassa();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);

  const rows = await prisma.bankTransaction.findMany({
    where: {
      direction: "expense", status: "unmatched", expenseCategory: "xodim_kartasi",
      kassaEntryId: null,
    },
    select: { id: true },
    orderBy: { valueDate: "asc" },
    take: limit + 1,
  });
  const batch = rows.slice(0, limit);
  const remaining = Math.max(0, rows.length - batch.length);

  let posted = 0;
  let failed = 0;
  let firstError: string | null = null;
  for (const r of batch) {
    try {
      await postSalaryFromTransaction({ transactionId: r.id });
      posted++;
    } catch (e) {
      failed++;
      firstError ??= (e as Error).message;
    }
  }
  return serialize({ posted, failed, remaining, firstError });
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
