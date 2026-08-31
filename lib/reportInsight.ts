// lib/reportInsight.ts
// "Bitta hisobot — bitta kesim — aniq javob" hisoblagichi.
//
// NEGA ALOHIDA QATLAM: `lib/matrixFilters.ts` savolni TORAYTIRADI (qaysi
// qatorlar ko'rinsin), lekin javobni BERMAYDI. Nazoratchining haqiqiy savoli
// esa boshqacha:
//     "INPS bo'yicha Go'zaloyning foizi qancha va kim topshirmagan?"
// Buni filtr bilan qilish uchun odam avval filtrni yig'ib, keyin qatorlarni
// qo'lda sanashi kerak edi. Bu modul o'sha sanoqni bir o'tishda bajaradi.

import {
  addToTally,
  emptyTally,
  mergeTally,
  settledRatio,
  type CellStatus,
  type StatusTally,
} from "./reportStatus";
import { compareText } from "@/lib/collate";

/** Qatorlarni qaysi belgi bo'yicha guruhlash. */
export type InsightDimension =
  | "company"
  | "accountant"
  | "supervisor"
  | "chief"
  | "bank"
  | "department";

export interface InsightDimensionOption {
  value: InsightDimension;
  label: string;
  /** Guruhda a'zo bo'lmagan qator uchun yorliq. */
  empty: string;
}

export const INSIGHT_DIMENSIONS: readonly InsightDimensionOption[] = [
  { value: "accountant", label: "Buxgalter",      empty: "Biriktirilmagan" },
  { value: "supervisor", label: "Nazoratchi",     empty: "Nazoratchisiz" },
  { value: "chief",      label: "Bosh buxgalter", empty: "Bosh buxgaltersiz" },
  { value: "bank",       label: "Bank-klient",    empty: "Bank-klientsiz" },
  { value: "department", label: "Bo'lim",         empty: "Bo'limsiz" },
  { value: "company",    label: "Firma",          empty: "—" },
];

/** Hisoblash uchun qatordan kerak bo'ladigan minimal ma'lumot. */
export interface InsightSourceRow {
  companyId?: string;
  name: string;
  inn: string;
  accountant: string;
  supervisor: string;
  chief: string;
  bank: string;
  department: string;
  /**
   * Tanlangan ustun(lar)dagi kataklar.
   *
   * `required` — majburiyat dvigateli shu firmadan shu hisobotni talab
   * qiladimi. Talab qilinsa-yu katak bo'sh bo'lsa, u maxrajga kiradi
   * (`missing`). Busiz foiz "kimdir belgilagan kataklardan" hisoblanardi.
   */
  cells: readonly { value: unknown; required: boolean }[];
}

/** Bitta firmaning tanlangan hisobot(lar) bo'yicha holati. */
export interface InsightRowResult {
  companyId?: string;
  name: string;
  inn: string;
  accountant: string;
  supervisor: string;
  tally: StatusTally;
  /**
   * Ko'rsatish uchun eng "og'riqli" holat: bitta ustun tanlanganda katakning
   * o'zi, bir nechta ustunda esa eng jiddiy ochiq muammo.
   */
  worst: CellStatus;
}

export interface InsightGroup {
  key: string;
  label: string;
  tally: StatusTally;
  /** 0..100, butun son. */
  percent: number;
  /** Ishi qolgan firmalar — "kim topshirmagan" ro'yxati. */
  pending: InsightRowResult[];
  /** Guruhdagi jami firma (shu hisobot ular uchun shart bo'lmasa ham). */
  companies: number;
}

export interface InsightResult {
  overall: InsightGroup;
  groups: InsightGroup[];
}

/**
 * Ochiq muammolarning jiddiylik tartibi — ro'yxatda nima birinchi ko'rinishini
 * va qatorning "worst" belgisini shu hal qiladi.
 *
 * `failed` (topshirilmagan) birinchi: u to'g'ridan-to'g'ri kechikish.
 * `blocked` (kartoteka) keyingi: ish bajarilgan bo'lishi mumkin, lekin
 * hisob bloklangan. `note` oxirgi: u ko'pincha izoh, muammo emas.
 */
const SEVERITY: CellStatus[] = ["failed", "missing", "error", "blocked", "note", "none", "submitted", "zero", "approved"];
const severityOf = (s: CellStatus) => {
  const i = SEVERITY.indexOf(s);
  return i === -1 ? SEVERITY.length : i;
};

const pct = (t: StatusTally) => Math.round(settledRatio(t) * 100);

