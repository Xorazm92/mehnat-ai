"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * YORLIQ HOLATI URL'DA.
 *
 * Bungacha har bir sahifadagi yorliq oddiy `useState` edi va bu uchta amaliy
 * muammoni keltirib chiqarardi:
 *   1. Havola qilib bo'lmasdi — "matritsani och" deb yuborilgan `/reports`
 *      havolasi hamma uchun "Hisobotlar" yorlig'ida ochilardi.
 *   2. Sahifa yangilanganda (`useAutoRefresh` 15 soniyada bir marta
 *      `router.refresh()` chaqiradi) yorliq holati saqlanardi, lekin
 *      brauzerni qayta yuklashda yo'qolardi — nazoratchi har safar
 *      matritsaga qaytadan o'tishga majbur edi.
 *   3. Brauzer "orqaga" tugmasi yorliqlar haqida hech narsa bilmasdi.
 *
 * Yechim: holat `?tab=` da yashaydi.
 *
 * `router.replace()` EMAS, `window.history.replaceState()` ishlatiladi — Next
 * uni router bilan integratsiya qiladi (docs: linking-and-navigating →
 * "native History API"), ya'ni URL yangilanadi, lekin server komponentlari
 * qayta yuklanmaydi. `router.replace()` bo'lganda har bir yorliq bosilishi
 * butun sahifaning ma'lumotini qaytadan olib kelardi.
 *
 * `pushState` emas, `replaceState`: yorliq almashish "orqaga" tarixini
 * to'ldirmasligi kerak — foydalanuvchi Back bosganda sahifadan CHIQISHNI
 * kutadi, o'n bosqich yorliq bo'ylab orqaga yurishni emas.
 *
 * Boshlang'ich qiymat serverdan (`searchParams`) prop bo'lib kelishi shart —
 * mijozda `window.location` dan o'qilsa SSR bilan mos kelmay hidratsiya
 * xatosi chiqadi.
 */
export function useTabParam<T extends string>(
  key: string,
  valid: readonly T[],
  initial: T
): readonly [T, (next: T) => void] {
  const [value, setValue] = useState<T>(initial);

  // `valid` odatda inline massiv bo'ladi — har renderda yangi havola, ya'ni
  // to'g'ridan-to'g'ri bog'liqlik sifatida berilsa effekt har renderda qayta
  // ishga tushardi. Qiymatlarning O'ZI o'zgarmaguncha barqaror bo'lgan satr
  // kalitidan foydalanamiz.
  const validKey = valid.join("|");

  /**
   * URL'dagi yorliq — `useSearchParams` orqali, ya'ni REAKTIV.
   *
   * Ilgari bu yerda faqat `popstate` tinglovchisi turardi va u FAQAT brauzer
   * "orqaga/oldinga" tugmasida ishlardi. Natijada TASHQARIDAN kelgan yorliq
   * havolasi ishlamasdi: yon paneldagi yoki qidiruvdagi
   * `/kassa/chiqim?tab=xarajat` bosilganda Next yumshoq navigatsiya qiladi
   * (bir xil marshrut, boshqa `?tab=`) — `popstate` CHIQMAYDI, komponent esa
   * qayta MOUNT bo'lmaydi, ya'ni `useState(initial)` eski qiymatda qolardi.
   * URL o'zgarardi-yu, ekrandagi yorliq o'zgarmasdi.
   *
   * `useSearchParams` native History API bilan ham integratsiyalashgan
   * (`set()` ichidagi `replaceState`), shuning uchun u ikkala yo'nalishni ham
   * qamrab oladi va alohida `popstate` tinglovchisi kerak emas.
   *
   * Sinxronlash RENDER paytida, effektda EMAS (`components/ui/MoneyField.tsx`
   * dagi bilan bir xil naqsh): effekt bilan brauzer avval ESKI yorliqni
   * chizar, keyin yangisiga sakrardi.
   */
  const searchParams = useSearchParams();
  const fromUrl = searchParams.get(key);

  const [lastUrl, setLastUrl] = useState(fromUrl);
  if (fromUrl !== lastUrl) {
    setLastUrl(fromUrl);
    // Ro'yxatda yo'q qiymat (masalan ruxsati yetmaydigan yorliq) e'tiborsiz
    // qoldiriladi — joriy yorliq o'z holicha turadi.
    if (fromUrl && validKey.split("|").includes(fromUrl)) setValue(fromUrl as T);
  }

  const set = useCallback(
    (next: T) => {
      setValue(next);
      const params = new URLSearchParams(window.location.search);
      params.set(key, next);
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?${params.toString()}`
      );
    },
    [key]
  );

  return [value, set] as const;
}

/**
 * Ro'yxatsiz URL holati — masalan tanlangan davr (`?period=2026-08`).
 *
 * `useTabParam` bilan bir xil qoidalar (replaceState + popstate), farqi shuki
 * qiymat oldindan ma'lum ro'yxatdan emas. Shu sababli boshlang'ich qiymat
 * SERVERDA tekshirilgan bo'lishi kerak.
 */
export function useUrlParam(
  key: string,
  initial: string
): readonly [string, (next: string) => void] {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    const sync = () => {
      const p = new URLSearchParams(window.location.search).get(key);
      // Parametr YO'Q bo'lsa boshlang'ich qiymatga qaytamiz. Ilgari bu holat
      // e'tiborsiz qolardi: "orqaga" tugmasi bilan filtrsiz manzilga
      // qaytilganda ekranda filtr qolib ketardi va URL bilan ko'rinish
      // bir-biriga mos kelmasdi.
      setValue(p ?? initial);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [key, initial]);

  const set = useCallback(
    (next: string) => {
      setValue(next);
      const params = new URLSearchParams(window.location.search);
      // Bo'sh qiymat = filtr yo'q → parametr URL'dan OLIB TASHLANADI.
      // `?q=&bosqich=` kabi ma'nosiz quyruq ulashilgan havolada chalkashtiradi.
      if (next) params.set(key, next);
      else params.delete(key);
      const qs = params.toString();
      window.history.replaceState(
        null,
        "",
        qs ? `${window.location.pathname}?${qs}` : window.location.pathname
      );
    },
    [key]
  );

  return [value, set] as const;
}

export default useTabParam;
