// KASSA APPARATINING KUNLIK HISOBOTI ("Кунлик ҳисобот") PARSERI.
//
// Soliq qo'mitasi kabinetidan olinadigan Excel. Ikki ko'rinishi bor:
//
//   KUNLIK  — bitta apparat, qatorlar = kunlar ("Сана" ustuni bor).
//             Sverka aynan shunisi bilan ishlaydi.
//   OYLIK   — bitta oy, qatorlar = apparatlar ("Фискал модул рақами" ustuni).
//             Kunma-kun solishtirishga yaramaydi va aniq xato bilan rad etiladi
//             — jim qabul qilinsa, oy yakuni bitta kunga yozilib, sverkani
//             butunlay chalg'itardi.
//
// Ustunlar NOMI bo'yicha topiladi, tartibi bo'yicha emas: eksport ustun
// qo'shganda tartib suriladi, nom esa o'zgarmaydi.

import { FiscalReportParseError, type FiscalDailyRow, type ParsedFiscalReport, type PosChannel, type SheetRow } from "./types";

/** Sarlavhalarni solishtirish uchun: registr, bo'shliq va qavslar tashlanadi. */
function norm(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[()\s. ]/g, "");
}

const FIELDS = {
  date: ["сана"],
  fm: ["фискалмодулрақами", "фискалмодулраками", "фмрақами", "фмраками"],
  inn: ["стир", "стир/жишшр"],
  cash: ["сумманақдпул", "сумманакдпул"],
  card: ["суммматўловтерминали", "суммматоловтерминали", "суммaтўловтерминали", "суммантўловтерминали", "суммaтоловтерминали", "суммaтўловтерминали", "суммaтўловтерминали"],
  total: ["жамисуммаққсбилан", "жамисуммаккcбилан", "жамисуммакксбилан"],
  returned: ["қайтарилган", "кайтарилган"],
  receipts: ["чекларсони"],
} as const;

// "Сумма (тўлов терминали)" — asosiy ustun; imlo variantlari ko'p bo'lgani
// uchun aniq ro'yxat o'rniga shakl bo'yicha ham tekshiriladi.
function isCardHeader(s: string): boolean {
  return s.startsWith("сумм") && (s.includes("тўловтерминал") || s.includes("толовтерминал"));
}
function isCashHeader(s: string): boolean {
  return s.startsWith("сумм") && (s.includes("нақдпул") || s.includes("накдпул"));
}

// ── KESIM HISOBOTINING KANALI ───────────────────────────────────────────
//
// Soliq kabineti to'lov turi bo'yicha FILTRLANGAN hisobotni ham beradi
// (faqat Click, faqat Payme...). Ustunlar shakli asosiy hisobot bilan bir
// xil, farqi — naqd va terminal nol, summa "Жами" da.
//
// Kanal FAYL MAZMUNIDAN topiladi, fayl nomidan emas. Fayl nomiga tayanish
// jimgina buziladigan yo'l edi: nom mos kelmasa kesim asosiy kassa
// summasiga qo'shilib, savdoni IKKI MARTA sanardi.

const CHANNEL_MARKERS: { channel: PosChannel; re: RegExp }[] = [
  // Aniqrog'i umumiyroqdan OLDIN: "HUMO EPOS" ni "HUMO" yutib yubormasin.
  { channel: "humo_epos", re: /\bepos\b/i },
  { channel: "multicard", re: /multicard|мультикарт/i },
  { channel: "paynet", re: /paynet|пайнет/i },
  { channel: "click", re: /\bclick\b|клик/i },
  { channel: "payme", re: /payme|пайме/i },
  // "UzumCard" ham Uzum — shuning uchun `uzcard` dan oldin.
  { channel: "uzum", re: /uzum|узум/i },
  { channel: "humo", re: /\bhumo\b|хумо/i },
  { channel: "uzcard", re: /uzcard|узкард|узкарт/i },
  { channel: "qr", re: /qr[- ]?online|qr[- ]?код|qr[- ]?kod/i },
];

/** Matndagi birinchi tanilgan kanal belgisi. */
function channelFromText(text: string): PosChannel | null {
  for (const { channel, re } of CHANNEL_MARKERS) {
    if (re.test(text)) return channel;
  }
  return null;
}

/**
 * Kanalni varaq mazmunidan topadi.
 *
 * Kabinet eksporti filtrni sarlavha ustidagi qatorlarga yozadi, ba'zan esa
 * alohida "Тўлов тури" ustunida beradi — ikkalasi ham shu oynaga tushadi.
 */
