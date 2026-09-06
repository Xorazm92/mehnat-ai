// =====================================================
// O'ZBEKISTON BAYRAM KUNLARI (P2)
// =====================================================
// ⚠️ HAFTA OXIRI BU YERDA YO'Q — ATAYLAB.
//
// `makeWorkdayPredicate` (lib/engines/obligation/deadlines.ts) aniq yozuv
// bo'lmagan kunda STANDART qoidani qo'llaydi: shanba va yakshanba ish kuni
// EMAS. Ya'ni `BusinessCalendarDay` bo'sh bo'lsa ham muddat dam olish
// kunidan suriladi — bu allaqachon ishlaydi.
//
// Har yakshanbani jadvalga yozish (2 yilga ~208 qator) standart qoidaning
// nusxasi bo'lardi: hech narsa qo'shmaydi, lekin jadvalni "to'ldirilgan"
// qilib ko'rsatadi va keyin standart qoida o'zgarsa ikki manba bir-biriga
// zid javob berardi. Jadval faqat ISTISNONI saqlaydi:
//
//   • bayram (ish kuni bo'lishi kerak edi, lekin emas)
//   • ko'chirilgan ish shanbasi (dam olish edi, lekin ishlanadi)
//
// MANBA. Mehnat kodeksi 216-moddasi — yetti qat'iy sana. Ikkita hayit
// KO'CHIB YURADI va har yili hukumat qarori bilan aniqlanadi; bu yerdagi
// sanalar ASTRONOMIK TAXMIN va `approximate: true` bilan belgilangan.
// Bosh buxgalter bilan uchrashuvda ular tasdiqlanadi
// (docs/plan/deadline-templates-v2.md §5.1, 2-savol).
//
// Dam olish kunlarini ko'chirish (masalan "bayram seshanbaga tushdi,
// dushanba ham dam") ham har yili alohida qaror bilan e'lon qilinadi va bu
// yerda YO'Q — uni admin ekrani orqali qo'lda kiritish kerak
// (`server/businessCalendar.ts`).

export interface UzHoliday {
  /** "YYYY-MM-DD" — UTC kalendar kaliti (`dateKey` bilan bir xil shakl). */
  date: string;
  name: string;
  /**
   * `true` — sana hukumat qarori bilan aniqlanadi, bu qiymat taxmin.
   * Skript uni alohida ogohlantirish bilan chiqaradi.
   */
  approximate?: true;
}

/** Har yili bir xil sanaga tushadigan bayramlar (Mehnat kodeksi, 216-modda). */
export const UZ_FIXED_HOLIDAYS: Array<{ month: number; day: number; name: string }> = [
  { month: 1, day: 1, name: "Yangi yil" },
  { month: 3, day: 8, name: "Xotin-qizlar kuni" },
  { month: 3, day: 21, name: "Navro'z" },
  { month: 5, day: 9, name: "Xotira va qadrlash kuni" },
  { month: 9, day: 1, name: "Mustaqillik kuni" },
  { month: 10, day: 1, name: "O'qituvchi va murabbiylar kuni" },
  { month: 12, day: 8, name: "Konstitutsiya kuni" },
];

/**
 * Ko'chib yuruvchi diniy bayramlar — TAXMINIY.
 *
 * Oy taqvimiga bog'liq, ya'ni har yili ~11 kun oldinga suriladi va rasmiy
 * sana hukumat qarori bilan e'lon qilinadi. Faqat aniq bilingan yillar
 * yoziladi: noma'lum yil uchun taxmin qilish "kalendar to'liq" degan yolg'on
 * berardi.
 */
export const UZ_MOVEABLE_HOLIDAYS: Record<number, UzHoliday[]> = {
  2026: [
    { date: "2026-03-20", name: "Ramazon hayit", approximate: true },
    { date: "2026-05-27", name: "Qurbon hayit", approximate: true },
  ],
  2027: [
    { date: "2027-03-10", name: "Ramazon hayit", approximate: true },
    { date: "2027-05-17", name: "Qurbon hayit", approximate: true },
  ],
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Bir yilning bayramlari — qat'iy + ko'chib yuruvchi, sana bo'yicha tartibda. */
export function uzHolidays(year: number): UzHoliday[] {
  const fixed: UzHoliday[] = UZ_FIXED_HOLIDAYS.map((h) => ({
    date: `${year}-${pad(h.month)}-${pad(h.day)}`,
    name: h.name,
  }));
  const moveable = UZ_MOVEABLE_HOLIDAYS[year] ?? [];
  return [...fixed, ...moveable].sort((a, b) => a.date.localeCompare(b.date));
}

/** Yilda ko'chib yuruvchi bayram sanalari ma'lummi. */
export const hasMoveableHolidays = (year: number): boolean => year in UZ_MOVEABLE_HOLIDAYS;
