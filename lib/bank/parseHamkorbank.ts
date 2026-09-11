// Hamkorbank «Сведения о работе счета» eksporti — KO'P SAHIFALI variant.
//
// Boshqa banklarning bir xil nomli hisobotidan FARQI: sarlavha bloki
// (hisob raqami, davr, qoldiqlar) BITTA sahifada ("Sheet1"), tranzaksiyalar
// jadvali boshqasida ("Sheet2": Дата | Счет/ИНН | № док | Оп | МФО |
// Оборот Дебет | Оборот Кредит | Назначение платежа).
//
// Yo'nalish bank konvensiyasi bo'yicha: КРЕДИТ — pul KIRDI (mijoz to'lovi),
// ДЕБЕТ — pul CHIQDI (soliq, oylik, komissiya).

import {
  BankStatementParseError,
  type ParsedStatement,
  type ParsedTransaction,
  type SheetRow,
  type Workbook,
} from "./types";
import { cleanText, extractAccount, extractInn, resolveMovement, toAmount, toDate } from "./normalize";

const PERIOD_RE =
  // "c" bu yerda ba'zan LOTIN (Hamkorbank shunday yozadi) — ikkala alifbo.
  /Сведения о работе счета.*?[сc]\s+(\d{2}\.\d{2}\.\d{4})\s+по\s+(\d{2}\.\d{2}\.\d{4})/i;

/** Tranzaksiya jadvalining sarlavhasini topadi (Дебет+Кредит bir qatorda). */
function findTxHeader(
  workbook: Workbook
): { rows: SheetRow[]; keys: Record<string, string> } | null {
  for (const rows of Object.values(workbook)) {
    for (let i = 0; i < (rows?.length ?? 0); i++) {
      const row = rows[i];
      if (!row || typeof row !== "object") continue;
      const entries = Object.entries(row);
      const hasDebit = entries.some(([, v]) => /Оборот\s*Дебет/i.test(String(v ?? "")));
      const hasCredit = entries.some(([, v]) => /Оборот\s*Кредит/i.test(String(v ?? "")));
      if (!hasDebit || !hasCredit) continue;

      const keys: Record<string, string> = {};
      for (const [k, v] of entries) {
        const label = String(v ?? "").toLowerCase();
        // Hamkorbank sarlavhalarni lotin/kirill ARALASH yozadi ("Cчет/ИНН")
        // — tekshiruvlar ikkala alifboga chidamli bo'lishi shart.
        if (/дата/.test(label)) keys.date = k;
        // "Cчет/ИНН" — INN shu ustunning oxirida, alohida guard kerak emas.
        else if (/[сc]ч[еe]т/.test(label)) keys.party = k;
        else if (/№\s*док|^№$/.test(label)) keys.doc = k;
        else if (/^[оo]п\b|[оo]пер/.test(label)) keys.op = k;
        else if (/[дd][еe][бb][еe][тt]/.test(label)) keys.debit = k;
        else if (/[кk][рr][еe][дd][иi][тt]/.test(label)) keys.credit = k;
        else if (/назначение/.test(label)) keys.purpose = k;
      }
      // DIQQAT: bu yerda ilgari shart yozilgan, so'ng darhol AYNAN o'sha
      // qiymatni qaytaradigan ikkinchi qator qo'yilgan edi — ya'ni shart
      // o'lik kod bo'lib, hech narsani filtrlamas edi. Shart ataylab
      // olib tashlandi: ustun nomlari to'liq tanilmasa ham topilgan
      // sarlavha qatoridan foydalanish (avvalgi haqiqiy xulq) saqlanadi,
      // lekin endi buni kod ham shunday DEYDI.
      // ── SARLAVHA QATORIDAGI BIRINCHI TRANZAKSIYA ────────────────────
      // Bu eksportda sarlavha va BIRINCHI tranzaksiya bitta qatorga
      // yopishib keladi: c0–c7 ustun nomlari, c8–c15 esa o'sha tartibdagi
      // birinchi yozuvning qiymatlari. Sarlavha qatori butunlay tashlansa,
      // o'sha yozuv JIMGINA yo'qoladi — MOLIYA AI vipiskasida bu 15 252,00
      // so'mlik debet edi va yopilish qoldig'i deklaratsiyaga mos kelmay
      // qolardi (826 455,19 o'rniga 811 203,19 bo'lishi kerak).
      const width = entries.length / 2;
      const tail = entries.slice(width);
      const merged =
        Number.isInteger(width) && tail.some(([, v]) => v !== null && v !== undefined && v !== "")
          ? [
              Object.fromEntries(
                entries.slice(0, width).map(([k], j) => [k, tail[j]?.[1] ?? null])
              ) as SheetRow,
            ]
          : [];

      return { rows: [...merged, ...rows.slice(i + 1)], keys };
    }
  }
  return null;
}

