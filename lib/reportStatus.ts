// lib/reportStatus.ts
// Amallar matritsasi KATAK QIYMATINI talqin qilishning YAGONA manbai.
//
// NEGA KERAK: bu mantiq `OperationModule` ichida TO'RT marta takrorlangan edi
// (`stats.countValue`, `rowCompletion`, `accountantProgress`, `categoryProgress`)
// va har birida boshqacha:
//   * `stats` — 'nol' ni `val.length > 1` tarmog'iga tushirib IZOH deb sanardi;
//   * `rowCompletion` — 'nol' ni maxrajga qo'shib, surat(done)ga qo'shmasdi,
//     ya'ni barcha hisobotini nol topshirgan firma 0% ko'rinardi;
//   * `getStatusStyle` — 'topshirmaydi' ni izoh deb chizardi, `stats` esa uni
//     "shart emas" deb sanardi.
// `lib/reportPermissions.ts` (CELL_ZERO_REPORT izohi) aynan shundan
// ogohlantirgan: "ikkisi bir belgiga tushib qolsa matritsa yolg'on gapiradi".
//
// Endi filtr, foiz va rang BITTA tasniflagichdan oziqlanadi.

/** Katakning ma'no darajasidagi holati (xom matn emas). */
export type CellStatus =
  /** Bo'sh / "shart emas" — bu firmada bu hisobot talab qilinmaydi. */
  | "none"
  /** "+" — nazoratchi tasdiqlagan. */
  | "approved"
  /** Buxgalter topshirgan, tasdiq kutilmoqda. */
  | "submitted"
  /** Nol hisobot topshirilgan (nil deklaratsiya) — BAJARILGAN ish. */
  | "zero"
  /** Kartoteka — hisob bloklangan, ish yopilmagan. */
  | "blocked"
  /** "-" — topshirilmagan. */
  | "failed"
  /** Xatolik qaytgan. */
  | "error"
  /** Erkin matn (izoh) — ko'rib chiqilishi kerak. */
  | "note";

const NONE = new Set(["", "0", "not_required", "topshirmaydi"]);
const APPROVED = new Set(["+", "accepted"]);
const SUBMITTED = new Set(["topshirildi", "submitted"]);
const ZERO = new Set(["nol"]);
const BLOCKED = new Set(["kartoteka", "blocked"]);
const FAILED = new Set(["-", "not_submitted", "rejected", "rad etildi"]);
const ERROR = new Set(["error", "oshibka"]);

/** Xom katak qiymatini holatga aylantiradi. Registr va bo'shliq ahamiyatsiz. */
export function classifyCell(raw: unknown): CellStatus {
  const v = String(raw ?? "").trim().toLowerCase();
  if (NONE.has(v)) return "none";
  if (APPROVED.has(v)) return "approved";
  if (SUBMITTED.has(v)) return "submitted";
  if (ZERO.has(v)) return "zero";
  if (BLOCKED.has(v)) return "blocked";
  if (FAILED.has(v)) return "failed";
  if (ERROR.has(v)) return "error";
  return "note";
}

/**
 * Ish YOPILGANMI.
 *
 * `zero` shu yerda: nol hisobot ham topshirilgan hisobot. `submitted` ham —
 * buxgalter ishini qilgan, tasdiq nazoratchida (mavjud foiz mantig'i shunday
 * edi, saqlab qolindi).
 */
export function isSettled(s: CellStatus): boolean {
  return s === "approved" || s === "submitted" || s === "zero";
}

/** Talab qilinadigan katakmi (maxrajga kiradimi). */
export function isRequired(s: CellStatus): boolean {
  return s !== "none";
}

/** Bir qator (yoki ixtiyoriy to'plam) bo'yicha katak hisobi. */
export interface StatusTally {
  approved: number;
  submitted: number;
  zero: number;
  blocked: number;
  failed: number;
  error: number;
  note: number;
  /** Talab qilingan kataklar soni (bo'shlar hisobga olinmaydi). */
  required: number;
  /** Yopilgan: approved + submitted + zero. */
  settled: number;
  /** Qolgan ish: blocked + failed + error + note. */
  outstanding: number;
}

export function emptyTally(): StatusTally {
  return {
    approved: 0, submitted: 0, zero: 0,
    blocked: 0, failed: 0, error: 0, note: 0,
    required: 0, settled: 0, outstanding: 0,
  };
}

