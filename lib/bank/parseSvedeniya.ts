// FORMAT B — "Сведения о работе счета" (Hamkorbank; 10 vipiskadan 1 tasi).
//
// Format A dan uchta jiddiy farqi bor:
//   1) bitta tranzaksiya BITTA qatorda (guruhlash kerak emas);
//   2) sana — Excel serial float (46211.7005...), matn emas;
//   3) kontragent bitta katakda slesh bilan: "hisob/STIR/nom".
//
// Sarlavha:
//   Дата | Cчет/ИНН | № док | Оп | МФО | Оборот Дебет | Оборот Кредит | Назначение платежа

import {
  BankStatementParseError,
  type ParsedStatement,
  type ParsedTransaction,
  type SheetRow,
} from "./types";
import { cleanText, extractAccount, extractInn, toAmount, toDate } from "./normalize";

const HEADER_MARKER = "Дата";
const PERIOD_RE = /c\s*(\d{2}\.\d{2}\.\d{4})\s*по\s*(\d{2}\.\d{2}\.\d{4})/i;
const OPENING_RE = /Остаток на начало периода\s*:\s*([\d\s.,]+)/i;
const CLOSING_RE = /Остаток на конец периода\s*:\s*([\d\s.,]+)/i;

export function isSvedeniyaFormat(rows: SheetRow[]): boolean {
  return rows.some((r) => {
    const values = Object.values(r);
    return (
      typeof values[0] === "string" &&
      values[0].trim() === HEADER_MARKER &&
      values.some((v) => typeof v === "string" && /Сч[её]т\s*\/\s*ИНН|Cчет\s*\/\s*ИНН/i.test(v))
    );
  });
}

export function parseSvedeniya(rows: SheetRow[]): ParsedStatement {
  if (rows.length === 0) throw new BankStatementParseError("Vipiska bo'sh");

  const columns = Object.keys(rows[0]);
  if (columns.length < 8) {
    throw new BankStatementParseError(
      `"Сведения о работе счета" formatida kamida 8 ustun kutilgan, ${columns.length} ta topildi`
    );
  }
  const [colDate, colParty, colDoc, colOp, , colDebit, colCredit, colPurpose] = columns;

  const headerIndex = rows.findIndex((r) => String(r[colDate] ?? "").trim() === HEADER_MARKER);
  if (headerIndex === -1) {
    throw new BankStatementParseError(`Sarlavha qatori ("${HEADER_MARKER}") topilmadi`);
  }

  // ── Sarlavha bloki ─────────────────────────────────────────────────────
  let accountNumber: string | null = null;
  let accountInn: string | null = null;
  let holderName: string | null = null;
  let periodFrom: Date | null = null;
  let periodTo: Date | null = null;
  let openingBalance: number | null = null;
  let closingBalance: number | null = null;

  for (const row of rows.slice(0, headerIndex)) {
    for (const value of Object.values(row)) {
      const text = cleanText(value);
      if (!text) continue;

      if (/Сведения о работе счета/i.test(text)) {
        const m = PERIOD_RE.exec(text);
        if (m) {
          periodFrom = toDate(m[1]);
          periodTo = toDate(m[2]);
        }
      }
      // "Cчет: 20208000905169375001   MOLIYA AI XK   ИНН : 307077420"
      if (/^C?Сч[её]т\s*:|^Cчет\s*:/i.test(text)) {
        accountNumber = extractAccount(text) ?? accountNumber;
        accountInn = extractInn(text) ?? accountInn;
        const middle = text
          .replace(/^C?Сч[её]т\s*:\s*\d+/i, "")
          .replace(/^Cчет\s*:\s*\d+/i, "")
          .replace(/ИНН\s*:?\s*\d+/i, "")
          .trim();
        if (middle) holderName = middle;
      }
      const open = OPENING_RE.exec(text);
      if (open) openingBalance = toAmount(open[1]);
      const close = CLOSING_RE.exec(text);
      if (close) closingBalance = toAmount(close[1]);
    }
  }

  // ZAXIRA YO'L: hisob raqami "Cчет:" yorlig'i bilan topilmasa, sarlavha
  // blokidagi HAR QANDAY katakdan va USTUN NOMLARIDAN 20 raqamli hisob
  // qidiriladi.
  //
  // Nima uchun ustun nomlari ham: `sheet_to_json` faylning BIRINCHI qatorini
  // ustun kaliti qilib oladi, ya'ni o'sha qator `Object.values()` ga umuman
  // tushmaydi. Bankning ba'zi eksportlarida hisob raqami aynan shu birinchi
  // qatorda turadi (masalan "00083 / … HAMKORBANK …" bilan yonma-yon) va
  // vipiska "hisob o'qilmadi" deb rad etilardi — foydalanuvchi esa hisob
  // bazada yo'q deb o'ylardi, holbuki u ro'yxatda bor edi.
  if (!accountNumber) {
    const headerCells: unknown[] = [
      ...columns,
      ...rows.slice(0, headerIndex).flatMap((r) => Object.values(r)),
    ];
    for (const cell of headerCells) {
      const found = extractAccount(cell);
      if (found) {
        accountNumber = found;
        break;
      }
    }
  }
  if (!accountInn) {
    for (const cell of columns) {
      const found = extractInn(cell);
      if (found) {
        accountInn = found;
        break;
      }
    }
  }

  // ── Tranzaksiyalar — bitta qator = bitta tranzaksiya ───────────────────
  const transactions: ParsedTransaction[] = [];

  for (const row of rows.slice(headerIndex + 1)) {
    const valueDate = toDate(row[colDate]);
    if (!valueDate) continue;

    const debit = toAmount(row[colDebit]);
    const credit = toAmount(row[colCredit]);
    if (debit === 0 && credit === 0) continue;

    // "20208000805596161002/310079710/\"R A H M A T J O N-HALOL-MARKET\" MCHJ"
    const partyRaw = cleanText(row[colParty]);
    let counterpartyAccount: string | null = null;
    let counterpartyInn: string | null = null;
    let counterpartyName: string | null = null;
    if (partyRaw) {
      const parts = partyRaw.split("/");
      if (parts.length >= 3) {
        counterpartyAccount = parts[0].trim() || null;
        counterpartyInn = /^\d{9}$/.test(parts[1].trim()) ? parts[1].trim() : null;
        // Nom ichida ham "/" bo'lishi mumkin — qolgan hammasi nom.
        counterpartyName = parts.slice(2).join("/").trim() || null;
      } else {
        counterpartyAccount = extractAccount(partyRaw);
        counterpartyInn = extractInn(partyRaw);
        counterpartyName = partyRaw;
      }
    }

    transactions.push({
      valueDate,
      docNumber: cleanText(row[colDoc]),
      opCode: cleanText(row[colOp]),
      direction: credit > 0 ? "income" : "expense",
      amount: credit > 0 ? credit : debit,
      counterpartyInn,
      counterpartyName,
      counterpartyAccount,
      purpose: cleanText(row[colPurpose]),
    });
  }

  return {
    format: "svedeniya",
    accountNumber,
    accountInn,
    holderName,
    periodFrom,
    periodTo,
    openingBalance,
    closingBalance,
    transactions,
  };
}
