// =====================================================
// SANA ORALIG'I — YAGONA MANBA
// =====================================================
//
// Kassa ekranlarida sana filtri UMUMAN yo'q edi: `getKassaEntries` `{from,to}`
// qabul qilardi, lekin hech kim uni oraliq bilan chaqirmasdi. Shu sababdan
// "1–19 avgust holati" yoki "1 yanvardan bugungacha" degan savolga ekran
// javob bera olmasdi — foydalanuvchining asosiy shikoyati aynan shu edi.
//
// Sof modul (DB'siz, `"use client"` siz) — server action ham, komponent ham
// shundan oladi, ya'ni oraliq chegarasi ikki joyda boshqacha hisoblanmaydi.
//
// CHEGARA QOIDASI: `from` — kun BOSHI (00:00:00.000), `to` — keyingi kunning
// boshi, ya'ni yarim ochiq oraliq [from, to). Shu bilan 19-avgustda soat
// 14:30 da tushgan pul "1–19 avgust" ichiga KIRADI. `lte: 19-avgust 00:00`
// ishlatilsa u tushib qolardi — bu eng ko'p uchraydigan hisobot xatosi.

/** Mahalliy kun boshi. `new Date("2026-08-01")` UTC beradi, biz mahalliyni istaymiz. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Keyingi kun boshi — yarim ochiq oraliqning yuqori chegarasi. */
export function endOfDayExclusive(d: Date): Date {
  const s = startOfDay(d);
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1);
}

export const RANGE_PRESETS = [
  "today",
  "yesterday",
  "this_week",
  "this_month",
  "month_to_date",
  "year_to_date",
  "last_month",
  "custom",
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_LABELS: Record<RangePreset, string> = {
  today: "Bugun",
  yesterday: "Kecha",
  this_week: "Joriy hafta",
  this_month: "Joriy oy",
  month_to_date: "Oy boshidan bugungacha",
  year_to_date: "Yil boshidan bugungacha",
  last_month: "O'tgan oy",
  custom: "Maxsus oraliq",
};

export interface DateRange {
  /** Kun boshi, kiritiladi. */
  from: Date;
  /** Keyingi kun boshi, KIRITILMAYDI — [from, to). */
  to: Date;
  preset: RangePreset;
}

export interface CustomRange {
  /** "YYYY-MM-DD" */
  from?: string | null;
  /** "YYYY-MM-DD" — shu kun ORALIQQA KIRADI. */
  to?: string | null;
}

/** "YYYY-MM-DD" ni mahalliy kun boshiga aylantiradi (UTC siljishisiz). */
export function parseDayInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Presetni haqiqiy oraliqqa aylantiradi.
 *
 * `custom` da `from`/`to` berilmasa joriy oyga tushadi — ekran hech qachon
 * bo'sh oraliq bilan so'rov yubormasin.
 */
export function resolveRange(
  preset: RangePreset,
  custom?: CustomRange,
  now: Date = new Date()
): DateRange {
  const today = startOfDay(now);

  switch (preset) {
    case "today":
      return { from: today, to: endOfDayExclusive(today), preset };

    case "yesterday": {
      const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
      return { from: y, to: today, preset };
    }

    case "this_week": {
      // Dushanba — hafta boshi (O'zbekistonda ish haftasi shunday).
      const dow = (today.getDay() + 6) % 7;
      const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dow);
      return { from, to: endOfDayExclusive(today), preset };
    }

    case "this_month":
      return {
        from: new Date(today.getFullYear(), today.getMonth(), 1),
        to: new Date(today.getFullYear(), today.getMonth() + 1, 1),
        preset,
      };

    // "1–19 avgust" — oy boshidan BUGUNGACHA (bugun ham kiradi). `this_month`
    // dan farqi shuki, u oy oxirigacha cho'ziladi va kelajakdagi bo'sh
    // kunlarni ham oraliqqa qo'shadi.
    case "month_to_date":
      return {
        from: new Date(today.getFullYear(), today.getMonth(), 1),
        to: endOfDayExclusive(today),
        preset,
      };

    // "1 yanvar – 19 avgust".
    case "year_to_date":
      return {
        from: new Date(today.getFullYear(), 0, 1),
        to: endOfDayExclusive(today),
        preset,
      };

    case "last_month":
      return {
        from: new Date(today.getFullYear(), today.getMonth() - 1, 1),
        to: new Date(today.getFullYear(), today.getMonth(), 1),
        preset,
      };

    case "custom": {
      const from = custom?.from ? parseDayInput(custom.from) : null;
      const toDay = custom?.to ? parseDayInput(custom.to) : null;
      if (!from && !toDay) return resolveRange("this_month", undefined, now);
      let startDay = from ?? new Date(today.getFullYear(), today.getMonth(), 1);
      let endDay = toDay ?? today;
      // Teskari kiritilgan oraliq (boshi oxiridan keyin) — jim bo'sh natija
      // o'rniga kunlarni ALMASHTIRAMIZ. Almashtirish chegaralarni emas,
      // KUNLARNI teginishi kerak: chegaralar allaqachon [boshi, keyingi kun)
      // ga aylantirilgan bo'lsa, ularni joyini almashtirish oraliqni bir kunga
      // siljitib yuborardi.
      if (startDay > endDay) [startDay, endDay] = [endDay, startDay];
      return { from: startOfDay(startDay), to: endOfDayExclusive(endDay), preset };
    }
  }
}

/**
 * `Payment.period` ("YYYY-MM") filtri uchun oraliqqa TEGADIGAN oylar ro'yxati.
 *
 * `Payment` — oylik yig'ma qator, uni kun bo'yicha filtrlab bo'lmaydi. Kun
 * aniqligi kerak bo'lganda `PaymentAllocation.receivedAt` ishlatiladi; oylik
 * kesim kerak bo'lganda esa shu ro'yxat.
 */
export function periodsInRange(range: DateRange): string[] {
  const out: string[] = [];
  const cursor = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
  // `to` kiritilmaydi, shuning uchun oxirgi kiritiladigan kun `to − 1ms`.
  const lastDay = new Date(range.to.getTime() - 1);
  const end = new Date(lastDay.getFullYear(), lastDay.getMonth(), 1);
  while (cursor <= end) {
    out.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}
