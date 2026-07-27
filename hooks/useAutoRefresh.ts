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

export function useAutoRefresh({ intervalMs = 15000, enabled = true, refreshOnFocus = true }: Options = {}) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (isDialogOpen()) return;
      router.refresh();
    }, intervalMs);

    const onVisible = () => {
      if (!document.hidden && !isDialogOpen()) router.refresh();
    };
    if (refreshOnFocus) document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      if (refreshOnFocus) document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, intervalMs, refreshOnFocus, router]);
}