/** Qatordan guruh kalitini olish. */
function groupKeyOf(row: InsightSourceRow, dim: InsightDimension, empty: string): string {
  if (dim === "company") return row.name;
  const raw = (row[dim] ?? "").trim();
  return !raw || raw === "—" ? empty : raw;
}

/**
 * Asosiy hisoblagich.
 *
 * Bir o'tishda: har bir qatorning hisobi, guruhlar kesimi va "topshirmaganlar"
 * ro'yxati. Guruhlar ENG YOMONI birinchi bo'lib tartiblanadi — nazoratchi
 * ekranni ochganda eng avval kimga qarash kerakligini ko'rsin, alfavitni emas.
 */
export function buildInsight(
  rows: readonly InsightSourceRow[],
  dimension: InsightDimension
): InsightResult {
  const emptyLabel =
    INSIGHT_DIMENSIONS.find((d) => d.value === dimension)?.empty ?? "—";

  const overallTally = emptyTally();
  let overallCompanies = 0;
  const overallPending: InsightRowResult[] = [];
  const byKey = new Map<string, { tally: StatusTally; pending: InsightRowResult[]; companies: number }>();

  for (const row of rows) {
    const tally = emptyTally();
    let worst: CellStatus = "approved";
    for (const cell of row.cells) {
      const s = addToTally(tally, cell.value, cell.required);
      if (severityOf(s) < severityOf(worst)) worst = s;
    }

    const key = groupKeyOf(row, dimension, emptyLabel);
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = { tally: emptyTally(), pending: [], companies: 0 };
      byKey.set(key, bucket);
    }

    mergeTally(bucket.tally, tally);
    mergeTally(overallTally, tally);
    bucket.companies++;
    overallCompanies++;

    if (tally.outstanding > 0) {
      const result: InsightRowResult = {
        companyId: row.companyId,
        name: row.name,
        inn: row.inn,
        accountant: row.accountant,
        supervisor: row.supervisor,
        tally,
        worst,
      };
      bucket.pending.push(result);
      overallPending.push(result);
    }
  }

  const sortPending = (list: InsightRowResult[]) =>
    list.sort(
      (a, b) =>
        severityOf(a.worst) - severityOf(b.worst) ||
        b.tally.outstanding - a.tally.outstanding ||
        compareText(a.name, b.name)
    );

  const groups: InsightGroup[] = [...byKey.entries()]
    .map(([key, b]) => ({
      key,
      label: key,
      tally: b.tally,
      percent: pct(b.tally),
      pending: sortPending(b.pending),
      companies: b.companies,
    }))
    .sort(
      (a, b) =>
        // Eng ko'p ish qolgani tepada; teng bo'lsa foizi pasti; keyin alfavit.
        b.tally.outstanding - a.tally.outstanding ||
        a.percent - b.percent ||
        compareText(a.label, b.label)
    );

  return {
    overall: {
      key: "__all__",
      label: "Jami",
      tally: overallTally,
      percent: pct(overallTally),
      pending: sortPending(overallPending),
      companies: overallCompanies,
    },
    groups,
  };
}

/** Holat → qisqa yorliq (ro'yxatdagi nishon uchun). */
export const STATUS_LABEL: Record<CellStatus, string> = {
  none: "Belgilanmagan",
  missing: "Topshirilmagan (belgilanmagan)",
  approved: "Tasdiqlangan",
  submitted: "Topshirildi",
  zero: "Nol hisobot",
  blocked: "Kartoteka",
  failed: "Topshirilmagan",
  error: "Xatolik",
  note: "Izoh",
};

export const STATUS_ICON: Record<CellStatus, string> = {
  none: "—",
  missing: "○",
  approved: "✓",
  submitted: "·",
  zero: "Ø",
  blocked: "!",
  failed: "✗",
  error: "!",
  note: "✎",
};

/**
 * "Topshirmaganlar" ro'yxatini matn sifatida — Telegramga tashlash yoki
 * yig'ilishga olib kirish uchun. Ekrandan qo'lda ko'chirish eng ko'p
 * so'raladigan ish.
 */
export function pendingAsText(
  title: string,
  pending: readonly InsightRowResult[]
): string {
  if (pending.length === 0) return `${title}\n(hammasi topshirilgan)`;
  const lines = pending.map(
    (p, i) => `${i + 1}. ${p.name} — ${p.accountant} (${STATUS_LABEL[p.worst]})`
  );
  return [`${title} — ${pending.length} ta`, ...lines].join("\n");
}
