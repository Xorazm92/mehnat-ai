// lib/pagination.ts
// Sahifalashning SOF mantig'i — bazasiz sinaladi (`lib/**/*.spec.ts`).
//
// Server action'lar bazani talab qiladi va shu sababli birlik testi bilan
// qoplanmaydi. Xato qiladigan joy esa aynan shu hisob-kitob: "oxirgi sahifa
// qaysi", "yana bormi", "so'ralgan sahifa mavjudmi". Shuning uchun u shu
// yerga ajratildi.

/** Ro'yxatdagi oxirgi sahifa raqami. Ma'lumot yo'q bo'lsa ham 1 (bo'sh sahifa). */
export function lastPage(totalCount: number, pageSize: number): number {
  if (pageSize < 1) throw new Error("pageSize kamida 1 bo'lishi kerak");
  return Math.max(1, Math.ceil(Math.max(0, totalCount) / pageSize));
}

/**
 * So'ralgan sahifani mavjud oraliqqa siqadi.
 *
 * NEGA KERAK: foydalanuvchi 5-sahifada turganda schyotlar bekor qilinsa yoki
 * boshqa davr tanlansa, 5-sahifa umuman qolmasligi mumkin. Siqilmasa ekran
 * BO'SH jadval ko'rsatardi va bu "ma'lumot yo'qolgan" bo'lib o'qilardi.
 * Bunda oxirgi mavjud sahifa ko'rsatiladi.
 */
export function clampPage(requested: number, totalCount: number, pageSize: number): number {
  const max = lastPage(totalCount, pageSize);
  if (!Number.isFinite(requested)) return 1;
  return Math.min(Math.max(1, Math.trunc(requested)), max);
}

/** Shu sahifadan keyin yana qator bormi. */
export function hasMorePages(page: number, pageSize: number, totalCount: number): boolean {
  return page * pageSize < totalCount;
}
