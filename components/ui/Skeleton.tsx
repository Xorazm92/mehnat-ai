"use client";

import React from "react";

/**
 * SKELETON — yuklanish holati.
 *
 * Loyihada skeleton umuman yo'q edi (`grep -i skeleton` → 0), va `.animate-shimmer`
 * ataylab o'chirilgan. Yuklanish beshta turli ko'rinishda: aylanuvchi `Loader2`,
 * pulsatsiyalanuvchi matn, oddiy markazlashgan paragraf, `<td colSpan>` xabari va
 * ba'zi joylarda umuman hech narsa — `PayrollTable` da esa yangi oy yuklanayotganda
 * ekranda O'TGAN oyning raqamlari turadi, go'yo ular joriy.
 *
 * `globals.css:1010` "ambient animatsiya — shovqin" deydi va bu to'g'ri. Lekin
 * yuklanish — ambient bezak emas, HOLAT; o'sha izohning o'zi "faqat holat
 * o'zgarishi" deb yozadi. Shuning uchun sekin `animate-pulse` ishlatiladi va u
 * global `prefers-reduced-motion` qoidasiga bo'ysunadi.
 */

export interface SkeletonProps {
  className?: string;
  /** Yumaloq (avatar uchun) */
  circle?: boolean;
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className = "", circle = false, width, height }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse ${circle ? "rounded-full" : "rounded-lg"} ${className}`}
      style={{ background: "var(--bg-sunken)", width, height: height ?? (className ? undefined : "1em") }}
    />
  );
}

/** Jadval uchun tayyor skeleton — ustun soni bo'yicha qatorlar chizadi. */
export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-label="Yuklanmoqda" className="w-full flex flex-col gap-px">
      <span className="sr-only">Yuklanmoqda…</span>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              height={12}
              className={c === 0 ? "flex-[2]" : "flex-1"}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
