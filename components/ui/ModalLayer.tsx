"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useModalA11y } from "@/hooks/useModalA11y";

/**
 * MODAL LAYER — faqat QATLAM: fon, semantika va klaviatura xulqi.
 *
 * NEGA `Modal` YETMAYDI. `components/ui/Modal` tayyor dialog: u o'z
 * sarlavhasini, `px-5 py-4` ichki bo'shlig'ini va yopish tugmasini
 * chizadi. Loyihadagi 24 ta qo'lda yozilgan oynaning ko'pi esa O'Z
 * tartibiga ega — yuqorida rangli chiziq, to'liq kenglikdagi qadam
 * sarlavhasi, ichki tab va hokazo. Ularni `Modal` ga majburan o'tkazish
 * ko'rinishni buzardi, shuning uchun migratsiya to'xtab qolgan edi:
 * primitiv bor, lekin u faqat BITTA shakl uchun.
 *
 * `useModalA11y` hook'i mavjud va aynan shu holat uchun yozilgan, ammo
 * uni har bir joyda qo'lda ulash kerak: `ref`, `role="dialog"`,
 * `aria-modal`, `tabIndex={-1}`, fon bosilishi — beshta narsa, va ular
 * har safar unutiladi. Auditda 28 oynadan 18 tasida Escape ham yo'q edi.
 *
 * `ModalLayer` — yetishmagan o'rta pog'ona: XULQNI beradi, KO'RINISHNI
 * chaqiruvchiga qoldiradi. Migratsiya endi ikki qatorlik ish.
 *
 *   <ModalLayer open={!!editing} onClose={() => setEditing(null)} label="Qoidani tahrirlash">
 *     <div className="w-full max-w-2xl …">…o'z tartibingiz…</div>
 *   </ModalLayer>
 *
 * Portalga chiziladi — ota elementdagi `overflow: hidden` yoki
 * `transform` oynani qirqib qo'ymasin (jadval konteynerlari ichida
 * ochiladigan oynalarda aynan shunday bo'lardi).
 */

export interface ModalLayerProps {
  open: boolean;
  onClose: () => void;
  /** Ekran o'quvchi o'qiydigan nom — dialogda majburiy. */
  label: string;
  children: React.ReactNode;
  /** `false` bo'lsa Escape va fon bosilishi yopmaydi (saqlash jarayonida). */
  dismissable?: boolean;
  /** Qatlamning tekislanishi — uzun formalar uchun "start". */
  align?: "center" | "start";
  /** Qo'shimcha klasslar (masalan boshqa `z-index`). */
  className?: string;
}

export function ModalLayer({
  open,
  onClose,
  label,
  children,
  dismissable = true,
  align = "center",
  className = "",
}: ModalLayerProps) {
  const panelRef = useModalA11y<HTMLDivElement>({ open, onClose, dismissable });

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 flex justify-center p-4 animate-fade-in ${
        align === "start" ? "items-start overflow-y-auto sm:p-8" : "items-center"
      } ${className}`}
      style={{
        zIndex: "var(--z-backdrop, 100)",
        background: "rgba(6,10,15,0.55)",
        backdropFilter: "blur(4px)",
      }}
      onMouseDown={(e) => {
        // `mousedown`, `click` emas: forma ichida bosib, sichqonchani fon
        // ustida qo'yib yuborish oynani yopib yuborardi.
        if (e.target === e.currentTarget && dismissable) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={align === "start" ? "my-auto w-full flex justify-center outline-none" : "outline-none"}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

export default ModalLayer;
