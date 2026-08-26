"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * TOOLTIP — `title=` atributining o'rniga.
 *
 * MUAMMO. Loyihada 78 ta `title=` bor va ularning bir qismi HAQIQIY
 * ma'lumot tashiydi — nima uchun tugma o'chirilgani, nega qator rad
 * etilgani, nega oyni yopib bo'lmasligi. Ya'ni foydalanuvchi to'siqqa
 * urilgan paytdagi yagona izoh. Lekin `title`:
 *
 *   · SENSORLI ekranda umuman ochilmaydi — telefonda bosib turish
 *     matnni ko'rsatmaydi, kontekst menyuni chaqiradi;
 *   · o'chirilgan (`disabled`) elementda ko'p brauzerda hodisa
 *     bo'lmagani uchun chiqmaydi — aynan eng kerakli holatda;
 *   · taxminan bir soniya kutishni talab qiladi va sichqoncha qimirlasa
 *     yo'qoladi;
 *   · ekran o'quvchilarda beqaror — ba'zilari o'qiydi, ba'zilari yo'q.
 *
 * Ya'ni "izoh bor" degan taassurot bor, amalda esa izohni faqat
 * sichqonchali, sabrli va ko'zi ochiq foydalanuvchi oladi.
 *
 * YECHIM. Uch xil ochilish: sichqoncha (hover), klaviatura (focus) va
 * BOSISH (sensorli ekran). Matn `aria-describedby` orqali bog'lanadi,
 * shuning uchun ekran o'quvchi uni elementning tavsifi sifatida o'qiydi.
 *
 * O'CHIRILGAN ELEMENT. `disabled` tugma hodisa bermaydi, shuning uchun
 * o'rovchi `<span>` ushlaydi (`pointer-events` tugmada o'chirilgan
 * bo'lsa ham span'da ishlaydi) va `tabIndex={0}` bilan klaviaturaga ham
 * ochiq bo'ladi — aks holda "nega bosib bo'lmaydi?" savoli javobsiz
 * qolardi.
 */

export interface TooltipProps {
  /** Ko'rsatiladigan matn. Bo'sh bo'lsa tooltip umuman chizilmaydi. */
  label?: React.ReactNode;
  children: React.ReactElement;
  /** Element o'chirilgan bo'lsa `true` bering — o'rovchi hodisani ushlaydi. */
  wrapDisabled?: boolean;
  side?: "top" | "bottom";
  className?: string;
}

export function Tooltip({ label, children, wrapDisabled = false, side = "top", className = "" }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);

  const place = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoords({
      top: side === "top" ? r.top - 8 : r.bottom + 8,
      left: Math.min(Math.max(8, r.left + r.width / 2), window.innerWidth - 8),
    });
  }, [side]);

  const show = useCallback(() => {
    place();
    setOpen(true);
  }, [place]);
  const hide = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    // Sensorli ekranda tooltip bosish bilan ochiladi — tashqariga bosilsa
    // yopilishi kerak, aks holda ekranda osilib qoladi.
    const onDocPointer = (e: PointerEvent) => {
      if (!anchorRef.current?.contains(e.target as Node)) hide();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDocPointer);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDocPointer);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [open, hide]);

  if (!label) return children;

  const anchorProps = {
    ref: anchorRef,
    className: `inline-flex ${wrapDisabled ? "cursor-help" : ""} ${className}`,
    onPointerEnter: show,
    onPointerLeave: hide,
    onFocus: show,
    onBlur: hide,
    // Sensorli ekran: bosish ochadi. Tugmaning o'z bosilishiga xalaqit
    // bermaydi — faqat qo'shimcha.
    onClick: () => (open ? hide() : show()),
    // O'rovchi o'chirilgan elementni ushlayotgan bo'lsa, u klaviaturaga
    // ham ochiq bo'lishi kerak: o'chirilgan tugmaga fokus tushmaydi.
    tabIndex: wrapDisabled ? 0 : undefined,
    "aria-describedby": open ? id : undefined,
  };

  return (
    <>
      <span {...anchorProps}>{children}</span>
      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            className="pointer-events-none fixed max-w-[260px] rounded-lg px-2.5 py-1.5 text-meta font-medium shadow-lg animate-fade-in"
            style={{
              zIndex: "var(--z-popover, 200)",
              top: coords.top,
              left: coords.left,
              transform: side === "top" ? "translate(-50%, -100%)" : "translate(-50%, 0)",
              background: "var(--tooltip-bg)",
              color: "var(--tooltip-text)",
              border: "1px solid var(--tooltip-border)",
            }}
          >
            {label}
          </span>,
          document.body
        )}
    </>
  );
}

export default Tooltip;
