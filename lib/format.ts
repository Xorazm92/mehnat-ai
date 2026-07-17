// Shared input helpers for the ERP UI.
import type { KeyboardEvent } from "react";

/**
 * Group an integer into 3-digit blocks with a thin space separator so long
 * amounts stay readable in inputs: 10000000 -> "10 000 000". Matches the
 * ru-RU display convention used across the money read-outs.
 */
export function groupDigits(value: string | number): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Strip grouping/formatting back to raw digits: "10 000 000" -> "10000000". */
export function ungroupDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * onKeyDown handler that submits a form/modal on Ctrl+Enter (Cmd+Enter on Mac).
 * Attach to the element wrapping the inputs; keydown bubbles up from them.
 */
export function submitOnCtrlEnter(handler: () => void) {
  return (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handler();
    }
  };
}

/**
 * Deterministic thousands grouping with a comma: 1234567 -> "1,234,567",
 * -2500000 -> "-2,500,000", null/NaN -> "0". SSR hydration-safe replacement for
 * the bare `Number.prototype.toLocaleString()` (whose separator otherwise
 * follows the host locale: en-US comma on the server vs. a space in ru/uz
 * browsers -> hydration mismatch). Value is rounded to a whole number, matching
 * the money/count read-outs across the app.
 */
export function formatNum(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "0";
  const n = Math.round(value);
  const sign = n < 0 ? "-" : "";
  return sign + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// --- Deterministic date formatting (SSR hydration-safe) --------------------
// Browsers frequently ship without uz-UZ month/weekday data, so
// `toLocaleString("uz-UZ", { month: "short" })` renders "M07" on the client
// while Node's full ICU renders "iyl" on the server — which crashes React
// hydration. `toLocaleString()` with no locale is just as unsafe (host
// default locale differs between server and browser). These helpers never rely
// on Intl locale *names*: we read only numeric parts (identical across every
// ICU build) and supply the Uzbek names ourselves. The wall clock is pinned to
// Uzbekistan time so output is also stable when the production server runs UTC.

const UZ_TZ = "Asia/Tashkent";
const UZ_MONTHS_SHORT = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
const UZ_MONTHS_LONG = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const UZ_WEEKDAYS_LONG = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

type DateInput = Date | string | number | null | undefined;
type WallClock = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

function wallClock(input: DateInput): WallClock | null {
  if (input == null || input === "") return null;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: UZ_TZ,
    hour12: false,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "16-iyl, 11:42" — compact day + short month + time (audit/activity feeds). */
export function formatUzDateTime(input: DateInput): string {
  const t = wallClock(input);
  return t ? `${t.day}-${UZ_MONTHS_SHORT[t.month - 1]}, ${pad2(t.hour)}:${pad2(t.minute)}` : "—";
}

/** "16-iyl" — day + short month, no year. */
export function formatUzDayShort(input: DateInput): string {
  const t = wallClock(input);
  return t ? `${t.day}-${UZ_MONTHS_SHORT[t.month - 1]}` : "—";
}

/** "16-iyul, 2026" — day + full month + year. */
export function formatUzDate(input: DateInput): string {
  const t = wallClock(input);
  return t ? `${t.day}-${UZ_MONTHS_LONG[t.month - 1]}, ${t.year}` : "—";
}

/** "payshanba, 16-iyul, 2026" — weekday + day + full month + year. */
export function formatUzDateFull(input: DateInput): string {
  const t = wallClock(input);
  return t ? `${UZ_WEEKDAYS_LONG[t.weekday]}, ${t.day}-${UZ_MONTHS_LONG[t.month - 1]}, ${t.year}` : "—";
}

/** "iyul, 2026" — full month + year (period/month labels). */
export function formatUzMonthYear(input: DateInput): string {
  const t = wallClock(input);
  return t ? `${UZ_MONTHS_LONG[t.month - 1]}, ${t.year}` : "—";
}

/** "16/07/2026" — all-numeric date. */
export function formatUzDateNumeric(input: DateInput): string {
  const t = wallClock(input);
  return t ? `${pad2(t.day)}/${pad2(t.month)}/${t.year}` : "—";
}

/** "11:42" — time only. */
export function formatUzTime(input: DateInput): string {
  const t = wallClock(input);
  return t ? `${pad2(t.hour)}:${pad2(t.minute)}` : "—";
}
