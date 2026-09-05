"use client";

import React from "react";

/**
 * SECTION HEADER — sahifa ichidagi bo'lim belgisi.
 *
 * MUAMMO. Kassa sahifalari bir-birining ustiga terilgan kartochkalar to'plami
 * edi: balans kartasi, grafik kartasi, jurnal kartasi, hisobot kartasi — hammasi
 * bir xil og'irlikda. Ko'z qayerdan boshlashini bilmaydi, chunki sahifada
 * IERARXIYA yo'q — faqat ro'yxat bor. Buxgalter esa ekranni har doim bir xil
 * tartibda o'qiydi: avval "qancha pul bor", keyin "qayoqqa oqyapti", keyin
 * "nima qilay", keyin "bugun nima bo'ldi".
 *
 * Bu komponent shu tartibni KO'RINADIGAN qiladi: tartib raqami + CAPS yorliq +
 * sarlavha, ostida soch-chiziq. Raqam bezak emas — u o'qish yo'nalishini
 * beradi va bo'limlar orasidagi masofani oqlaydi.
 *
 * Sarlavha darajasi `h2` — sahifada bitta `h1` (`PageHeader`) turadi va
 * bo'limlar uning ostidagi qatlam.
 */

export interface SectionHeaderProps {
  /** Bo'lim tartibi — "01", "02". Berilmasa chiqmaydi. */
  step?: string;
  /** CAPS mikro yorliq — "BALANS", "PUL OQIMI". */
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  /** O'ngdagi amal(lar) yoki filtr. */
  actions?: React.ReactNode;
  className?: string;
}

export function SectionHeader({
  step,
  eyebrow,
  title,
  description,
  actions,
  className = "",
}: SectionHeaderProps) {
  return (
    <div
      className={`flex flex-wrap items-end justify-between gap-x-4 gap-y-2 pb-2 mb-3 ${className}`}
      style={{ borderBottom: "1px solid var(--rule)" }}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        {step && (
          <span
            aria-hidden
            className="font-mono text-micro font-semibold tabular-nums leading-none pt-1"
            style={{ color: "var(--text-muted)", opacity: 0.7 }}
          >
            {step}
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <div
              className="text-micro font-semibold uppercase mb-0.5"
              style={{ color: "var(--brand)", letterSpacing: "0.11em" }}
            >
              {eyebrow}
            </div>
          )}
          <h2
            className="text-body font-semibold leading-tight"
            style={{ color: "var(--text-primary)" }}
          >
            {title}
          </h2>
          {description && (
            <p className="text-micro mt-0.5" style={{ color: "var(--text-muted)" }}>
              {description}
            </p>
          )}
        </div>
      </div>

      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

export default SectionHeader;
