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
import { columnAppliesToRegime } from "./reportApplicability";
import { TAX_REGIME_LABEL } from "./taxRegimes";

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

/**
 * USTUN KESIMI: qator ro'yxatda qoladimi.
 *
 * Ikki shart BIRGA tekshiriladi:
 *   1. ustun shu firmaning soliq rejimiga tegishlimi;
 *   2. katak qiymati so'ralgan holatga mos keladimi.
 *
 * Birinchisi qo'shilishining sababi: "Aylanma Hisobot" kesimida ro'yxatda 257
 * ta firma qolardi — QQS to'lovchilar ham, garchi ularning katagi "—" bo'lsa
 * ham. Buxgalter buni "QQS firma aylanmada chiqyapti" deb o'qirdi, foiz esa
 * 257 tadan hisoblanib yolg'on gapirardi.
 */
export function passesColumnSection(opts: {
  colKey: string;
  colStatus: ColStatusFilter;
  regime: string | null | undefined;
  value: unknown;
}): boolean {
  if (opts.colKey === "all") return true;
  if (!columnAppliesToRegime(opts.colKey, opts.regime)) return false;
  return matchesColStatus(opts.value, opts.colStatus);
}

// ── Filtr holati ─────────────────────────────────────────────────

/**
 * Barcha filtrlar bitta obyektda. Har bir maydonning "o'chiq" qiymati — `all`
 * (ustun holati uchun `any`), shu bois `isFilterActive` oddiy solishtirish.
 */
export interface MatrixFilters {
  /**
   * XODIM — o'rni AHAMIYATSIZ (buxgalter / nazoratchi / bosh buxgalter /
   * bank-klient — qaysi biri bo'lsa ham).
   *
   * Nima uchun alohida maydon kerak bo'ldi: filtrda faqat to'rtta O'RIN bor
   * edi va foydalanuvchi odamni odatda o'rni bilan emas, ISMI bilan qidiradi.
   * Ruslan 65 firmada bank-klient, buxgalter esa birortasida ham emas —
   * "Buxgalter → Ruslan" bo'sh jadval berardi va bu "firmalari yo'qoldi" deb
   * o'qilardi. Bu maydon shu savolga bitta qadamda javob beradi.
   */
  person: string;
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
  /**
   * Ustun tanlanganda jadvalda FAQAT o'sha ustun qolsinmi ("1"/"0").
   *
   * Sukut bo'yicha YOQILGAN. Sabab: "INPS ni kim topshirmagan?" deb ustun
   * tanlagan odam 47 ta ustunni emas, o'sha bitta ustunni ko'rmoqchi bo'ladi —
   * qolganlari chiziqchalar devori bo'lib turadi. Yoqilganda butun ekran shu
   * hisobot rejimiga o'tadi: foiz ham, sanoqlar ham, "bajarilish" filtri ham
   * FAQAT shu ustunni hisoblaydi.
   *
   * O'chirilsa — ustun kesimi qatorlarni filtrlaydi, lekin qolgan ustunlar
   * ham ko'rinib turadi (kontekst kerak bo'lganda).
   */
  colOnly: string;
}

/** Barcha filtr maydonlari — barqaror tartibda (imzo qurish uchun). */
export const FILTER_FIELDS = [
  "person", "accountant", "supervisor", "chief", "bank",
  "regime", "department", "colKey", "colStatus", "colOnly",
] as const satisfies readonly (keyof MatrixFilters)[];

export const EMPTY_FILTERS: MatrixFilters = {
  person: "all",
  accountant: "all",
  supervisor: "all",
  chief: "all",
  bank: "all",
  regime: "all",
  department: "all",
  colKey: "all",
  colStatus: "any",
  colOnly: "1",
};

/**
 * URL kalitlari. Qisqa — matritsa havolasida allaqachon `mx_q`, `mx_st`,
 * `mx_sort` bor va manzil o'qib bo'lmas holga kelmasligi kerak.
 */
