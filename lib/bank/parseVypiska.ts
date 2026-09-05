// «ВЫПИСКА ЛИЦЕВЫХ СЧЕТОВ» — Ipak yo'li / Optima va shu oilaviy eksportlar.
//
// `parseLitsevoy` dan FARQI: u "Дата/время проводки" sarlavhali olti ustunli
// jadval uchun. Bu yerda esa sarlavha to'qqiz nomli va jadval siyrak — bitta
// mantiqiy ustun Excel'da bir necha katakni egallagani uchun kalitlar
// `_2, _3, _7, _13, _22, _29, _30, _34, _36` ko'rinishida keladi. Shuning
// uchun ustunlar TARTIB bo'yicha emas, SARLAVHA MATNI bo'yicha topiladi.
//
// TUZOQ: "Итого за 03.01.2025" qatorlari ham xuddi tranzaksiya kabi `№ пп`
// bilan keladi va kunlik yakunni takrorlaydi. Ularni qoldirish butun kunni
// ikki barobar sanardi.

import {
  BankStatementParseError,
  type ParsedStatement,
  type ParsedTransaction,
  type SheetRow,
} from "./types";

const COLUMN_LABELS: Record<string, keyof Columns> = {
  "№ пп": "npp",
  "Дата документа": "docDate",
  "№  док.": "docNo",
  "№ док.": "docNo",
  "Наименование счёта": "party",
  "№ счёта": "partyAccount",
  "МФО": "mfo",
  "Обороты по дебету": "debit",
  "Обороты по кредиту": "credit",
  "Назначение платежа": "purpose",
};

interface Columns {
  npp: string; docDate: string; docNo: string; party: string;
  partyAccount: string; mfo: string; debit: string; credit: string; purpose: string;
}

const text = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());

/** "460 000,00" · "1 234.56" → son. Bo'sh yoki tanilmasa 0. */
function amount(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = text(v).replace(/ /g, "").replace(/\s/g, "").replace(",", ".");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function findColumns(rows: SheetRow[]): { cols: Columns; headerIndex: number } | null {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const found: Partial<Columns> = {};
    for (const [key, value] of Object.entries(rows[i])) {
      const field = COLUMN_LABELS[text(value)];
      if (field) found[field] = key;
    }
    if (found.credit && found.debit && found.docDate && found.npp) {
      return { cols: found as Columns, headerIndex: i };
    }
  }
  return null;
}

export function isVypiskaFormat(rows: SheetRow[]): boolean {
  return findColumns(rows) !== null;
}

/** "03.01.2025" → UTC kun boshi. */
function toDay(v: unknown): Date | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text(v));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Excel seriya raqami (45658) → sana. Vipiska sarlavhasida davr shunday keladi. */
function fromSerial(v: unknown): Date | null {
  const n = typeof v === "number" ? v : Number(text(v));
  if (!Number.isFinite(n) || n < 20000 || n > 60000) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86_400_000);
}

function readHeaderBlock(rows: SheetRow[]) {
  let accountNumber: string | null = null;
  let holderName: string | null = null;
  let periodFrom: Date | null = null;
  let periodTo: Date | null = null;
  let openingBalance: number | null = null;

  for (const row of rows) {
    const values = Object.values(row).map(text);
    const labels = values.map((v) => v.replace(/[:\s]+$/, ""));

    if (!accountNumber) {
      const acct = values.find((v) => /^\d{20}$/.test(v));
      if (acct) accountNumber = acct;
    }
    const nameIdx = labels.indexOf("Наименование счёта");
    if (nameIdx >= 0 && !holderName) {
      holderName = values.slice(nameIdx + 1).find((v) => v && !/^\d+$/.test(v)) ?? null;
    }
    if (labels.includes("за период")) {
      const serials = values.map(fromSerial).filter((d): d is Date => d !== null);
      if (serials.length >= 2) [periodFrom, periodTo] = serials;
    }
    const balIdx = labels.indexOf("Остаток");
    if (labels.some((l) => l.startsWith("Остаток: Начало")) && openingBalance === null) {
      const idx = labels.findIndex((l) => l.startsWith("Остаток: Начало"));
      const found = values.slice(idx + 1).find((v) => /\d/.test(v));
      if (found) openingBalance = amount(found);
    } else if (balIdx >= 0 && openingBalance === null) {
      openingBalance = amount(values[balIdx + 1]);
    }
  }
  return { accountNumber, holderName, periodFrom, periodTo, openingBalance };
}

export function parseVypiska(rows: SheetRow[]): ParsedStatement {
  const found = findColumns(rows);
  if (!found) throw new BankStatementParseError('"Выписка лицевых счетов" sarlavhasi topilmadi');
  const { cols, headerIndex } = found;
  const header = readHeaderBlock(rows.slice(0, headerIndex));

  const transactions: ParsedTransaction[] = [];
  const warnings: string[] = [];
  let totalsSkipped = 0;

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!/^\d+$/.test(text(row[cols.npp]))) continue;

    const party = text(row[cols.party]);
    // "Итого за 03.01.2025" / "Итого за весь период" — bankning O'Z yakuni.
    if (party.startsWith("Итого")) { totalsSkipped++; continue; }

    const valueDate = toDay(row[cols.docDate]);
    if (!valueDate) { warnings.push(`${i + 1}-qator: sana o'qilmadi`); continue; }

    const debit = amount(row[cols.debit]);
    const credit = amount(row[cols.credit]);
    if (debit === 0 && credit === 0) continue;

    transactions.push({
      valueDate,
      docNumber: text(row[cols.docNo]) || null,
      opCode: text(row[cols.mfo]) || null,
      direction: credit > 0 ? "income" : "expense",
      amount: credit > 0 ? credit : debit,
      counterpartyInn: null,
      counterpartyName: party || null,
      counterpartyAccount: text(row[cols.partyAccount]) || null,
      purpose: text(row[cols.purpose]) || null,
    });
  }

  if (transactions.length === 0) throw new BankStatementParseError("Vipiskada tranzaksiya topilmadi");
  // Yakun qatorlari TASHLANGANI ataylab ko'rsatiladi: ular bankning nazorat
  // raqami va ular bilan solishtirish importning to'g'riligini isbotlaydi.
  if (totalsSkipped) warnings.push(`${totalsSkipped} ta "Итого" yakun qatori hisobga olinmadi`);

  return {
    format: "vypiska",
    accountNumber: header.accountNumber,
    accountInn: null,
    holderName: header.holderName,
    periodFrom: header.periodFrom,
    periodTo: header.periodTo,
    openingBalance: header.openingBalance,
    closingBalance: null,
    transactions,
    warnings,
  };
}
