"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Ochilma menyu / popover'ni tashqariga bosilganda yoki Escape bosilganda yopadi.
 *
 * `fixed inset-0` shaffof backdrop o'rniga hujjat darajasidagi `pointerdown`
 * tinglovchisidan foydalanadi. Backdrop usuli stacking-context/z-index'ga
 * bog'liq bo'lib, mustaqil komponentlar orasida ishonchsiz edi: masalan profil
 * menyusi va USTUNLAR ochilmasi bir vaqtda ochiq qolardi. Hujjat tinglovchisi
 * z-index'dan qat'i nazar ishlaydi, shu bois boshqa ochilmaning tetigini bosish
 * bu ochilmani avtomatik yopadi — natijada bir vaqtda faqat bittasi ochiq turadi.
 *
 * Qaytariladigan ref'ni tetik (tugma) va panelni O'RAB turgan elementга ulang —
 * shunda tugmaning o'zini bosish "tashqi bosish" deb hisoblanmaydi.
 *
 * @param isOpen  Ochilma hozir ochiqmi.
 * @param onClose Yopish uchun chaqiriladi (tashqi bosish yoki Escape).
 */
export function useDismissable<T extends HTMLElement = HTMLDivElement>(
  isOpen: boolean,
  onClose: () => void,
  /**
   * Panel PORTALDA bo'lganda tetik uning DOM avlodi bo'lmaydi — natijada
   * tetikni bosish "tashqi bosish" deb hisoblanadi: `pointerdown` panelni
   * yopadi, keyin `click` uni qayta ochadi va tetik bilan YOPIB BO'LMAY
   * qoladi. Tetik ref'i shu yerga berilsa, uning ustidagi bosish e'tiborsiz
   * qoldiriladi va yopishni tetikning o'z ishlovchisi hal qiladi.
   */
  ignoreRef?: RefObject<HTMLElement | null>,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  // onClose har renderda yangi bo'lishi mumkin — effektni qayta ulamaslik uchun
  // ref orqali eng so'nggi qiymatni ushlab turamiz.
  //
  // DIQQAT: ref RENDER paytida emas, effekt ichida yangilanadi. Avval u
  // to'g'ridan-to'g'ri render tanasida yozilardi (`onCloseRef.current = onClose`),
  // bu esa React 19 da taqiqlangan: konkurrent renderda bir marta boshlanib
  // tashlab yuborilgan render ham ref'ni o'zgartirib, hali ekranda turgan
  // eski daraxtni buzishi mumkin.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const target = e.target as Node;
      if (el.contains(target)) return;
      if (ignoreRef?.current?.contains(target)) return;
      onCloseRef.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, ignoreRef]);

  return ref;
}