export const FILTER_URL_KEYS: Record<keyof MatrixFilters, string> = {
  person: "per",
  accountant: "acc",
  supervisor: "sup",
  chief: "chf",
  bank: "bnk",
  regime: "reg",
  department: "dep",
  colKey: "col",
  colStatus: "cst",
  colOnly: "conly",
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
    person: read(FILTER_URL_KEYS.person, "all"),
    accountant: read(FILTER_URL_KEYS.accountant, "all"),
    supervisor: read(FILTER_URL_KEYS.supervisor, "all"),
    chief: read(FILTER_URL_KEYS.chief, "all"),
    bank: read(FILTER_URL_KEYS.bank, "all"),
    regime: read(FILTER_URL_KEYS.regime, "all"),
    department: read(FILTER_URL_KEYS.department, "all"),
    colKey: read(FILTER_URL_KEYS.colKey, "all"),
    colOnly: read(FILTER_URL_KEYS.colOnly, "1") === "0" ? "0" : "1",
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
    // Ustun + holat + "faqat shu ustun" BITTA filtr deb sanaladi: ular birga
    // bitta savolni ifodalaydi.
    if (key === "colStatus" || key === "colOnly") continue;
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

/** Qatordagi to'rt o'rindagi haqiqiy ismlar (bo'shlari tashlanadi). */
function slotNames(r: RowFacets): string[] {
  const out: string[] = [];
  for (const raw of [r.accountant, r.supervisor, r.chief, r.bank]) {
    const v = (raw ?? "").trim();
    if (v && v !== "—" && !out.includes(v)) out.push(v);
  }
  return out;
}

/** Tanlagichdagi bitta variant — nomi va shu nom nechta firmada uchrashi. */
export interface FacetOption {
  value: string;
  count: number;
}

/**
 * Bitta O'RIN bo'yicha variantlar (nomi + firmalar soni), alifbo tartibida.
 *
 * SANOQ SHUNING UCHUN KERAK: ro'yxatda turgan, lekin shu o'rinda hech qanday
 * firmasi yo'q odamni tanlash bo'sh jadval berardi va buni foydalanuvchi
 * "firmalar yo'qolib qoldi" deb o'qirdi. "Ruslan — 0" esa o'zini o'zi
 * tushuntiradi.
 */
export function slotFacetOptions(
  rows: readonly RowFacets[],
  pick: (r: RowFacets) => string,
  extraNames: readonly string[] = [],
): FacetOption[] {
  const counts = new Map<string, number>();
  for (const name of extraNames) {
    const v = (name ?? "").trim();
    if (v && v !== "—") counts.set(v, counts.get(v) ?? 0);
  }
  for (const r of rows) {
    const v = (pick(r) ?? "").trim();
    if (!v || v === "—") continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value, "uz"));
}

/**
 * "Istalgan o'rin" variantlari: xodim to'rt o'rindan birortasida tursa ham
 * sanaladi, lekin BITTA firma bir marta (bir odam bir firmada ham buxgalter,
 * ham bank-klient bo'lishi mumkin).
 */
export function personFacetOptions(
  rows: readonly RowFacets[],
  extraNames: readonly string[] = [],
): FacetOption[] {
  const counts = new Map<string, number>();
  for (const name of extraNames) {
    const v = (name ?? "").trim();
    if (v && v !== "—") counts.set(v, counts.get(v) ?? 0);
  }
  for (const r of rows) {
    for (const name of slotNames(r)) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value, "uz"));
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
  // "Xodim" — TO'RTTA o'rindan birortasi mos kelsa yetarli. Qolgan filtrlar
  // bilan VA orqali birikadi ("Ruslan" + "QQS to'lovchilar" ma'noli savol).
  if (f.person !== "all" && !slotNames(facets).includes(f.person)) return false;
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

/**
 * Soliq rejimi yorliqlari — `lib/taxRegimes.ts` dan.
 *
 * Ilgari ro'yxat SHU YERDA takrorlangan edi va "QQS (VAT)" deb yozilardi;
 * korxonada esa kundalik atama "NDS". Yagona manba shu bilan birga wizard
 * tanlagichini ham oziqlantiradi.
 */
export const REGIME_LABEL: Record<string, string> = TAX_REGIME_LABEL;

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

  push("person", "Xodim", f.person);
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
