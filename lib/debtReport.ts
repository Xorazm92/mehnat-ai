// =====================================================
// 1C «Задолженность покупателей» HISOBOTINI O'QISH
// =====================================================
//
// Bu hisobot mijozlarning HAQIQIY qarzini beradi — jamg'arilgan, ya'ni
// o'tgan oylardan qolgani ham ichida. ASRO o'zi hisoblaganida faqat joriy
// oyni ko'radi (`Company.contractAmount` − shu oy to'lovi), shuning uchun
// 759 mln chiqadi, 1C esa 2.09 mlrd deydi.
//
// TUZILISHI — uch pog'onali daraxt, tekis qatorlarga yoyilgan. Pog'ona
// belgisi JSON'da yo'q, shuning uchun qator TURI mazmunidan aniqlanadi:
//
//   "Academy Rizomulk" Ntm        ← MIJOZ        (jami 1 500 000)
//     №25/26БК от 05.01.2026      ← SHARTNOMA      900 000
//       "Seven`S Up" Mchj         ← BIZNING FIRMA  900 000
//     №29/БК от 12.08.2025        ← SHARTNOMA      600 000
//       "Seven`S Up" Mchj         ← BIZNING FIRMA  600 000
//
// Ya'ni "Seven`S Up" qatori mijoz EMAS — u shartnoma qaysi o'z firmamiz
// nomidan tuzilganini bildiradi. Buni farqlamasak, o'z firmalarimiz mijoz
// bo'lib qarzdorlar ro'yxatiga tushib qolardi.

import { toAmount, cleanText } from "@/lib/bank/normalize";

export class DebtReportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DebtReportParseError";
  }
}

type Row = Record<string, unknown>;

export interface DebtLine {
  customerName: string;
  /** "25/26БК" — № va sana olib tashlangan holda. */
  contractNumber: string | null;
  /** Faylda qanday yozilgan bo'lsa ("№25/26БК от 05.01.2026"). */
  contractRaw: string | null;
  /** Shartnoma qaysi o'z firmamiz nomidan tuzilgan. */
  ownFirmName: string | null;
  /** Davr boshidagi qarz. */
  debtBefore: number;
  /** Davr oxiridagi qarz — asosiy qiymat. */
  debt: number;
  advance: number;
}

export interface ParsedDebtReport {
  /** Hisobot sanasi (davr oxiri). */
  asOf: Date | null;
  lines: DebtLine[];
  /** Faqat mijoz darajasidagi jami — tekshirish uchun. */
  customerTotal: number;
}

const TITLE_RE = /Задолженность покупателей за\s*([\d.]+)\s*-\s*([\d.]+)/i;

/** "№25/26БК от 05.01.2026" → "25/26БК" */
export function contractNumberOf(raw: string): string | null {
  const m = /^№\s*([^\s]+?)\s*(?:от|$)/i.exec(raw.trim());
  return m ? m[1].trim() : null;
}

function toDateDmy(text: string): Date | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{2,4})$/.exec(text.trim());
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1])));
}

/**
 * @param ownFirmNames bizning firmalarimiz nomlari — shartnoma egasini
 *   mijozdan ajratish uchun. Bo'sh berilsa, "bizning firma" qatorlari
 *   MIJOZ deb qabul qilinadi va qarzdorlik soxta ko'tariladi.
 */