function detectChannel(rows: SheetRow[]): PosChannel | null {
  for (const r of rows) {
    for (const v of Object.values(r)) {
      // Raqamlar tekshirilmaydi: kanal nomi faqat matnda bo'ladi.
      if (typeof v !== "string") continue;
      const found = channelFromText(v);
      if (found) return found;
    }
  }
  return null;
}

type ColMap = Partial<Record<keyof typeof FIELDS, string>>;

function headerMap(row: SheetRow): ColMap | null {
  const map: ColMap = {};
  for (const [key, value] of Object.entries(row)) {
    const s = norm(value);
    if (!s) continue;
    if (isCardHeader(s)) map.card = key;
    else if (isCashHeader(s)) map.cash = key;
    else {
      for (const [field, variants] of Object.entries(FIELDS) as [keyof typeof FIELDS, readonly string[]][]) {
        if (field === "card" || field === "cash") continue;
        if (variants.includes(s)) map[field] = key;
      }
    }
  }
  return map.card ? map : null;
}

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").replace(/[\s ]/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** "01.08.2026" yoki Excel seriya raqami → UTC kun boshi. */
function cellDate(v: unknown): Date | null {
  if (v instanceof Date) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  if (typeof v === "number" && v > 20000 && v < 60000) {
    const ms = Math.round((v - 25569) * 86400000);
    const d = new Date(ms);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(String(v ?? "").trim());
  if (!m) return null;
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
}

/**
 * Sahifadagi qatorlardan kunlik hisobotni o'qiydi.
 *
 * @param fallbackFm Faylda FM ustuni bo'lmasa (kunlik ko'rinish) ishlatiladi —
 *   odatda fayl nomidan olingan raqam.
 * @param channelHint Kesim kanalini varaqdan topib bo'lmaganda OXIRGI chora
 *   sifatida qaraladigan matn (odatda fayl nomi). Mazmun har doim ustun.
 */
export function parseFiscalRows(
  rows: SheetRow[],
  fallbackFm: string | null = null,
  channelHint: string | null = null,
): ParsedFiscalReport {
  if (!rows?.length) throw new FiscalReportParseError("Faylda ma'lumot yo'q");

  let cols: ColMap | null = null;
  let start = 0;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const m = headerMap(rows[i]);
    if (m) {
      cols = m;
      start = i + 1;
      break;
    }
  }
  if (!cols) {
    throw new FiscalReportParseError(
      "Kassa apparati hisoboti tanilmadi: \"Сумма (тўлов терминали)\" ustuni topilmadi.",
    );
  }
  if (!cols.date) {
    throw new FiscalReportParseError(
      cols.fm
        ? "Bu OYLIK hisobot (apparatlar kesimi). Kunma-kun sverka uchun \"Сана\" ustuni bo'lgan KUNLIK hisobot kerak."
        : "Hisobotda \"Сана\" ustuni yo'q — kunma-kun sverka qilib bo'lmaydi.",
    );
  }

  const out: FiscalDailyRow[] = [];
  const warnings: string[] = [];
  // "naqd + karta ≠ jami" KESIM hisobotida qonuniy holat (ikkalasi ham nol,
  // summa esa "Жами" da), shuning uchun ogohlantirishlar keyinga qoldiriladi
  // va faqat oddiy hisobotda chiqariladi.
  const mismatches: string[] = [];
  let skipped = 0;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const date = cellDate(r[cols.date]);
    if (!date) {
      // "Jami" yakun qatori va bo'sh qatorlar — kutilgan holat, ogohlantirilmaydi.
      const raw = String(r[cols.date] ?? "").trim();
      if (raw && !/^(jami|жами|итого|total)$/i.test(raw)) skipped++;
      continue;
    }
    const fm = cols.fm ? String(r[cols.fm] ?? "").trim() || null : fallbackFm;
    const cash = num(r[cols.cash!]);
    const card = num(r[cols.card!]);
    const total = cols.total ? num(r[cols.total]) : cash + card;
    // Naqd + karta = jami tenglikni faylning O'ZI buzsa, buni yashirmaymiz:
    // demak ustun noto'g'ri tanilgan yoki eksport buzuq.
    if (cols.total && Math.abs(cash + card - total) > 1) {
      mismatches.push(`${fm ?? "?"} · ${String(r[cols.date])}: naqd + karta ≠ jami (${cash} + ${card} ≠ ${total})`);
    }
    out.push({
      fmNumber: fm,
      inn: cols.inn ? String(r[cols.inn] ?? "").trim() || null : null,
      date,
      cashAmount: cash,
      cardAmount: card,
      totalAmount: total,
      returnedAmount: cols.returned ? num(r[cols.returned]) : 0,
      receiptCount: cols.receipts ? Math.round(num(r[cols.receipts])) : 0,
    });
  }
  if (!out.length) throw new FiscalReportParseError("Hisobotda birorta kunlik qator topilmadi");
  if (skipped) warnings.push(`${skipped} ta qator sanasi o'qilmadi va tashlab ketildi`);

  // KESIM SHAKLI: hamma kunda naqd ham, terminal ham nol, lekin savdo bor.
  // Nol kunlarga bardosh berish uchun "hammasi nol" emas, "hech birida
  // naqd/terminal yo'q, lekin bittasida summa bor" deb tekshiriladi.
  const isBreakdown =
    out.every((r) => r.cashAmount === 0 && r.cardAmount === 0) && out.some((r) => r.totalAmount > 0);
  let channel: PosChannel | null = null;
  if (isBreakdown) {
    // Sarlavha USTIDAGI qatorlarda filtr yozuvi bo'ladi, ustunda esa "Тўлов
    // тури" — ikkalasi ham shu oynaga tushadi.
    channel = detectChannel(rows.slice(0, start + 3)) ?? (channelHint ? channelFromText(channelHint) : null);
    if (!channel) {
      // JIM QABUL QILINMAYDI. Kanali noma'lum kesim asosiy hisobot bilan
      // bir xil ko'rinadi va kassa yig'indisiga qo'shilib savdoni ikki
      // marta sanaydi — aynan shu xato oldin fayl nomiga tayanish tufayli
      // yuz bergan.
      throw new FiscalReportParseError(
        "Bu to'lov turi bo'yicha KESIM hisoboti (naqd va terminal ustunlari nol), " +
          "lekin kanal aniqlanmadi. Fayl ichida kanal nomi (Click, Payme, Uzum, HUMO, UzCard...) topilmadi.",
      );
    }
  } else {
    warnings.push(...mismatches);
  }

  const dates = out.map((r) => r.date.getTime());
  return {
    rows: out,
    periodFrom: new Date(Math.min(...dates)),
    periodTo: new Date(Math.max(...dates)),
    warnings,
    isBreakdown,
    channel,
  };
}

