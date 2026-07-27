"use client";

import React, { useId } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useModalA11y } from "@/hooks/useModalA11y";

/**
 * MODAL — yagona dialog primitivi.
 *
 * Nega kerak: loyihada `fixed inset-0` bilan qo'lda yozilgan 24 ta dialog bor edi
 * va ularning BIRORTASIDA ham `role="dialog"` yo'q, fokus tuzog'i yo'q, Escape yo'q.
 * Ya'ni klaviatura bilan ishlaydigan xodim `CompanyDrawer`ni ochsa, undan
 * klaviatura orqali chiqa olmasdi. `design-system/MASTER.md` buni "eng ko'p foyda
 * beradigan komponent" deb belgilagan, lekin u hech qachon yozilmagan.
 *
 * Bu yerda semantika, fokus tuzog'i, fokusni qaytarish, Escape, scroll qulfi va
 * fon bosilishi — komponentning XOSSASI. Ya'ni ularni har safar eslab qolish
 * shart emas; forklash esa qayta yozishdan qiyinroq bo'lishi kerak.
 *
 * Eslatma: `@radix-ui/react-dialog` o'rnatilmagan (node_modules'dagi radix
 * paketlari — `sonner` ning tranzitiv bog'liqliklari, ular orasida Dialog yo'q).
 * Agar keyinchalik u qo'shilsa, bu faylning ichki qismini almashtirish kifoya —
 * tashqi API o'zgarmaydi.
 */

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-[95vw]",
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: ModalSize;
  /** Fon bosilganda yoki Escape bosilganda yopilsinmi (saqlash jarayonida `false` bering) */
  dismissable?: boolean;
  /** Sarlavhadagi X tugmasi ko'rsatilsinmi */
  showClose?: boolean;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissable = true,
  showClose = true,
  className = "",
}: ModalProps) {
  const titleId = useId();
  const descId = useId();

  // Dialog xulqi (fokus tuzog'i, Escape, scroll qulfi, fokusni qaytarish)
  // `useModalA11y` da — shu bilan yon panellar ham xuddi shu kafolatni oladi.
  const panelRef = useModalA11y<HTMLDivElement>({ open, onClose, dismissable });

  const requestClose = () => {
    if (dismissable) onClose();
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4 animate-fade-in"
      style={{ zIndex: "var(--z-backdrop, 100)", background: "rgba(6,10,15,0.55)", backdropFilter: "blur(4px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`w-full ${SIZE_CLASS[size]} rounded-xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in outline-none ${className}`}
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          boxShadow: "var(--shadow-overlay, var(--card-shadow-hover))",
        }}
      >
        {(title || showClose) && (
          <div
            className="flex items-start gap-3 px-5 py-4 flex-shrink-0"
            style={{ borderBottom: "1px solid var(--rule)" }}
          >
            <div className="min-w-0 flex-1">
              {title && (
                <h2
                  id={titleId}
                  className="text-sm font-bold leading-tight"
                  style={{ color: "var(--text-primary)" }}
                >
                  {title}
                </h2>
              )}
              {description && (
                <p id={descId} className="text-body mt-1.5" style={{ color: "var(--text-secondary)" }}>
                  {description}
                </p>
              )}
            </div>
            {showClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Yopish"
                className="icon-btn-sm flex-shrink-0 rounded-lg transition-colors"
                style={{ color: "var(--text-muted)" }}
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}

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

export default Modal;
