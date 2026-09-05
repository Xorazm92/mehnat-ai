"use client";

import React, { useId } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useModalA11y } from "@/hooks/useModalA11y";

/**
 * DRAWER — yon panel primitivi.
 *
 * Nega `Modal` yetmaydi: markazlashgan dialog qisqa forma uchun to'g'ri, lekin
 * jadval qatorining DETALI uchun emas — u ro'yxatni butunlay yopib qo'yadi va
 * yopilmaguncha keyingi qatorga o'tib bo'lmaydi. Ish oqimi "qatorni ko'r →
 * yopmasdan keyingisiga o't" bo'lgan joyda yon panel kerak.
 *
 * Nega yangi fayl haqli: loyihada shu maqsadda QO'LDA yozilgan beshta panel bor
 * (`CompanyDrawer`, `StaffDrawer`, `FinanceAssistant`, `ExpenseModule`,
 * `ImageZoomModal`) va ularning har biri `z-[100]`/`z-[110]`/`z-[300]` ni
 * qo'lda tergan — `--z-*` shkalasi chetlab o'tilgan. `ExpenseModule.tsx` ning
 * o'zida "bu primitiv bo'lishi kerak" degan izoh turibdi.
 *
 * Xulq (fokus tuzog'i, Escape, scroll qulfi, fokusni qaytarish) `useModalA11y`
 * dan keladi — `Modal` bilan AYNAN bir manba.
 */

export type DrawerWidth = "sm" | "md" | "lg" | "xl";

const WIDTH_CLASS: Record<DrawerWidth, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-xl",
  xl: "sm:max-w-3xl",
};

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** Qaysi chetdan chiqadi. Standart — o'ng (o'qish tartibi bo'yicha "keyingi qadam"). */
  side?: "right" | "left";
  width?: DrawerWidth;
  /** `false` bo'lsa Escape va fon bosilishi yopmaydi (saqlash jarayonida). */
  dismissable?: boolean;
  className?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = "right",
  width = "md",
  dismissable = true,
  className = "",
}: DrawerProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useModalA11y<HTMLDivElement>({ open, onClose, dismissable });

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 flex animate-fade-in ${side === "right" ? "justify-end" : "justify-start"}`}
      style={{
        zIndex: "var(--z-backdrop, 100)",
        background: "rgba(6,10,15,0.55)",
        backdropFilter: "blur(4px)",
      }}
      onMouseDown={(e) => {
        // `mousedown`, `click` emas: panel ichida bosib, sichqonchani fon ustida
        // qo'yib yuborish panelni yopib yuborardi.
        if (e.target === e.currentTarget && dismissable) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`w-full ${WIDTH_CLASS[width]} h-full flex flex-col outline-none animate-slide-in-right ${className}`}
        style={{
          zIndex: "var(--z-panel, 110)",
          background: "var(--card-bg)",
          borderLeft: side === "right" ? "1px solid var(--card-border)" : undefined,
          borderRight: side === "left" ? "1px solid var(--card-border)" : undefined,
          boxShadow: "var(--shadow-overlay, var(--card-shadow-hover))",
        }}
      >
        <div
          className="flex items-start gap-3 px-5 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--rule)" }}
        >
          <div className="min-w-0 flex-1">
            {title && (
              <h2 id={titleId} className="text-sm font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
                {title}
              </h2>
            )}
            {description && (
              <p id={descId} className="text-body mt-1.5" style={{ color: "var(--text-secondary)" }}>
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Yopish"
            className="icon-btn-sm flex-shrink-0 rounded-lg transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div
            className="flex items-center justify-end gap-2 px-5 py-4 flex-shrink-0"
            style={{ borderTop: "1px solid var(--rule)", background: "var(--bg-sunken)" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/**
 * DRAWER LAYER — faqat QATLAM: fon, joylashuv, semantika va klaviatura xulqi.
 *
 * NEGA `Drawer` YETMAYDI (`ModalLayer` bilan bir xil sabab). `Drawer` tayyor
 * yon panel: u o'z sarlavhasini, `px-5 py-4` ichki bo'shlig'ini va yopish
 * tugmasini chizadi. Loyihadagi mavjud panellar esa O'Z tartibiga ega —
 * `CompanyDrawer` da yuqorida rangli chiziq, 64px avatar va yettita ichki
 * tab bor; `FinanceAssistant` da gradientli sarlavha va suhbat oqimi.
 * Ularni `Drawer` ga majburan o'tkazish ko'rinishni buzardi, shuning uchun
 * migratsiya to'xtab qolgan edi.
 *
 * Yetishmagan narsa TARTIB emas, SHKALA edi: har panel `z-[100]`,
 * `z-[110]`, `z-[200]` ni qo'lda terardi va fonni Tailwind palitrasidan
 * (`bg-black/60`) olardi — ya'ni ikkalasi ham `--z-*` va rang tokenlaridan
 * tashqarida. `DrawerLayer` shuni beradi, ko'rinishni chaqiruvchiga
 * qoldiradi.
 */
export interface DrawerLayerProps {
  open: boolean;
  onClose: () => void;
  /** Ekran o'quvchi o'qiydigan nom — dialogda majburiy. */
  label: string;
  children: React.ReactNode;
  side?: "right" | "left";
  /** Panel kengligi (Tailwind sinfi) — har panelning o'z o'lchami bor. */
  widthClass?: string;
  /** `false` bo'lsa Escape va fon bosilishi yopmaydi. */
  dismissable?: boolean;
  /** Panelga qo'shiladigan klasslar. */
  className?: string;
  /** Panelga qo'shiladigan uslub (fon rangi va h.k.). */
  style?: React.CSSProperties;
}

export function DrawerLayer({
  open,
  onClose,
  label,
  children,
  side = "right",
  widthClass = "max-w-[560px]",
  dismissable = true,
  className = "",
  style,
}: DrawerLayerProps) {
  const panelRef = useModalA11y<HTMLDivElement>({ open, onClose, dismissable });

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 animate-fade-in"
        style={{
          zIndex: "var(--z-backdrop, 100)",
          background: "rgba(6,10,15,0.55)",
          backdropFilter: "blur(4px)",
        }}
        onClick={() => {
          if (dismissable) onClose();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`fixed top-0 h-full w-full ${widthClass} ${
          side === "right" ? "right-0" : "left-0"
        } flex flex-col outline-none animate-slide-in-right ${className}`}
        style={{ zIndex: "var(--z-panel, 110)", ...style }}
      >
        {children}
      </div>
    </>,
    document.body
  );
}

export default Drawer;
