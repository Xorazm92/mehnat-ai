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
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  // onClose har renderда yangi bo'lishi mumkin — effektni qayta ulamaslik uchun
  // ref orqali eng so'nggi qiymatni ushlab turamiz.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (e: PointerEvent) => {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) onCloseRef.current();
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
  }, [isOpen]);

  return ref;
}
