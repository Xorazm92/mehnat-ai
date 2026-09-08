"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface Options {
  /** Poll interval in ms. Default 15000 (15s). */
  intervalMs?: number;
  /** Turn polling off, e.g. while a modal/form is open. Default true. */
  enabled?: boolean;
  /** Also refresh the moment the tab regains visibility. Default true. */
  refreshOnFocus?: boolean;
  /**
   * Foydalanuvchi shuncha ms ichida ekranga tegingan bo'lsa — yangilanish
   * KEYINGI aylanaga qoldiriladi. Default 5000.
   */
  idleMs?: number;
}

/**
 * Real-time-ish freshness for SSR pages. Periodically calls `router.refresh()`
 * so the route's server components refetch and the table reflects other users'
 * changes without a manual reload.
 *
 * - Pauses while the tab is hidden (no wasted DB hits) and refreshes on
 *   re-focus so a returning user immediately sees current data.
 * - Client-side state (open drawers, search text, scroll) is preserved across
 *   refreshes — only server data is revalidated.
 *
 * Drop `useAutoRefresh()` into a page's client wrapper. Pass
 * `{ enabled: !isModalOpen }` to avoid refreshing under an open editor.
 */

/**
 * Ochiq dialog ostida yangilanishni to'xtatish.
 *
 * Hook'ning o'z izohida `{ enabled: !isModalOpen }` tavsiya qilinardi, lekin
 * 12 ta chaqiruv joyining BIRORTASI ham uni bermasdi. Natijada foydalanuvchi
 * `CompanyDrawer` yoki tahrirlash formasida yozib turganda, har 15 soniyada
 * `router.refresh()` ishga tushib, ochiq panelni eski qiymatlar bilan
 * qayta to'ldirardi (`OrganizationsClient` da buni tuzatish uchun alohida
 * kompensatsiya effekti yozilgan edi).
 *
 * Endi tekshiruv MARKAZLASHGAN: DOM'da `role="dialog"` bo'lsa — pauza.
 * Shu bilan har bir ekranda alohida bayroq uzatish kerak emas.
 */
function isDialogOpen(): boolean {
  if (typeof document === "undefined") return false;
  return document.querySelector('[role="dialog"]') !== null;
}


/**
 * QO'LDA PAUZA — yozuv "uchayotgan" paytda.
 *
 * Server action yozuvi bilan bir vaqtda ketgan `router.refresh()` javobi
 * yozuvdan KEYIN, lekin ESKI ma'lumot bilan qaytishi mumkin (kesh yoki
 * so'rovlar tartibi). Matritsa buni "yozdim — o'chib ketdi" bo'lib
 * ko'rsatardi. Yozuv boshlanganda hisoblagich oshadi, tugaganda kamayadi;
 * noldan katta bo'lsa davriy yangilanish o'tkazib yuboriladi.
 *
 * Modul darajasida — bir nechta komponent bir vaqtda yozishi mumkin.
 */
let pauseCount = 0;

/** `const done = pauseAutoRefresh(); try { ... } finally { done(); }` */
export function pauseAutoRefresh(): () => void {
  pauseCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    pauseCount = Math.max(0, pauseCount - 1);
  };
}

/**
 * Foydalanuvchining OXIRGI harakati (bosish, klavish, aylantirish).
 *
 * Ish ustida turgan odamning tagidan jadvalni tortib olmaymiz: yangilanish
 * u bir zum to'xtaganda bajariladi. Bu `role="dialog"` tekshiruvi
 * ushlamaydigan holatlarni yopadi — matritsada katak bosish, ro'yxatni
 * aylantirish, qidiruvga yozish.
 *
 * Modul darajasida: tinglovchi bitta, nechta ekran hook'dan foydalanishidan
 * qat'i nazar.
 */
let lastInteractionAt = 0;
if (typeof document !== "undefined") {
  const touch = () => {
    lastInteractionAt = Date.now();
  };
  for (const evt of ["pointerdown", "keydown", "wheel"] as const) {
    document.addEventListener(evt, touch, { capture: true, passive: true });
  }
}

export function useAutoRefresh({
  intervalMs = 15000,
  enabled = true,
  refreshOnFocus = true,
  idleMs = 5000,
}: Options = {}) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    /** Yangilanish MUMKIN bo'lgan payt — bitta joyda, ikkala qo'zg'atgich uchun. */
    const isSafeToRefresh = () => {
      if (typeof document === "undefined") return false;
      if (document.hidden) return false;
      if (pauseCount > 0) return false;
      if (isDialogOpen()) return false;
      return true;
    };

    const id = setInterval(() => {
      if (!isSafeToRefresh()) return;
      // Ish ustida turgan odam — keyingi aylanada.
      if (Date.now() - lastInteractionAt < idleMs) return;
      router.refresh();
    }, intervalMs);

    const onVisible = () => {
      if (isSafeToRefresh()) router.refresh();
    };
    if (refreshOnFocus) document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      if (refreshOnFocus) document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, intervalMs, refreshOnFocus, idleMs, router]);
}