export function looksLikeHamkorbank(workbook: Workbook): boolean {
  return findTxHeader(workbook) !== null;
}

export function parseHamkorbankWorkbook(workbook: Workbook): ParsedStatement {
  const found = findTxHeader(workbook);
  if (!found) throw new BankStatementParseError("Hamkorbank jadvali topilmadi");
  const { rows, keys } = found;

  // ── Sarlavha: barcha sahifalarni tekshiramiz ──────────────────────────
  let accountNumber: string | null = null;
  let accountInn: string | null = null;
  let holderName: string | null = null;
  let periodFrom: Date | null = null;
  let periodTo: Date | null = null;
  let openingBalance: number | null = null;
  let closingBalance: number | null = null;

  for (const rowsOfSheet of Object.values(workbook)) {
    for (const row of rowsOfSheet ?? []) {
      if (!row || typeof row !== "object") continue;
      for (const value of Object.values(row)) {
        const text = String(value ?? "").replace(/\s+/g, " ").trim();
        if (!text) continue;

        if (!periodFrom && /Сведения о работе/i.test(text)) {
          const m = PERIOD_RE.exec(text);
          if (m) {
            periodFrom = toDate(m[1]);
            periodTo = toDate(m[2]);
          }
        }
        // Hamkorbank "Cчет:" ni LOTIN C bilan yozadi (boshqa banklar kirill
        // С) — ikkala alifbo ham qabul qilinadi.
        if (!accountNumber && /^(?:C?Сч[её]т|Cчет)\s*:/i.test(text)) {
          accountNumber = extractAccount(text);
          accountInn = extractInn(text);
          holderName =
            text
              .replace(/^(?:C?Сч[её]т|Cчет)\s*:\s*\d+\s*/i, "")
              .replace(/ИНН\s*:.*$/i, "")
              .replace(/\s+/g, " ")
              .trim() || null;
        }
        if (openingBalance === null && /Остаток на начало/i.test(text)) {
          openingBalance = toAmount(text.split(":").pop() ?? "");
        }
        if (closingBalance === null && /Остаток на конец/i.test(text)) {
          closingBalance = toAmount(text.split(":").pop() ?? "");
        }
      }
    }
  }

  // ── Tranzaksiyalar ────────────────────────────────────────────────────
  const transactions: ParsedTransaction[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const dateText = cleanText(row[keys.date]);
    if (!dateText || !/^\d{2}\.\d{2}\.\d{4}/.test(dateText)) continue;

    // Sana SOAT BILAN keladi ("13.08.2026 10:07:52") — toDate faqat
    // dd.mm.yyyy oladi, shuning uchun birinchi 10 belgi kesiladi. Aks
    // holda valueDate=null qaytib, yuklash 500 bilan yiqilardi.
    const valueDate = toDate(dateText.slice(0, 10));
    if (!valueDate) continue;

    const movement = resolveMovement(
      toAmount(keys.debit ? row[keys.debit] : null),
      toAmount(keys.credit ? row[keys.credit] : null)
    );
    if (!movement) continue;

    // "20208000805091385002/306510745/RAHMATJON OTA BUSINESS"
    const partyRaw = cleanText(row[keys.party]);
    const [partyAccount = null, partyInn = null, ...nameParts] = partyRaw
      ? partyRaw.split("/")
      : [];
    const counterpartyName = nameParts.join("/").trim() || partyRaw || null;

    const purpose = cleanText(keys.purpose ? row[keys.purpose] : null);

    transactions.push({
      valueDate,
      docNumber: cleanText(keys.doc ? row[keys.doc] : null),
      opCode: cleanText(keys.op ? row[keys.op] : null),
      direction: movement.direction,
      amount: movement.amount,
      counterpartyInn: partyInn && /^\d{9}$/.test(partyInn) ? partyInn : null,
      counterpartyName,
      counterpartyAccount: partyAccount && /^\d{10,}$/.test(partyAccount) ? partyAccount : null,
      purpose,
    });
  }

  if (transactions.length === 0) {
    throw new BankStatementParseError(
      "Hamkorbank jadvalida tranzaksiya topilmadi — fayl tuzilishi kutilganidan farq qiladi."
    );
  }
  if (!accountNumber) {
    throw new BankStatementParseError(
      'Hisob raqami o\'qilmadi — sarlavhada "Cчет: <20 raqam>" qatori kerak.'
    );
  }

  return {
    format: "hamkorbank",
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
