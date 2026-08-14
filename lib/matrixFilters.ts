// lib/matrixFilters.ts
// Amallar matritsasining QATOR filtrlari — yagona manba.
//
// MUAMMO: asboblar panelidagi tugmalarning aksariyati filtr EMAS edi.
// "Barcha ustunlar" ustunlarni yashiradi (qatorni filtrlamaydi), "Bajarilish"
// esa saralardi. Natijada eng kerakli savollarga javob topib bo'lmasdi:
//   * "AQh ni kim topshirmagan?"          — ustun kesimida filtr yo'q edi;
//   * "Go'zaloy nazorat qiladigan firmalar" — faqat BUXGALTER filtri bor edi;
//   * "QQS to'lovchi firmalardan qaysi biri kartotekada?" — rejim filtri yo'q.
//
// Bu modul sof: DOM ham, React ham bilmaydi — shuning uchun `lib/**/*.spec.ts`
// da DB'siz sinaladi.

import { classifyCell, isSettled, type CellStatus } from "./reportStatus";

// ── Ustun kesimidagi holat ───────────────────────────────────────

/**
 * Bitta USTUN uchun qidiriladigan holat.
 *
 * `CellStatus` ustiga ikkita birlashma qo'shilgan: kundalik savol odatda
 * "yopilganmi yoki yo'qmi" darajasida bo'ladi, sakkizta holatni birma-bir
 * tanlash shart emas.
 */
export type ColStatusFilter =
  | "any"
  | "settled"      // yopilgan: + / topshirildi / nol
  | "outstanding"  // qolgan ish: kartoteka / - / xatolik / izoh
  | CellStatus;

export interface ColStatusOption {
  value: ColStatusFilter;
  label: string;
  icon: string;
}

export const COL_STATUS_OPTIONS: readonly ColStatusOption[] = [
  { value: "any",         label: "Har qanday holat", icon: "≡" },
  { value: "outstanding", label: "Qolgan ish",       icon: "!" },
  { value: "settled",     label: "Yopilgan",         icon: "✓" },
  { value: "approved",    label: "Tasdiqlangan (+)", icon: "✓" },
  { value: "submitted",   label: "Topshirildi",      icon: "·" },
  { value: "zero",        label: "Nol hisobot",      icon: "Ø" },
  { value: "blocked",     label: "Kartoteka",        icon: "!" },
  { value: "failed",      label: "Bajarilmadi (-)",  icon: "✗" },
  { value: "note",        label: "Izohli",           icon: "✎" },
  { value: "none",        label: "Belgilanmagan",    icon: "—" },
];

/** Katak qiymati shu ustun-filtriga mos keladimi. */
export function matchesColStatus(raw: unknown, filter: ColStatusFilter): boolean {
  if (filter === "any") return true;
  const s = classifyCell(raw);
  if (filter === "settled") return isSettled(s);
  if (filter === "outstanding") return s !== "none" && !isSettled(s);
  return s === filter;
}

// ── Filtr holati ─────────────────────────────────────────────────

/**
 * Barcha filtrlar bitta obyektda. Har bir maydonning "o'chiq" qiymati — `all`
 * (ustun holati uchun `any`), shu bois `isFilterActive` oddiy solishtirish.
 */
export interface MatrixFilters {
  /** Mas'ul shaxslar — nomi bo'yicha (`ReportRow` da nom saqlanadi). */
  accountant: string;
  supervisor: string;
  chief: string;
  bank: string;
  /** Firma xossalari. */
  regime: string;
  department: string;
  /** Ustun kesimi: qaysi ustunda + qanday holat. */
  colKey: string;
  colStatus: ColStatusFilter;
}

/** Barcha filtr maydonlari — barqaror tartibda (imzo qurish uchun). */
export const FILTER_FIELDS = [
  "accountant", "supervisor", "chief", "bank",
  "regime", "department", "colKey", "colStatus",
] as const satisfies readonly (keyof MatrixFilters)[];

export const EMPTY_FILTERS: MatrixFilters = {
  accountant: "all",
  supervisor: "all",
  chief: "all",
  bank: "all",
  regime: "all",
  department: "all",
  colKey: "all",
  colStatus: "any",
};

/**
 * URL kalitlari. Qisqa — matritsa havolasida allaqachon `mx_q`, `mx_st`,
 * `mx_sort` bor va manzil o'qib bo'lmas holga kelmasligi kerak.
 */
export const FILTER_URL_KEYS: Record<keyof MatrixFilters, string> = {
  accountant: "acc",
  supervisor: "sup",
  chief: "chf",
  bank: "bnk",
  regime: "reg",
  department: "dep",
  colKey: "col",
  colStatus: "cst",
};

const COL_STATUS_VALUES = new Set<string>(COL_STATUS_OPTIONS.map((o) => o.value));

/** URL'dan (yoki har qanday kalit-qiymat manbaidan) filtrlarni o'qish. */
export function parseFilters(get: (key: string) => string | null | undefined): MatrixFilters {
  const read = (key: string, fallback: string) => {
    const v = get(key);
    return v == null || v === "" ? fallback : v;
  };
  const rawStatus = read(FILTER_URL_KEYS.colStatus, "any");
  return {
    accountant: read(FILTER_URL_KEYS.accountant, "all"),
    supervisor: read(FILTER_URL_KEYS.supervisor, "all"),
    chief: read(FILTER_URL_KEYS.chief, "all"),
    bank: read(FILTER_URL_KEYS.bank, "all"),
    regime: read(FILTER_URL_KEYS.regime, "all"),
    department: read(FILTER_URL_KEYS.department, "all"),
    colKey: read(FILTER_URL_KEYS.colKey, "all"),
    // Noma'lum qiymat butun matritsani bo'sh qoldirmasligi kerak.
    colStatus: (COL_STATUS_VALUES.has(rawStatus) ? rawStatus : "any") as ColStatusFilter,
  };
}

