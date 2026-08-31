// FORMAT A — "Лицевой счет" (10 vipiskadan 9 tasi shu ko'rinishda).
//
// Bu formatning asosiy qiyinligi: BITTA TRANZAKSIYA 3–4 QATORDA yoziladi.
//
//   qator 1: 02.07.2026 | 20 | 21 | МФО:00440 Счет:2020... ИНН:207189989 | 0 | 1,000,000.00
//   qator 2: 12:27:34   |    |    | ООО "MAGISTRAL TRANS QURILISH"        |   |
//   qator 3:            |    |    | 00111оплата за бух услуги сог дог №02/26БК ... |
//
// Ya'ni: 1-ustunda sana bo'lsa — yangi tranzaksiya boshlandi; keyingi
// qatorlarda 4-ustundagi matn avval KONTRAGENT NOMI, keyin TO'LOV MAQSADI.
// Maqsad bir necha qatorga bo'linishi mumkin, shuning uchun u yig'iladi.
//
// Summalar matn ko'rinishida keladi ("1,000,000.00"), Дебет/Кредит alohida
// ustunda: Дебет — pul chiqdi, Кредит — pul tushdi.

import {
  BankStatementParseError,
  type ParsedStatement,
  type ParsedTransaction,
  type SheetRow,
} from "./types";
import {
  cleanText,
  extractAccount,
  extractInn,
  looksLikeDate,
  toAmount,
  toDate,
} from "./normalize";

/** Sarlavha qatori shu qiymat bilan aniqlanadi. */
const HEADER_MARKER = "Дата/время";

const PERIOD_RE = /с\s*(\d{2}\.\d{2}\.\d{4})\s*по\s*(\d{2}\.\d{2}\.\d{4})/i;

/**
 * Sarlavha katagi ikki ko'rinishda keladi:
 *   "Дата/время"                (Excel eksporti — alohida qator)
 *   "Дата/время\nпроводки"      (HTML eksporti — bitta katakda ikki satr)
 * Shuning uchun aniq tenglik emas, boshlanishi tekshiriladi.
 */
const isHeaderCell = (value: unknown): boolean =>
  typeof value === "string" && value.trim().startsWith(HEADER_MARKER);

export function isLitsevoyFormat(rows: SheetRow[]): boolean {
  return rows.some((r) => isHeaderCell(Object.values(r)[0]));
}

export interface StatementHeader {
  accountNumber: string | null;
  accountInn: string | null;
  holderName: string | null;
  periodFrom: Date | null;
  periodTo: Date | null;
  openingBalance: number | null;
}

/**
 * Vipiska sarlavhasi (hisob, STIR, egasi, davr, ochilish qoldig'i).
 *
 * ALOHIDA funksiya, chunki ba'zi eksportlarda sarlavha bloki bilan
 * tranzaksiyalar HAR XIL SAHIFADA bo'ladi: "Sheet1" da hisob ma'lumoti,
 * "Sheet2" da qatorlar. Bunda tranzaksiya sahifasida hisob raqami
 * topilmaydi va vipiskani hech qaysi hisobga bog'lab bo'lmasdi.
 */
/**
 * Sarlavhaning birinchi qatorida ko'pincha fayl yaratilgan vaqt turadi
 * ("07 августа 2026 г. 17:26") — u hisob EGASI emas. Xizmat matnlari va
 * sana/vaqtga o'xshash qiymatlar chetlatiladi.
 */
function isHolderName(text: string): boolean {
  if (/выписка|дата|проводки|наименование|назначение|остаток|период|клиент|счет/i.test(text)) {
    return false;
  }
  // "07 августа 2026 г. 17:26" yoki "01.08.2026 12:10"
  if (/\d{1,2}[\s.]\S+[\s.]\d{4}/.test(text) && /\d{1,2}:\d{2}/.test(text)) return false;
  if (/^\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4}/.test(text)) return false;
  return true;
}

export function readStatementHeader(rows: SheetRow[]): StatementHeader {
  const result: StatementHeader = {
    accountNumber: null,
    accountInn: null,
    holderName: null,
    periodFrom: null,
    periodTo: null,
    openingBalance: null,
  };
  if (rows.length === 0) return result;

  const columns = Object.keys(rows[0]);
  for (const row of rows) {
    // Sarlavha ma'lumoti odatda 1-ustunda, lekin har doim ham emas.
    for (const [index, key] of columns.entries()) {
      const text = cleanText(row[key]);
      if (!text) continue;

      if (/Лицевой счет/i.test(text)) {
        result.accountNumber = extractAccount(text) ?? result.accountNumber;
      } else if (/Клиент\s*:/i.test(text)) {
        result.accountInn = extractInn(text) ?? result.accountInn;
      } else if (/Период выписки/i.test(text)) {
        const m = PERIOD_RE.exec(text);
        if (m) {
          result.periodFrom = toDate(m[1]);
          result.periodTo = toDate(m[2]);
        }
      } else if (/Входящий остаток/i.test(text)) {
        // Qoldiq odatda "Дебет" ustunida (5-ustun), lekin qatordagi
        // oxirgi songa ham tayanamiz.
        const candidate = columns.slice(index + 1).map((c) => row[c]).find((v) => toAmount(v) !== 0);
        result.openingBalance = toAmount(candidate);
      } else if (!result.holderName && index === 0 && isHolderName(text)) {
        result.holderName = text;
      }
    }
  }
  return result;
}

