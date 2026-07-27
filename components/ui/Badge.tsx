"use client";

import React from "react";

/**
 * BADGE — holat chipi.
 *
 * Loyihada 5 xil badge tizimi yonma-yon yashaydi: `.c1-badge` (999px radius),
 * `rounded-lg`, `rounded-full`, to'rt xil padding va uch xil font og'irligi.
 * Ulardan biri `py-0.2` yozadi — bu Tailwind'da mavjud bo'lmagan qadam, ya'ni
 * jim ravishda HECH NARSA hosil qilmaydi.
 *
 * Ranglar `--success/--warning/--danger/--info` tokenlaridan olinadi, `emerald-500`
 * kabi Tailwind palitrasidan emas — aks holda qorong'i rejimda kontrast buziladi.
 */

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const TONE: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: "var(--surface-2)", fg: "var(--text-secondary)" },
  success: { bg: "var(--success-bg)", fg: "var(--success)" },
  warning: { bg: "var(--warning-bg)", fg: "var(--warning)" },
  danger: { bg: "var(--danger-bg)", fg: "var(--danger)" },
  info: { bg: "var(--info-bg)", fg: "var(--info)" },
  brand: { bg: "var(--brand-ghost)", fg: "var(--brand)" },
};

export interface BadgeProps {
  tone?: BadgeTone;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ tone = "neutral", icon, children, className = "" }: BadgeProps) {
  const { bg, fg } = TONE[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-micro font-bold uppercase tracking-widest whitespace-nowrap ${className}`}
      style={{ background: bg, color: fg }}
    >
      {icon}
      {children}
    </span>
  );
}

export default Badge;