/**
 * Filtrlarning barqaror "imzosi" — React memo kaliti uchun.
 *
 * `useTableState` har renderda YANGI `filters` obyektini qaytaradi, shu bois
 * uni to'g'ridan-to'g'ri `useMemo` bog'liqligi qilib bo'lmaydi: 263 qatorli
 * jadval har renderda qayta filtrlanardi. Imzo esa oddiy satr — qiymat
 * o'zgarmasa, u ham o'zgarmaydi.
 */
export function filtersSignature(get: (key: string) => string | null | undefined): string {
  // Ajratgich (U+0001) SHART: usiz ("ab" + "c") va ("a" + "bc") bir xil imzo
  // berardi, ya'ni ikki xil filtr to'plami bitta deb qaralib ekran yangilanmasdi.
  return FILTER_FIELDS.map((k) => get(FILTER_URL_KEYS[k]) ?? "").join("");
}

/** Nechta filtr yoqilgan (tugmadagi belgi uchun). */
export function activeFilterCount(f: MatrixFilters): number {
  let n = 0;
  for (const key of Object.keys(EMPTY_FILTERS) as (keyof MatrixFilters)[]) {
    // Ustun + holat BITTA filtr deb sanaladi: ular birga ma'noga ega.
    if (key === "colStatus") continue;
    if (f[key] !== EMPTY_FILTERS[key]) n++;
  }
  return n;
}

// ── Qator moslashuvi ─────────────────────────────────────────────

/** Filtrlash uchun qatordan kerak bo'ladigan minimal ma'lumot. */
export interface RowFacets {
  accountant: string;
  supervisor: string;
  chief: string;
  bank: string;
  regime: string;
  department: string;
}

/**
 * Mas'ul/xossa filtrlari mos keladimi (ustun kesimi ALOHIDA — u ustun
 * qiymatini talab qiladi va chaqiruvchi tomonda tekshiriladi).
 *
 * Bo'sh qiymat ("", "—") hech qachon tanlangan filtrga mos kelmaydi: "Go'zaloy"
 * so'ralganda nazoratchisi yo'q firma chiqmasligi kerak.
 */
export function matchesFacets(facets: RowFacets, f: MatrixFilters): boolean {
  const eq = (value: string, wanted: string) => {
    if (wanted === "all") return true;
    const v = (value ?? "").trim();
    if (!v || v === "—") return false;
    return v === wanted;
  };
  return (
    eq(facets.accountant, f.accountant) &&
    eq(facets.supervisor, f.supervisor) &&
    eq(facets.chief, f.chief) &&
    eq(facets.bank, f.bank) &&
    eq(facets.regime, f.regime) &&
    eq(facets.department, f.department)
  );
}

/**
 * Qidiruv — bir nechta maydon bo'ylab.
 *
 * Avval faqat nom + INN + buxgalter qidirilardi. Endi direktor, nazoratchi va
 * bank-klient ham: nazoratchi "Go'zaloy" deb yozganda o'z portfelini
 * ko'rmoqchi bo'ladi, ro'yxatda esa hech narsa chiqmasdi.
 *
 * Bo'sh so'rov — hamma qator mos.
 */
export function matchesSearch(haystack: readonly (string | undefined)[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  for (const field of haystack) {
    if (field && field.toLowerCase().includes(q)) return true;
  }
  return false;
}

// ── Yorliqlar ────────────────────────────────────────────────────

/** Soliq rejimi kodi → ekrandagi nom (Company.taxRegime enum qiymatlari). */
export const REGIME_LABEL: Record<string, string> = {
  vat: "QQS (VAT)",
  turnover: "Aylanma",
  fixed: "Qat'iy soliq",
  yatt: "YaTT",
  income: "Daromad solig'i",
};

export const regimeLabel = (code: string): string => REGIME_LABEL[code] ?? code;

export interface FilterChip {
  /** Qaysi maydonni tozalash kerak. */
  key: keyof MatrixFilters;
  label: string;
  value: string;
}

/**
 * Yoqilgan filtrlarning ko'rinadigan ro'yxati.
 *
 * Panel yopilgach filtr ko'rinmas bo'lib qolmasligi kerak — foydalanuvchi
 * "nega faqat 12 ta firma?" degan savolga javobni ekranning o'zidan topsin.
 */
export function activeChips(
  f: MatrixFilters,
  colLabelOf: (key: string) => string
): FilterChip[] {
  const chips: FilterChip[] = [];
  const push = (key: keyof MatrixFilters, label: string, value: string) => {
    if (f[key] !== EMPTY_FILTERS[key]) chips.push({ key, label, value });
  };

  push("accountant", "Buxgalter", f.accountant);
  push("supervisor", "Nazoratchi", f.supervisor);
  push("chief", "Bosh buxgalter", f.chief);
  push("bank", "Bank-klient", f.bank);
  push("regime", "Rejim", regimeLabel(f.regime));
  push("department", "Bo'lim", f.department);

  if (f.colKey !== "all") {
    const status = COL_STATUS_OPTIONS.find((o) => o.value === f.colStatus);
    chips.push({
      key: "colKey",
      label: colLabelOf(f.colKey),
      value: status && f.colStatus !== "any" ? status.label : "har qanday holat",
    });
  }

  return chips;
}
