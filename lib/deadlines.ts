// =====================================================
// DEADLINE CALCULATOR — framework-free (Faza A / compliance engine)
// =====================================================
// Sof funksiyalar: template + davr → periodWindow → xom dueDate → ish kuniga
// surilgan dueAt. Prisma client CHAQIRILMAYDI (kalendar predikat sifatida
// beriladi) — shuning uchun to'liq unit-testlanadi.
//
// Vaqt: sanalar UTC yarim tunida (PeriodMonth uslubi). Biznes kunlar Asia/
// Tashkent'da yuritiladi; Tashkent DST'siz UTC+5, shuning uchun kun darajasidagi
// (date-only) muddat hisobi UTC bilan deterministik va mos.
import type {
  DeadlineTemplate,
  Periodicity,
  WorkdayAdjustmentPolicy,
} from "@prisma/client";

const MS_DAY = 86_400_000;

const pad = (n: number) => String(n).padStart(2, "0");
/** m — 1-asosli oy. */
const utcDate = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * MS_DAY);
/** m — 1-asosli oy; shu oydagi kunlar soni. */
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** UTC "YYYY-MM-DD" — kalendar/predikat kaliti. */
export const dateKey = (d: Date) => d.toISOString().slice(0, 10);

export interface PeriodWindow {
  /** Inclusive, UTC yarim tun. */
  periodStart: Date;
  /** Exclusive (keyingi davr boshi), UTC yarim tun. */
  periodEnd: Date;
  /** UI kaliti: "2026-M07" | "2026-Q3" | "2026-Y". */
  periodKey: string;
}

/** `ref` sanani o'z ichiga olgan davr oynasi (monthly/quarterly/annual). */
export function periodWindowFor(periodicity: Periodicity, ref: Date): PeriodWindow {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth() + 1; // 1-asosli

  if (periodicity === "monthly") {
    const periodStart = utcDate(y, m, 1);
    const periodEnd = m === 12 ? utcDate(y + 1, 1, 1) : utcDate(y, m + 1, 1);
    return { periodStart, periodEnd, periodKey: `${y}-M${pad(m)}` };
  }

  if (periodicity === "quarterly") {
    const q = Math.floor((m - 1) / 3) + 1; // 1..4
    const startMonth = (q - 1) * 3 + 1; // 1,4,7,10
    const periodStart = utcDate(y, startMonth, 1);
    const periodEnd = q === 4 ? utcDate(y + 1, 1, 1) : utcDate(y, startMonth + 3, 1);
    return { periodStart, periodEnd, periodKey: `${y}-Q${q}` };
  }

  // annual
  return { periodStart: utcDate(y, 1, 1), periodEnd: utcDate(y + 1, 1, 1), periodKey: `${y}-Y` };
}

type DueRule = Pick<DeadlineTemplate, "anchorType" | "dueDay" | "dueMonth" | "offsetDays">;

/**
 * Xom muddat sanasi (ish kuniga surishdan OLDIN).
 *  - period_end_offset: davrning oxirgi kuni + offsetDays.
 *  - fixed_day_of_month: davrdan KEYINGI oyning dueDay kuni (yoki dueMonth
 *    berilsa — periodEnd yilidagi shu oy). Oy uzunligiga clamp qilinadi.
 */
export function rawDueDate(rule: DueRule, window: PeriodWindow): Date {
  if (rule.anchorType === "period_end_offset") {
    const lastDay = addDays(window.periodEnd, -1);
    return addDays(lastDay, rule.offsetDays ?? 0);
  }
  // fixed_day_of_month — periodEnd davrdan keyingi birinchi kun (monthly →
  // keyingi oy 1-kuni; quarterly → keyingi chorak boshi; annual → keyingi yil).
  const refY = window.periodEnd.getUTCFullYear();
  const refM = window.periodEnd.getUTCMonth() + 1;
  const month = rule.dueMonth ?? refM;
  const day = Math.min(rule.dueDay ?? 1, daysInMonth(refY, month));
  return utcDate(refY, month, day);
}

/** `date` sanadan boshlab `policy` bo'yicha eng yaqin ish kuniga suradi. */
export function adjustForWorkday(
  date: Date,
  policy: WorkdayAdjustmentPolicy,
  isWorkday: (d: Date) => boolean,
): Date {
  if (policy === "none") return date;
  const step = policy === "previous_workday" ? -1 : 1;
  let d = date;
  // Guard: ~10 yil — cheksiz sikldan himoya (kalendar butunlay non-workday bo'lsa).
  let guard = 0;
  while (!isWorkday(d) && guard++ < 3660) d = addDays(d, step);
  return d;
}

export interface CalendarDay {
  date: Date;
  isWorkday: boolean;
  isHoliday: boolean;
}

/**
 * BusinessCalendarDay yozuvlaridan ish-kuni predikati. Aniq yozuv bo'lsa u
 * hal qiladi (ishlaydigan shanba yoki bayramni override qiladi); aks holda
 * standart qoida — dam olish (Shanba/Yakshanba) ish kuni emas.
 */
export function makeWorkdayPredicate(days: CalendarDay[]): (d: Date) => boolean {
  const map = new Map<string, CalendarDay>();
  for (const c of days) map.set(dateKey(c.date), c);
  return (d: Date) => {
    const row = map.get(dateKey(d));
    if (row) return row.isWorkday && !row.isHoliday;
    const dow = d.getUTCDay(); // 0 Yakshanba .. 6 Shanba
    return dow !== 0 && dow !== 6;
  };
}

/** template + davr oynasi + ish-kuni predikati → yakuniy dueAt. */
export function computeDueAt(
  template: DueRule & Pick<DeadlineTemplate, "adjustmentPolicy">,
  window: PeriodWindow,
  isWorkday: (d: Date) => boolean,
): Date {
  return adjustForWorkday(rawDueDate(template, window), template.adjustmentPolicy, isWorkday);
}
