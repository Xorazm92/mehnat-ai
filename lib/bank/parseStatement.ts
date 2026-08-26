// Vipiska parserining KIRISH nuqtasi: format aniqlanadi va mos parser chaqiriladi.
//
// Tanilmagan fayl JIM YUTILMAYDI. Bo'sh natija qaytarish eng yomon xatti-harakat
// bo'lardi: Ruslan faylni yuklaydi, "0 ta tranzaksiya" ko'radi va uni fayl
// bo'sh deb o'ylaydi — aslida parser formatni tanimagan bo'ladi.

import { createHash } from "node:crypto";
import { BankStatementParseError, type ParsedStatement, type SheetRow, type Workbook } from "./types";
import { isLitsevoyFormat, parseLitsevoy, readStatementHeader } from "./parseLitsevoy";
import { isSvedeniyaFormat, parseSvedeniya } from "./parseSvedeniya";
import { looksLikeHamkorbank, parseHamkorbankWorkbook } from "./parseHamkorbank";

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
    let parsed: ParsedStatement;
    try {
      parsed = parseStatementRows(rows);
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}`);
      continue;
    }

    // Ba'zi eksportlarda sarlavha bloki BOSHQA SAHIFADA bo'ladi: "Sheet1" da
    // hisob raqami va davr, "Sheet2" da tranzaksiyalar. Bunday faylda hisob
    // topilmay, vipiskani hech qaysi hisobga bog'lab bo'lmasdi — shuning
    // uchun yetishmagan qismi qolgan sahifalardan to'ldiriladi.
    if (!parsed.accountNumber || !parsed.periodFrom) {
      for (const [otherName, otherRows] of sheets) {
        if (otherName === name) continue;
        const header = readStatementHeader(otherRows);
        parsed.accountNumber ??= header.accountNumber;
        parsed.accountInn ??= header.accountInn;
        parsed.holderName ??= header.holderName;
        parsed.periodFrom ??= header.periodFrom;
        parsed.periodTo ??= header.periodTo;
        parsed.openingBalance ??= header.openingBalance;
        if (parsed.accountNumber && parsed.periodFrom) break;
      }
    }

    return withSanityChecks(parsed);
  }

  // ── ZAXIRA: Hamkorbank ko'p sahifali eksporti ────────────────────────
  //
  // Bu eksportda sarlavha bitta sahifada, tranzaksiya jadvali boshqasida —
  // sahifa-ma-sahifa loop uni to'liq o'qiy olmaydi, shuning uchun butun
  // kitob darajasidagi alohida parser kerak.
  //
  // MUHIM — U ZAXIRA, BIRINCHI EMAS. Ilgari bu tekshiruv loopdan OLDIN
  // turardi, `looksLikeHamkorbank` esa faqat "Оборот Дебет" + "Оборот
  // Кредит" sarlavhasini qidiradi. Ammo bu ikki so'z ODDIY bitta sahifali
  // "Сведения о работе счета" vipiskasida ham bor. Natijada har bir oddiy
  // Hamkorbank vipiskasi ko'p sahifali parserga yo'naltirilardi, u esa
  // sarlavhani boshqa sahifadan qidirib topolmay
  //     "Hamkorbank jadvalida tranzaksiya topilmadi"
  // deb tashlardi — ya'ni ENG KENG TARQALGAN vipiska formati umuman
  // import qilinmasdi. `parseStatement.spec.ts` buni ushlab turgan edi
  // (`parseWorkbook` testi qizil), lekin `parseStatementRows` to'g'ridan
  // chaqirilgani uchun qolgan testlar yashil bo'lib, xato e'tibordan
  // chetda qolgan.
  //
  // Endi tartib to'g'ri: avval sinalgan sahifa parserlari, ular hech
  // narsa bera olmasa — kitob darajasidagi zaxira.
  if (looksLikeHamkorbank(workbook)) {
    try {
      return withSanityChecks(parseHamkorbankWorkbook(workbook));
    } catch (e) {
      errors.push(`Hamkorbank (ko'p sahifali): ${(e as Error).message}`);
    }
  }

  throw new BankStatementParseError(
    `Hech bir sahifadan vipiska o'qib bo'lmadi.\n${errors.join("\n")}`
  );
}

/**
 * Ishonchlilik tekshiruvi.
 *
 * Eng xavflisi — SANA. U ikki ko'rinishda keladi (matn va Excel serial) va
 * agar serial noto'g'ri talqin qilinsa, tranzaksiya boshqa oyga tushadi:
 * `Payment.period` xato bo'lib, mijozning qarzi noto'g'ri hisoblanadi. Bunday
 * xato JIM o'tib ketmasligi kerak, shuning uchun sanalar vipiska davri bilan
 * solishtiriladi.
 */
function withSanityChecks(parsed: ParsedStatement): ParsedStatement {
  const warnings: string[] = [];

  if (parsed.periodFrom && parsed.periodTo && parsed.transactions.length > 0) {
    // Chekkada bir kun zaxira: bank ba'zan davr chegarasidagi operatsiyani
    // qo'shni kunga yozadi.
    const from = parsed.periodFrom.getTime() - 86_400_000;
    const to = parsed.periodTo.getTime() + 2 * 86_400_000;
    const outside = parsed.transactions.filter(
      (t) => t.valueDate.getTime() < from || t.valueDate.getTime() > to
    );
    if (outside.length > 0) {
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      warnings.push(
        `${outside.length} ta tranzaksiya sanasi vipiska davridan tashqarida ` +
          `(davr: ${iso(parsed.periodFrom)} — ${iso(parsed.periodTo)}, ` +
          `masalan: ${iso(outside[0].valueDate)}). ` +
          `Sana noto'g'ri o'qilgan bo'lishi mumkin — tasdiqlashdan oldin tekshiring.`
      );
    }
  }

  if (parsed.transactions.length === 0) {
    warnings.push("Faylda birorta ham tranzaksiya topilmadi.");
  }

  return warnings.length > 0 ? { ...parsed, warnings } : parsed;
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