export function parseDebtReport(rows: Row[], ownFirmNames: Iterable<string>): ParsedDebtReport {
  if (rows.length === 0) throw new DebtReportParseError("Hisobot bo'sh");

  const norm = (s: string) => s.toLowerCase().replace(/[`'‘’"«»]/g, "").replace(/\s+/g, " ").trim();
  const ownSet = new Set([...ownFirmNames].map(norm));

  // Ustun kalitlari QATORDAN QATORGA farq qiladi: birinchi qatorda atigi
  // ikkitasi bor, sarlavhada esa o'nga yaqin. Shuning uchun birlashma
  // olinadi va tartib saqlanadi.
  const keys: string[] = [];
  for (const row of rows) {
    for (const k of Object.keys(row)) if (!keys.includes(k)) keys.push(k);
  }
  const nameKeyCol = keys[0];

  // Sarlavhadan davr oxirini olamiz.
  let asOf: Date | null = null;
  const title = keys.find((k) => TITLE_RE.test(k)) ?? "";
  const titleMatch = TITLE_RE.exec(title);
  if (titleMatch) asOf = toDateDmy(titleMatch[2]);

  // Ustunlarni sarlavha qatoridan topamiz: "Долг" ikki marta uchraydi
  // (davr boshi va oxiri), shuning uchun TARTIB bo'yicha olinadi.
  const headerIndex = rows.findIndex((r) =>
    Object.values(r).some((v) => String(v ?? "").trim() === "Договор")
  );
  if (headerIndex === -1) {
    throw new DebtReportParseError(
      'Sarlavha qatori topilmadi — "Договор" ustuni bo\'lishi kerak. ' +
        "Bu 1C «Задолженность покупателей» hisoboti bo'lishi shart."
    );
  }
  const header = rows[headerIndex];
  const debtCols = keys.filter((k) => String(header[k] ?? "").trim() === "Долг");
  const advanceCols = keys.filter((k) => String(header[k] ?? "").trim() === "Аванс");
  if (debtCols.length < 2) {
    throw new DebtReportParseError(`Ikkita "Долг" ustuni kutilgan, ${debtCols.length} ta topildi`);
  }
  const [debtBeforeCol, debtCol] = debtCols;
  const advanceCol = advanceCols[advanceCols.length - 1];

  const lines: DebtLine[] = [];
  let customer: string | null = null;
  let pending: DebtLine | null = null;
  let customerTotal = 0;

  const flush = () => {
    if (pending) lines.push(pending);
    pending = null;
  };

  for (const row of rows.slice(headerIndex + 1)) {
    const name = cleanText(row[nameKeyCol]);
    if (!name) continue;
    if (/^(Итого|Всего)/i.test(name)) continue;

    const debtBefore = toAmount(row[debtBeforeCol]);
    const debt = toAmount(row[debtCol]);
    const advance = advanceCol ? toAmount(row[advanceCol]) : 0;

    if (name.startsWith("№")) {
      // Shartnoma qatori — joriy mijozga tegishli.
      flush();
      pending = {
        customerName: customer ?? "(mijoz ko'rsatilmagan)",
        contractNumber: contractNumberOf(name),
        contractRaw: name,
        ownFirmName: null,
        debtBefore,
        debt,
        advance,
      };
      continue;
    }

    if (ownSet.has(norm(name))) {
      // Bizning firma — shartnoma egasi, mijoz emas.
      if (pending) pending.ownFirmName = name;
      continue;
    }

    // Yangi mijoz.
    flush();
    customer = name;
    customerTotal += debt;
  }
  flush();

  return { asOf, lines, customerTotal };
}

// =====================================================
// KESIM VARIANTI — «Расчеты на 31.07.26» (bitta sana)
// =====================================================
//
// Yuqoridagi `parseDebtReport` AYLANMA hisobotni o'qiydi: unda "Долг"
// ustuni IKKI marta uchraydi (davr boshi va oxiri). Korxona esa kunlik
// KESIM hisobotini ham chiqaradi — unda bitta "Долг" va bitta "Аванс"
// bo'ladi, ya'ni "shu kunga qarz qancha, avans qancha".
//
// Ikki xil hisobot ATAYIN ikki funksiya: bittasini ikkalasiga moslashtirsak,
// ustun tartibi bo'yicha taxmin qilish kerak bo'lardi va aylanma hisobotning
// "davr boshi" ustuni jimgina "avans" o'rniga tushib qolishi mumkin edi.
//
// NEGA IKKI FAYL KERAK: korxona oy oxirida ikkita kesim oladi —
//   31.07 → oyning xizmat haqi HALI YOZILMAGAN holat
//   01.08 → o'sha xizmat haqi qo'shilgan holat
// Ikkovining farqi — shu oyning HISOBLANMASI (nachisleniya). Boshqa yo'l
// bilan uni bu fayllardan olib bo'lmaydi.

export interface DebtSnapshotLine {
  customerName: string;
  /**
   * Mijozning STIRi — hisobotda "Покупатель.ИНН" o'lchovi bo'lsa to'ladi.
   *
   * ENG ISHONCHLI KALIT. Nom bo'yicha bog'lash imlo farqiga qoqiladi
   * ("Dksp Amudaryo" ↔ "DSKP AMUDARYO"), shartnoma raqami esa firma ichida
   * unikal bo'lgani uchun kalit bo'la olmaydi. STIR ikkalasining ham
   * o'rnini bosadi.
   */
  customerInn: string | null;
  contractNumber: string | null;
  contractRaw: string | null;
  ownFirmName: string | null;
  debt: number;
  advance: number;
}

export interface ParsedDebtSnapshot {
  asOf: Date | null;
  lines: DebtSnapshotLine[];
  /** Mijoz darajasidagi jamilar — parser to'g'ri yurganini tekshirish uchun. */
  customerTotals: { debt: number; advance: number };
  /** Shartnomasiz qolgan mijozlar (kutilmagan tuzilish belgisi). */
  customersWithoutContract: string[];
}

/** "Расчеты на 31.07.26" → Date */
const SNAPSHOT_DATE_RE = /Расчеты\s+на\s+([\d.]+)/i;

/** 1C shartnomasiz qoldiqni shu nom bilan ko'rsatadi. */
const NO_CONTRACT_LABEL = "Без договора";

/**
 * @param ownFirmNames ATAYIN ISHLATILMAYDI moslashtirish uchun — faqat
 *   ogohlantirish beriladi. Sabab pastda, `ownFirmName` izohida.
 */
export function parseDebtSnapshot(rows: Row[]): ParsedDebtSnapshot {
  if (rows.length === 0) throw new DebtReportParseError("Hisobot bo'sh");

  const keys: string[] = [];
  for (const row of rows) {
    if (!row) continue;
    for (const k of Object.keys(row)) if (!keys.includes(k)) keys.push(k);
  }
  const nameKeyCol = keys[0];

  // Sana "Расчеты на 31.07.26" katagidan olinadi — sarlavhada u ruscha oy
  // nomi bilan yozilgan ("за 31 июля 2026 г."), uni tahlil qilish ortiqcha
  // tarjima jadvalini talab qilardi.
  let asOf: Date | null = null;
  for (const row of rows) {
    if (!row) continue;
    for (const v of Object.values(row)) {
      const m = SNAPSHOT_DATE_RE.exec(String(v ?? ""));
      if (m) {
        asOf = toDateDmy(m[1]);
        break;
      }
    }
    if (asOf) break;
  }

  // Ustun sarlavhasi "Долг" TURGAN qatorda. U hisobot variantiga qarab
  // har xil o'lchov qatoriga tushadi: STIRsiz variantda "Договор" yonida,
  // STIRli variantda "Покупатель.ИНН" yonida. Shuning uchun qidiruv
  // o'lchov nomi bo'yicha emas, USTUN NOMI bo'yicha ketadi.
  const headerIndex = rows.findIndex(
    (r) => r && Object.values(r).some((v) => String(v ?? "").trim() === "Долг")
  );
  if (headerIndex === -1) {
    throw new DebtReportParseError(
      'Sarlavha qatori topilmadi — "Долг" ustuni bo\'lishi kerak.'
    );
  }
  const header = rows[headerIndex];
  const debtCol = keys.find((k) => String(header[k] ?? "").trim() === "Долг");
  const advanceCol = keys.find((k) => String(header[k] ?? "").trim() === "Аванс");
  if (!debtCol) {
    throw new DebtReportParseError('"Долг" ustuni topilmadi — bu kesim hisoboti emasmi?');
  }

  // ── POG'ONA O'RIN BO'YICHA ANIQLANADI, NOM BO'YICHA EMAS ───────────────
  //
  // Daraxt qat'iy shaklda: MIJOZ → SHARTNOMA(№…) → BIZNING FIRMA, va har
  // shartnomadan keyin ROPPA-ROSA BITTA firma qatori keladi (faylda 184
  // shartnomaning 184 tasi ham shunday).
  //
  // Ilgari "bizning firma" qatori NOM bo'yicha tanilardi. U ishlamadi:
  // faylda firmalar boshqacha yozilgan ("Sofyteam" Mchj ↔ bazada SOFI TEAM,
  // "Seven`S Up" Mchj ↔ ЧП "SEVEN`S UP). Tanilmagan firma YANGI MIJOZ deb
  // qabul qilinib, o'z firmalarimiz qarzdorlar ro'yxatiga tushib qolardi va
  // mijoz jamilari shartnoma jamilariga to'g'ri kelmasdi (996 mln ↔ 469 mln).
  //
  // O'rin bo'yicha o'qish bu sinfdagi xatoni butunlay yopadi: nom qanday
  // yozilishidan qat'i nazar, shartnomadan keyingi qator — firma.
  const lines: DebtSnapshotLine[] = [];
  const customersWithoutContract: string[] = [];
  const customerTotals = { debt: 0, advance: 0 };

  // Bo'sh va "Итого" qatorlari OLDINDAN olib tashlanadi: o'rin bo'yicha
  // o'qishda ular "shartnomadan keyingi qator" hisobiga aralashib ketardi.
  // Sarlavha UCH QATORLI: "Покупатель" / "Договор" / "Организация" — bular
  // hisobotning O'LCHOV nomlari, ma'lumot emas. `headerIndex` faqat
  // ikkinchisini topadi, shuning uchun "Организация" tanadan alohida
  // chiqariladi — aks holda u birinchi mijoz bo'lib o'qilardi.
  const DIMENSION_LABELS = new Set([
    "Покупатель",
    "Покупатель.ИНН",
    "Договор",
    "Организация",
    "Сортировка:",
  ]);

  const body = rows
    .slice(headerIndex + 1)
    .map((r) => ({ row: r, name: r ? (cleanText(r[nameKeyCol]) ?? "") : "" }))
    .filter(
      (x): x is { row: Row; name: string } =>
        !!x.row && !!x.name && !DIMENSION_LABELS.has(x.name) && !/^(Итого|Всего)/i.test(x.name)
    );

  let customer: string | null = null;
  let customerInn: string | null = null;
  let customerHadContract = false;

  // Hisobotning STIRli variantida mijozdan KEYIN uning STIRi alohida qator
  // bo'lib keladi (9 raqam). Shartnoma qatori "№" bilan boshlanadi, firma
  // nomi esa raqamdan iborat bo'lmaydi — shuning uchun bu shakl aralashib
  // ketmaydi.
  const isInnRow = (name: string) => /^\d{9}$/.test(name);

  for (let i = 0; i < body.length; i++) {
    const { row, name } = body[i];
    const debt = toAmount(row[debtCol]);
    const advance = advanceCol ? toAmount(row[advanceCol]) : 0;

    // "Без договора" — 1C ning o'z atamasi: shartnomaga bog'lanmagan qoldiq.
    // U SHARTNOMA pog'onasida turadi (keyin firma qatori keladi), shuning
    // uchun shartnoma qatori kabi o'qiladi, faqat raqami bo'lmaydi. Mijoz
    // deb qabul qilinsa, bitta mijoz ikki marta sanalardi.
    if (name.startsWith("№") || name === NO_CONTRACT_LABEL) {
      customerHadContract = true;
      // Keyingi qator — shartnoma qaysi firmamiz nomidan tuzilgani.
      const nextName = body[i + 1]?.name ?? "";
      const nextIsContract = nextName.startsWith("№") || nextName === NO_CONTRACT_LABEL;
      const ownFirmName = nextName && !nextIsContract ? nextName : null;
      if (ownFirmName) i += 1; // firma qatori iste'mol qilindi

      lines.push({
        customerName: customer ?? "(mijoz ko'rsatilmagan)",
        customerInn,
        contractNumber: name === NO_CONTRACT_LABEL ? null : contractNumberOf(name),
        contractRaw: name,
        ownFirmName,
        debt,
        advance,
      });
      continue;
    }

    // STIR qatori — joriy mijozga tegishli, yangi mijoz EMAS.
    if (isInnRow(name)) {
      customerInn = name;
      continue;
    }

    // Shartnoma emas, STIR emas va firma ham emas → yangi mijoz.
    if (customer && !customerHadContract) customersWithoutContract.push(customer);
    customer = name;
    customerInn = null;
    customerHadContract = false;
    customerTotals.debt += debt;
    customerTotals.advance += advance;
  }
  if (customer && !customerHadContract) customersWithoutContract.push(customer);

  return { asOf, lines, customerTotals, customersWithoutContract };
}

// =====================================================
// SHARTNOMA TURI — BK yoki RK
// =====================================================
//
// Korxonaning shartnoma raqamlash qoidasi:
//   ...БК → DOIMIY xizmat ko'rsatish (oylik buxgalteriya yuritish)
//   ...РК → BIR MARTALIK xizmat (masalan buxgalteriyani tartibga solish)
//
// Farq hisobotda muhim: doimiy shartnoma har oy hisoblanadi, bir martalik
// esa faqat bir marta. Ikkalasini bitta "tushum" deb qo'shib yuborish oylik
// barqaror daromadni ko'p ko'rsatib yuborardi.
//
// Kirill/lotin ARALASH yoziladi ("БК" ham, "BK" ham uchraydi) — shuning
// uchun taqqoslashdan oldin harflar birxillashtiriladi.

export type ContractKind = "BK" | "RK" | "unknown";

export function contractKindOf(contractNumber: string | null | undefined): ContractKind {
  if (!contractNumber) return "unknown";
  const u = contractNumber
    .toUpperCase()
    .replace(/[\s.]/g, "")
    .replace(/Б/g, "B")
    .replace(/Р/g, "R")
    .replace(/К/g, "K");
  // Belgi raqamning OXIRIDA bo'lishi shart emas: "13/06/РК/25" kabi
  // shakllar ham uchraydi. Faqat oxirini tekshirgan variant ularni
  // "aniqlanmagan" deb yuborardi (52 qator / 137,7 mln).
  if (/RK/.test(u)) return "RK";
  if (/BK/.test(u)) return "BK";
  return "unknown";
}

export const CONTRACT_KIND_LABELS: Record<ContractKind, string> = {
  BK: "Doimiy xizmat",
  RK: "Bir martalik",
  unknown: "Aniqlanmagan",
};