export function parseLitsevoy(rows: SheetRow[]): ParsedStatement {
  if (rows.length === 0) throw new BankStatementParseError("Vipiska bo'sh");

  const columns = Object.keys(rows[0]);
  if (columns.length < 6) {
    throw new BankStatementParseError(
      `"Лицевой счет" formatida kamida 6 ustun kutilgan, ${columns.length} ta topildi`
    );
  }
  const [colDate, colDoc, colOp, colParty, colDebit, colCredit] = columns;

  const headerIndex = rows.findIndex((r) => isHeaderCell(r[colDate]));
  if (headerIndex === -1) {
    throw new BankStatementParseError(`Sarlavha qatori ("${HEADER_MARKER}") topilmadi`);
  }

  // Sarlavha bloki shu sahifaning yuqorisida bo'lishi mumkin; bo'lmasa
  // chaqiruvchi (parseWorkbook) uni boshqa sahifadan to'ldiradi.
  const header = readStatementHeader(rows.slice(0, headerIndex));

  // ── Tranzaksiyalar ─────────────────────────────────────────────────────
  const transactions: ParsedTransaction[] = [];
  let current: {
    tx: ParsedTransaction;
    /** Kontragent nomi olindimi (keyingi matnlar — to'lov maqsadi). */
    haveName: boolean;
    purposeParts: string[];
  } | null = null;

  const flush = () => {
    if (!current) return;
    const purpose = current.purposeParts.join(" ").replace(/\s+/g, " ").trim();
    current.tx.purpose = purpose.length > 0 ? purpose : null;
    transactions.push(current.tx);
    current = null;
  };

  for (const row of rows.slice(headerIndex + 1)) {
    // "05.08.2026\n11:05:01" — sana va vaqt bitta katakda bo'lishi mumkin.
    const rawDateCell = row[colDate];
    const dateCell =
      typeof rawDateCell === "string" ? rawDateCell.split("\n")[0].trim() : rawDateCell;

    if (looksLikeDate(dateCell)) {
      flush();
      const valueDate = toDate(dateCell);
      if (!valueDate) continue;

      const debit = toAmount(row[colDebit]);
      const credit = toAmount(row[colCredit]);
      // Nol summali qator — yakuniy "Итого" kabi xizmat qatori; tashlanadi.
      if (debit === 0 && credit === 0) continue;

      // HTML eksportida kontragent, nomi va to'lov maqsadi BITTA katakda,
      // satr tashlash bilan ajratilgan. Excel eksportida esa ular keyingi
      // qatorlarda keladi. Ikkalasi ham qo'llab-quvvatlanadi.
      const partyRaw = typeof row[colParty] === "string" ? (row[colParty] as string) : "";
      const partyLines = partyRaw.split("\n").map((l) => l.trim()).filter(Boolean);
      const partyCell = partyLines[0] ?? row[colParty];
      const inlineName = partyLines.length > 1 ? partyLines[1] : null;
      const inlinePurpose = partyLines.length > 2 ? partyLines.slice(2).join(" ") : null;

      current = {
        tx: {
          valueDate,
          docNumber: cleanText(row[colDoc]),
          opCode: cleanText(row[colOp]),
          direction: credit > 0 ? "income" : "expense",
          amount: credit > 0 ? credit : debit,
          counterpartyInn: extractInn(partyCell),
          counterpartyAccount: extractAccount(partyCell),
          counterpartyName: inlineName,
          purpose: null,
        },
        haveName: inlineName != null,
        purposeParts: inlinePurpose ? [inlinePurpose] : [],
      };
      continue;
    }

    if (!current) continue;

    const text = cleanText(row[colParty]);
    if (!text) continue;

    if (!current.haveName) {
      current.tx.counterpartyName = text;
      current.haveName = true;
    } else {
      current.purposeParts.push(text);
    }
  }
  flush();

  // ── YOPILISH QOLDIG'I ────────────────────────────────────────────────
  // "Исходящий остаток за 28.08.2026 | 1,586,886.88" — jadval OXIRIDA,
  // sarlavha blokida emas, shuning uchun `readStatementHeader` uni ko'rmaydi.
  //
  // Nega kerak: bu bankning O'Z deklaratsiyasi. U bo'lmasa vipiskani o'zida
  // yopib bo'lmaydi (ochilish + kredit − debet = yopilish) — ya'ni eng
  // kuchli nazorat ishlamaydi. Avval faqat 10 vipiskadan 1 tasi (Hamkorbank)
  // tekshirilardi.
  let closingBalance: number | null = null;
  for (const row of rows) {
    const entries = Object.entries(row);
    const at = entries.findIndex(([, v]) => /Исходящий\s*остаток/i.test(String(v ?? "")));
    if (at === -1) continue;
    const value = entries.slice(at + 1).find(([, v]) => toAmount(v) !== 0);
    closingBalance = toAmount(value?.[1]);
    break;
  }

  return {
    format: "litsevoy",
    ...header,
    closingBalance,
    transactions,
  };
}
