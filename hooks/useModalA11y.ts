"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Dialog xulqi: fokus tuzog'i + Escape + scroll qulfi + fokusni qaytarish.
 *
 * `Modal` primitivi markazlashgan dialog UCHUN tayyor tartib beradi, lekin
 * loyihada yon paneller ham bor (`CompanyDrawer` — 1091 qator, 7 tab;
 * `StaffDrawer`). Ularni markazlashgan modalga majburan o'tkazish tartibni
 * buzardi, holbuki muammo tartibda emas — XULQDA edi: `role="dialog"` yo'q,
 * fokus tuzog'i yo'q, Escape yo'q.
 *
 * Shuning uchun xulq shu hook'ga ajratilgan: `Modal` ham, mavjud panellar ham
 * bir xil a11y kafolatini oladi, o'z ko'rinishini saqlab qolgan holda.
 *
 * Qaytaradi: panelga qo'yiladigan `ref`. Panelga qo'shimcha ravishda
 * `role="dialog"`, `aria-modal="true"` va `tabIndex={-1}` qo'yish kerak.
 */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export interface ModalA11yOptions {
  open: boolean;
  onClose: () => void;
  /** `false` bo'lsa Escape yopmaydi (masalan saqlash jarayonida) */
  dismissable?: boolean;
  /** Scroll qulfi kerakmi (bir vaqtda ikki qatlam ochilsa `false` bering) */
  lockScroll?: boolean;
}

export function useModalA11y<T extends HTMLElement = HTMLDivElement>({
  open,
  onClose,
  dismissable = true,
  lockScroll = true,
}: ModalA11yOptions) {
  const panelRef = useRef<T>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const requestClose = useCallback(() => {
    if (dismissable) onClose();
  }, [dismissable, onClose]);

  // Fokusni saqlash → panelga ko'chirish → yopilganda egasiga qaytarish.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    if (panel) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus({ preventScroll: true });
    }

    return () => {
      restoreFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  // Scroll qulfi — scrollbar kengligi kompensatsiya qilinadi, aks holda
  // dialog ochilganda ortdagi sahifa sakraydi.
  useEffect(() => {
    if (!open || !lockScroll) return;
    const { body, documentElement } = document;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    const gap = window.innerWidth - documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;

    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
    };
  }, [open, lockScroll]);

  // Escape + Tab tuzog'i.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        requestClose();
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, requestClose]);

  return panelRef;
}

export default useModalA11y;
