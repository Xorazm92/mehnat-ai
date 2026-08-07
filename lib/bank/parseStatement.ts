// Vipiska parserining KIRISH nuqtasi: format aniqlanadi va mos parser chaqiriladi.
//
// Tanilmagan fayl JIM YUTILMAYDI. Bo'sh natija qaytarish eng yomon xatti-harakat
// bo'lardi: Ruslan faylni yuklaydi, "0 ta tranzaksiya" ko'radi va uni fayl
// bo'sh deb o'ylaydi — aslida parser formatni tanimagan bo'ladi.

import { createHash } from "node:crypto";
import { BankStatementParseError, type ParsedStatement, type SheetRow, type Workbook } from "./types";
import { isLitsevoyFormat, parseLitsevoy } from "./parseLitsevoy";
import { isSvedeniyaFormat, parseSvedeniya } from "./parseSvedeniya";

export * from "./types";
export { extractContract, parseContractCell } from "./extractContract";
export {
  classifyExpense,
  isPostableExpense,
  EXPENSE_CATEGORY_LABELS,
  NON_POSTABLE_CATEGORIES,
  type ExpenseCategory,
  extractCardTransfer,
} from "./classifyExpense";

/** Sahifadagi qatorlardan vipiskani o'qiydi. */
export function parseStatementRows(rows: SheetRow[]): ParsedStatement {
  if (!rows || rows.length === 0) {
    throw new BankStatementParseError("Faylda ma'lumot yo'q");
  }
  if (isSvedeniyaFormat(rows)) return parseSvedeniya(rows);
  if (isLitsevoyFormat(rows)) return parseLitsevoy(rows);

  throw new BankStatementParseError(
    "Vipiska formati tanilmadi. Qo'llab-quvvatlanadigan formatlar: " +
      '"Лицевой счет" va "Сведения о работе счета".'
  );
}

/**
 * Kitobdan (barcha sahifalar) vipiskani o'qiydi — birinchi mos sahifa olinadi.
 * Vipiska eksportlari odatda bitta sahifali, lekin sahifa nomi har xil
 * (epoch-ms raqami, bank nomi, "TDSheet"), shuning uchun nom bo'yicha
 * qidirilmaydi — mazmun bo'yicha.
 */
export function parseWorkbook(workbook: Workbook): ParsedStatement {
  const sheets = Object.entries(workbook);
  if (sheets.length === 0) throw new BankStatementParseError("Faylda sahifa yo'q");

  const errors: string[] = [];
  for (const [name, rows] of sheets) {
    try {
      return parseStatementRows(rows);
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}`);
    }
  }
  throw new BankStatementParseError(
    `Hech bir sahifadan vipiska o'qib bo'lmadi.\n${errors.join("\n")}`
  );
}

/**
 * Dublikat qalqoni. Xuddi shu vipiskani qayta yuklash yangi qator hosil
 * qilmasligi kerak — `BankTransaction.rawHash` unikal.
 *
 * Hisobga olinadi: qaysi hisob, sana, hujjat raqami, summa, yo'nalish va
 * to'lov maqsadi. Bank bir kunda bir xil summani ikki marta o'tkazsa, ular
 * hujjat raqami bilan farqlanadi.
 */
export function transactionHash(input: {
  accountNumber: string;
  valueDate: Date;
  docNumber: string | null;
  amount: number;
  direction: string;
  purpose: string | null;
}): string {
  const parts = [
    input.accountNumber,
    input.valueDate.toISOString().slice(0, 10),
    input.docNumber ?? "",
    input.amount.toFixed(2),
    input.direction,
    (input.purpose ?? "").replace(/\s+/g, " ").trim(),
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
