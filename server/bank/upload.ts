"use server";

// =====================================================
// BANK VIPISKASI — FAYLNI YUKLASH
// =====================================================
//
// Ikki qadam: `previewStatement` faylni O'QIYDI va nima kelayotganini
// ko'rsatadi, `commitStatementUpload` esa tasdiqdan keyin `BankTransaction`
// qatorlarini yozadi va avto-moslashtirishni ishga tushiradi.
//
// Parser qarori `lib/bank/` da (sof, Prisma'siz) — bu yerda faqat auth,
// hisobni topish va bazaga yozish. Plastik reestri o'qish shartnomasini
// baham ko'radi, lekin YOZISH yo'li alohida: u `BankTransaction` yaratmaydi.

import { prisma } from "@/lib/prisma";
import { resolveOwnAccountChannel } from "./ownAccountChannel";
import { requireStatementRole } from "@/server/guards";
import { revalidatePath } from "next/cache";
import { recordAuditLog } from "@/lib/platform/auditTrail";
import { assertPeriodOpen } from "@/lib/periodLock";
import { parseWorkbook, transactionHash } from "@/lib/bank/parseStatement";
import { readWorkbook } from "@/lib/bank/readWorkbook";
import { extractContract } from "@/lib/bank/extractContract";
import { commitStatement, autoMatchTransactions, postIncomeTransaction, allocatePlastikReceipt, periodOf } from "@/lib/bank/importStatement";
import { BankStatementParseError } from "@/lib/bank/types";
import type { ParsedStatement, StatementPreview, Workbook } from "@/lib/bank/types";

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

  let parsed: ParsedStatement;
  try {
    parsed = parseWorkbook(workbook);
  } catch (e) {
    // Fayl tarkibi dumpi FAQAT format umuman tanilmaganda beriladi. Tanilgan
    // formatdagi aniq xato ("Итого mos kelmadi") o'z holicha ko'rsatiladi —
    // aks holda harakatga chorlovchi xabar diagnostika matni ostida qoladi.
    const unrecognized = e instanceof BankStatementParseError ? e.unrecognized : true;
    if (!unrecognized) return { ok: false, error: (e as Error).message };
    return {
      ok: false,
      error:
        `${(e as Error).message}\n\n` +
        `Kutilgani — bank vipiskasi ("Лицевой счет" yoki "Сведения о работе счета") ` +
        `yoki 1C "Реализация" reestri.\n\n` +
        `FAYL TARKIBI (shu matnni ishlab chiquvchiga yuboring):\n${describeWorkbook(workbook)}`,
    };
  }

  // 1C reestri (plastik) — o'qish shartnomasi umumiy, lekin ko'rsatish yo'li
  // alohida: hisob raqami yo'q va dublikat qalqoni `BankTransaction` hash'iga
  // tayanadi, plastik esa `BankTransaction` yaratmaydi.
  if (parsed.format === "plastik") {
    return {
      ok: true,
      data: {
        format: "plastik",
        accountNumber: null,
        accountLabel: "Plastik karta (1C reestri)",
        accountId: null,
        periodFrom: parsed.periodFrom?.toISOString() ?? null,
        periodTo: parsed.periodTo?.toISOString() ?? null,
        incomeCount: parsed.transactions.length,
        incomeSum: parsed.transactions.reduce((sum, t) => sum + t.amount, 0),
        expenseCount: 0,
        expenseSum: 0,
        duplicateCount: 0,
        unknownAccount: false,
        sample: parsed.transactions.slice(0, 40).map((t) => ({
          valueDate: t.valueDate.toISOString(),
          docNumber: t.docNumber,
          direction: "income",
          amount: t.amount,
          counterpartyName: t.counterpartyName,
          counterpartyInn: t.counterpartyInn,
          contractHint: null,
        })),
      },
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
  /**
   * AVTO-HISOBGA OLGANLAR — STIR bilan bir xil topilib, darhol taqsimot
   * yozilganlari. Ilgari match faqat BELGI qo'yardi: qator "matched" bo'lib
   * navbatdan yo'qolardi, lekin pul hech qayerga yozilmasdi — vipiska kirdi,
   * qarz va balans jim turaverdi.
   */
  posted: number;
  postedAmount: number;
  /** Hisobga olishda yiqilgan qatorlar (davr qulfi kabi) — ekranda ko'rsatiladi. */
  postErrors: string[];
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

  let parsed: ParsedStatement;
  try {
    parsed = parseWorkbook(workbook);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // ── 1C reestri (plastik karta tushumlari) ────────────────────────────
  //
  // O'qish shartnomasi umumiy (`ParsedStatement`), YOZISH yo'li alohida:
  // plastik tushumi bank hisobiga tushmaydi, `BankTransaction` yaratmaydi va
  // to'g'ridan-to'g'ri `PaymentAllocation` yozadi.
  if (parsed.format === "plastik") {
    const receipts = parsed.transactions;
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
      // `docNumber` — `allocatePlastikReceipt` ning idempotentlik kaliti.
      // Parser uni hech qachon bo'sh qoldirmaydi (qator tartibidan zaxira
      // kalit yasaydi), lekin kalitsiz qatorni JIM yozish qayta yuklashda
      // dublikat tushum hosil qilardi — shuning uchun aniq to'sib qo'yiladi.
      if (!r.docNumber) {
        skipped++;
        continue;
      }
      await allocatePlastikReceipt(prisma, {
        docNumber: r.docNumber,
        companyId: hits[0].id,
        amount: r.amount,
        receivedAt: r.valueDate,
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
        // Plastik yo'li allaqachon TO'G'RIDA taqsimot yozadi (allocatePlastikReceipt).
        posted: added,
        postedAmount: 0,
        postErrors: [],
      },
    };
  }

  // ── Bank vipiskasi ───────────────────────────────────────────────────
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

  // ── AVTO-HISOBGA OLISH ─────────────────────────────────────────────────
  // STIR bilan YAKKA firmaga mos kelgan har kirim darhol taqsimotga yoziladi
  // — qo'lda "Hisobga olish" tugmasi bosilgandagi AYNAN bir yo'l
  // (`postIncomeTransaction`). Shu bo'lmaganda vipiska "kirdi", lekin qarz,
  // balans va to'lovlar jurnali umuman o'zgarmasdi.
  let posted = 0;
  let postedAmount = 0;
  const postErrors: string[] = [];
  const matchedRows = await prisma.bankTransaction.findMany({
    where: { importId: result.importId, direction: "income", status: "matched" },
    select: { id: true, matchedCompanyId: true, matchedContractId: true },
  });
  for (const row of matchedRows) {
    if (!row.matchedCompanyId) continue;
    try {
      const txRow = await prisma.bankTransaction.findUnique({
        where: { id: row.id },
        select: { valueDate: true, account: { select: { ownerCompanyId: true } } },
      });
      if (txRow) {
        await assertPeriodOpen(prisma, periodOf(txRow.valueDate), "bank kirimi");
      }
      const res = await postIncomeTransaction(prisma, {
        transactionId: row.id,
        companyId: row.matchedCompanyId!,
        contractId: row.matchedContractId,
        createdBy: userId,
        // Kirim aniq manbaga tushadi (vipiska hisobi → firma kanali).
        channelId: txRow
          ? await resolveOwnAccountChannel(txRow.account.ownerCompanyId)
          : null,
      });
      posted++;
      postedAmount += res.paymentTotal;
    } catch (e) {
      // Bir qator yiqilsa butun yuklama to'xtamasin — qator "matched" holatda
      // qoladi va xato matni foydalanuvchiga ko'rsatiladi.
      postErrors.push((e as Error).message);
    }
  }

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
      autoPosted: posted,
      autoPostedAmount: postedAmount,
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
      posted,
      postedAmount,
      postErrors: postErrors.slice(0, 5),
    },
  };
}