/** Kitobdagi birinchi mos sahifadan o'qiydi (sahifa nomi har xil bo'ladi). */
export function parseFiscalWorkbook(
  workbook: Record<string, SheetRow[]>,
  fallbackFm: string | null = null,
  channelHint: string | null = null,
): ParsedFiscalReport {
  const sheets = Object.entries(workbook);
  if (!sheets.length) throw new FiscalReportParseError("Faylda sahifa yo'q");
  const errors: string[] = [];
  for (const [name, rows] of sheets) {
    try {
      return parseFiscalRows(rows, fallbackFm, channelHint);
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}`);
    }
  }
  throw new FiscalReportParseError(errors.join(" · "));
}

/**
 * Fayl nomidan FM raqamini taxmin qiladi ("0718.xlsx" → "0718").
 *
 * Kunlik eksportda apparat raqami faylning O'ZIDA bo'lmaydi — soliq kabineti
 * uni fayl nomiga qo'yadi. To'liq FM raqami bazadagi apparat bilan oxiridan
 * moslashtiriladi (`matchDeviceByHint`).
 */
export function fmHintFromFileName(fileName: string): string | null {
  const base = fileName.replace(/\.[a-z0-9]+$/i, "").trim();
  return /^[A-Za-z0-9]{3,20}$/.test(base) ? base : null;
}

/** Fayl nomidagi qisqartma bo'yicha apparatni topadi (oxiri bilan mos kelsa). */
export function matchDeviceByHint<T extends { fmNumber: string }>(devices: T[], hint: string | null): T | null {
  if (!hint) return null;
  const h = hint.toUpperCase();
  const exact = devices.find((d) => d.fmNumber.toUpperCase() === h);
  if (exact) return exact;
  const tail = devices.filter((d) => d.fmNumber.toUpperCase().endsWith(h));
  // Bir nechta apparat bir xil oxir bilan tugasa — taxmin qilinmaydi.
  return tail.length === 1 ? tail[0] : null;
}
