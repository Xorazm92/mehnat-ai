// =====================================================
// UFQ OYNALARI — Kechikkan → Bugun → … → Yil
// =====================================================
// Sof sana matematikasi. Domen lug'ati ham, UI matni ham yo'q: bu yerda
// faqat KALIT va oyna chegarasi, ko'rinadigan yozuv chaqiruvchida.
//
// ENG MUHIM XOSSA: oynalar ketma-ket, kesishmaydi va bo'shliq qoldirmaydi.
// Kesishsa bitta ish ikki ustunda sanaladi, bo'shliq qolsa umuman ko'rinmaydi.
export type HorizonKey = "overdue" | "today" | "tomorrow" | "week" | "month" | "quarter" | "year";

export interface HorizonWindow {
  key: HorizonKey;
  /** `null` — chapdan ochiq (muddati o'tganlar). */
  from: Date | null;
  to: Date;
  /** `from >= to` — oyna bo'sh, so'rov yuborishning hojati yo'q. */
  empty: boolean;
}

const MS_DAY = 86_400_000;
const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export function horizonWindows(now: Date): HorizonWindow[] {
  const today = startOfUtcDay(now);
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();

  // Har oyna oldingisi TUGAGAN joydan boshlanadi. Chegaralarni mustaqil
  // hisoblab qo'yish yetarli emas: oyning oxirgi kunlarida "shu hafta"
  // keyingi oyga o'tib ketadi va "chorak" oynasi bilan kesishadi — o'sha
  // kesishmadagi ish ikki marta sanalardi.
  let cursor = today;
  const step = (key: HorizonKey, end: Date): HorizonWindow => {
    const to = end.getTime() > cursor.getTime() ? end : cursor;
    const w: HorizonWindow = { key, from: cursor, to, empty: to.getTime() <= cursor.getTime() };
    cursor = to;
    return w;
  };

  return [
    { key: "overdue", from: null, to: today, empty: false },
    step("today", new Date(today.getTime() + MS_DAY)),
    step("tomorrow", new Date(today.getTime() + 2 * MS_DAY)),
    step("week", new Date(today.getTime() + 7 * MS_DAY)),
    step("month", new Date(Date.UTC(y, m + 1, 1))),
    step("quarter", new Date(Date.UTC(y, Math.floor(m / 3) * 3 + 3, 1))),
    step("year", new Date(Date.UTC(y + 1, 0, 1))),
  ];
}
