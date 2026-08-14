"use client";

import { useCallback, useEffect, useState } from "react";
import type { ViewMode } from "@/components/ui/TableToolbar";

/**
 * JADVAL KO'RINISHI — standart RO'YXAT, tanlov esa brauzerda saqlanadi.
 *
 * Ikki nuqson bir vaqtda tuzatiladi:
 *
 *  1. STANDART. Ekranlarning bir qismi kartochka (`grid`) bilan ochilardi:
 *     `MyCabinet`, `PayrollDrafts`, `NazoratchiChecklist`. Kartochka ko'rinishi
 *     bir ekranga kam ma'lumot sig'diradi va ustunlarni solishtirib bo'lmaydi —
 *     kunlik ish uchun ro'yxat qulayroq. Kerak bo'lsa foydalanuvchi o'zi
 *     almashtiradi.
 *
 *  2. YODDA SAQLASH. Hammasi oddiy `useState` edi, ya'ni tanlov sahifa
 *     yangilanishi yoki boshqa bo'limga o'tib qaytish bilan yo'qolardi.
 *     Foydalanuvchi grid'ni har safar qaytadan tanlashi kerak edi.
 *
 * HIDRATSIYA: boshlang'ich qiymat DOIM `fallback` — `localStorage` ni render
 * paytida o'qish serverdagi HTML bilan farq qilib, React'ning hidratsiya
 * xatosini keltirib chiqaradi. Saqlangan qiymat effektda qo'llanadi.
 *
 * @param storageKey Har ekran uchun O'ZIGA XOS kalit ("staff", "kassa"…).
 */
export function useViewMode(
  storageKey: string,
  fallback: ViewMode = "list"
): [ViewMode, (v: ViewMode) => void] {
  const key = `asro-view:${storageKey}`;
  const [view, setView] = useState<ViewMode>(fallback);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved === "grid" || saved === "list") setView(saved);
    } catch {
      /* private mode / o'chirilgan storage — standart qiymat qoladi */
    }
  }, [key]);

  const update = useCallback(
    (v: ViewMode) => {
      setView(v);
      try {
        localStorage.setItem(key, v);
      } catch {
        /* ignore */
      }
    },
    [key]
  );

  return [view, update];
}

export default useViewMode;
