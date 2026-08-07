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

export function isLitsevoyFormat(rows: SheetRow[]): boolean {
  return rows.some((r) => {
    const first = Object.values(r)[0];
    return typeof first === "string" && first.trim() === HEADER_MARKER;
  });
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
      } else if (
        !result.holderName &&
        index === 0 &&
        !/выписка|дата|проводки|наименование|назначение/i.test(text)
      ) {
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

  const headerIndex = rows.findIndex((r) => String(r[colDate] ?? "").trim() === HEADER_MARKER);
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
    const dateCell = row[colDate];

    if (looksLikeDate(dateCell)) {
      flush();
      const valueDate = toDate(dateCell);
      if (!valueDate) continue;

      const debit = toAmount(row[colDebit]);
      const credit = toAmount(row[colCredit]);
      // Nol summali qator — yakuniy "Итого" kabi xizmat qatori; tashlanadi.
      if (debit === 0 && credit === 0) continue;

      const partyCell = row[colParty];
      current = {
        tx: {
          valueDate,
          docNumber: cleanText(row[colDoc]),
          opCode: cleanText(row[colOp]),
          direction: credit > 0 ? "income" : "expense",
          amount: credit > 0 ? credit : debit,
          counterpartyInn: extractInn(partyCell),
          counterpartyAccount: extractAccount(partyCell),
          counterpartyName: null,
          purpose: null,
        },
        haveName: false,
        purposeParts: [],
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

  return {
    format: "litsevoy",
    ...header,
    closingBalance: null,
    transactions,
  };
}
