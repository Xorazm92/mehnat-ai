"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * SAHIFA HAJMI — bir ekranda nechta qator, tanlov brauzerda saqlanadi.
 *
 * Hajm har jadvalda kodga qotirilgan edi (50, 100, 40) va foydalanuvchi uni
 * o'zgartira olmasdi. Ammo "qancha qator kerak" ekranga ham, ishga ham
 * bog'liq: qarzdorlikni ko'zdan kechirayotgan buxgalterga 100 qator qulay,
 * kichik noutbukda esa 10 tasi ham yetadi.
 *
 * HIDRATSIYA: boshlang'ich qiymat DOIM `fallback` — `localStorage` ni render
 * paytida o'qish serverdagi HTML bilan farq qilib, React hidratsiya xatosini
 * beradi. Saqlangan qiymat effektda qo'llanadi. Aynan shu naqsh
 * `useViewMode` da ham ishlatiladi.
 *
 * @param storageKey Har ekran uchun O'ZIGA XOS kalit ("staff", "journal"…).
 */
export const PAGE_SIZE_OPTIONS = [10, 15, 50, 100] as const;

export function usePageSize(
  storageKey: string,
  fallback = 50,
): [number, (n: number) => void] {
  const key = `asro-page-size:${storageKey}`;
  const [size, setSize] = useState(fallback);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(key));
      // Faqat taklif qilingan qiymatlar tiklanadi: saqlangan satr qo'lda
      // buzilgan bo'lsa (yoki ro'yxat keyinchalik o'zgargan bo'lsa) jadval
      // 0 yoki NaN qator ko'rsatib bo'sh qolib ketardi.
      if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(saved)) setSize(saved);
    } catch {
      /* private mode / o'chirilgan storage — standart qiymat qoladi */
    }
  }, [key]);

  const update = useCallback(
    (n: number) => {
      setSize(n);
      try {
        localStorage.setItem(key, String(n));
      } catch {
        /* ignore */
      }
    },
    [key],
  );

  return [size, update];
}

export default usePageSize;