/** Bitta katakni mavjud hisobga qo'shadi (o'sha obyektni o'zgartiradi). */
export function addToTally(tally: StatusTally, raw: unknown): CellStatus {
  const s = classifyCell(raw);
  if (s === "none") return s;
  tally[s]++;
  tally.required++;
  if (isSettled(s)) tally.settled++;
  else tally.outstanding++;
  return s;
}

export function tally(values: Iterable<unknown>): StatusTally {
  const t = emptyTally();
  for (const v of values) addToTally(t, v);
  return t;
}

/** Bajarilish ulushi 0..1. Talab qilingan katak bo'lmasa — 0. */
export function settledRatio(t: StatusTally): number {
  return t.required > 0 ? t.settled / t.required : 0;
}

// ── Matritsa qator filtri ────────────────────────────────────────

export type MatrixStatusFilter =
  | "all"
  | "done"
  | "pending"
  | "kartoteka"
  | "nol"
  | "izoh";

export const DEFAULT_STATUS_FILTER: MatrixStatusFilter = "all";

export interface StatusFilterOption {
  value: MatrixStatusFilter;
  label: string;
  /** Menyuda ko'rinadigan bir qatorlik tushuntirish. */
  hint: string;
  /** Menyudagi belgi — matritsa afsonasidagi belgilar bilan bir xil. */
  icon: string;
}

/**
 * Filtr variantlari. Tartib ATAYLAB shunday: eng ko'p ishlatiladigan ikkitasi
 * tepada, keyin maxsus toifalar.
 *
 * DIQQAT — "bo'sh katak" qoidasi: matritsada bo'sh katak "bu firmada bu hisobot
 * SHART EMAS" degani (afsonadagi "—"). Shuning uchun hech bir katagi
 * belgilanmagan firma na "bajarilgan", na "bajarilmagan" — u faqat "Barchasi"
 * da ko'rinadi. Aks holda 265 firmaning deyarli hammasi "Bajarilmaganlar" ga
 * tushib, filtr ma'nosini yo'qotardi.
 */
export const MATRIX_STATUS_FILTERS: readonly StatusFilterOption[] = [
  { value: "all", label: "Barchasi", hint: "Filtrsiz — barcha firmalar", icon: "≡" },
  { value: "done", label: "Bajarilganlar", hint: "Belgilangan kataklarning hammasi yopilgan", icon: "✓" },
  { value: "pending", label: "Bajarilmaganlar", hint: "Kamida bitta ish qolgan", icon: "✗" },
  { value: "kartoteka", label: "Kartoteka", hint: "Kartotekaga tushgan — hisobot topshirilishi shart", icon: "!" },
  { value: "nol", label: "Nol firmalar", hint: "Nol hisobot topshirilgan (aylanmasi yo'q)", icon: "Ø" },
  { value: "izoh", label: "Izohli", hint: "Erkin matn yozilgan — tekshirilishi kerak", icon: "✎" },
];

/** URL'dan kelgan xom qiymatni xavfsiz filtrga aylantiradi. */
export function parseStatusFilter(raw: string | null | undefined): MatrixStatusFilter {
  const v = String(raw ?? "").trim().toLowerCase();
  const hit = MATRIX_STATUS_FILTERS.find((o) => o.value === v);
  return hit ? hit.value : DEFAULT_STATUS_FILTER;
}

/**
 * Qator filtrga mos keladimi.
 *
 * "Izohli" filtri alohida mexanizm TALAB QILMAYDI: nazoratchi izohli katakka
 * "+" qo'ysa, katak `note` dan `approved` ga o'tadi, qatorning hisobi qayta
 * hisoblanadi va qator o'zi "Izohli" dan chiqib "Bajarilganlar" ga tushadi.
 * Filtr xotirada saqlanmaydi — u har doim joriy katak qiymatlaridan chiqariladi.
 */
export function matchesStatusFilter(t: StatusTally, filter: MatrixStatusFilter): boolean {
  switch (filter) {
    case "done":
      return t.required > 0 && t.outstanding === 0;
    case "pending":
      return t.outstanding > 0;
    case "kartoteka":
      return t.blocked > 0;
    case "nol":
      return t.zero > 0;
    case "izoh":
      return t.note > 0;
    case "all":
    default:
      return true;
  }
}
