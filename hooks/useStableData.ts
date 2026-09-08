"use client";

import { useMemo } from "react";

/**
 * SERVERDAN KELGAN MA'LUMOTNI MAZMUNI BO'YICHA BARQARORLASHTIRISH.
 *
 * MUAMMO. `router.refresh()` (va Next 16 da keshni yangilaydigan HAR BIR
 * server action) sahifaning RSC daraxtini qaytadan quradi. Ma'lumot AYNAN
 * o'sha bo'lsa ham, mijozga har safar YANGI massiv/obyekt havolalari keladi
 * (`page.tsx` da `JSON.parse(JSON.stringify(...))`). React uchun bu
 * "ma'lumot o'zgardi" degani:
 *
 *   · `useMemo`/`useEffect` bog'liqliklari uziladi — matritsada 250 ta qator
 *     qaytadan quriladi;
 *   · `React.memo` bilan o'ralgan qator va katak komponentlari yangi
 *     havolalarni ko'rib, hammasi qaytadan chiziladi (~34 ko'rinadigan qator
 *     × 46 ustun ≈ 1500 katak).
 *
 * Natijada ekran har yangilanishda "sakraydi", ochiq element fokusdan
 * chiqadi va bosilgan katak boshqasiga tushib qoladi.
 *
 * YECHIM. Havolani MAZMUN o'zgarmaguncha saqlab qolamiz. Ma'lumot serverdan
 * allaqachon sof JSON bo'lib keladi, shuning uchun imzo sifatida
 * `JSON.stringify` yetarli va u 250 ta firma uchun ham qayta chizishdan
 * ancha arzon.
 *
 * Loyihada shu naqsh allaqachon ishlatiladi (`OperationModule` dagi
 * `filterSig`): bog'liqlik obyektning O'ZI emas, uning imzosi.
 */
export function useStableData<T>(value: T): T {
  const sig = JSON.stringify(value) ?? "undefined";
  // Bog'liqlik ataylab faqat imzo: `value` havolasi har renderda yangi
  // bo'ladi va uni ro'yxatga qo'shish hookni ma'nosiz qilib qo'yardi.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => value, [sig]);
}

export default useStableData;
